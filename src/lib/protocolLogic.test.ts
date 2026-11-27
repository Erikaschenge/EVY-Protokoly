import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../templates';
import type { Answer, FieldDef, Template } from '../types';
import {
  displayValue,
  evaluate,
  fieldsFor,
  isAnswered,
  missingItems,
  ndtResult,
  parseDecimal,
  ruleIsComplete,
  ruleText,
  validateTemplate,
} from './protocolLogic';

const num = (rule: FieldDef['rule'], extra: Partial<FieldDef> = {}): FieldDef => ({ id: 'n', section: 'S', label: 'Meranie', type: 'number', rule, ...extra });
const ans = (fieldId: string, a: Partial<Answer>): Answer => ({ fieldId, updatedAt: '', ...a });

describe('parseDecimal', () => {
  it('akceptuje čiarku aj bodku', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 1 200.75 ')).toBe(1200.75);
    expect(parseDecimal('-0,3')).toBe(-0.3);
  });
  it('rozlišuje prázdne a neplatné', () => {
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
});

describe('evaluate', () => {
  it('rozsah vrátane hraníc', () => {
    const f = num({ kind: 'range', min: 30, max: 70 });
    expect(evaluate(f, 30)).toBe('OK');
    expect(evaluate(f, 70)).toBe('OK');
    expect(evaluate(f, 70.01)).toBe('NOK');
  });
  it('tolerancia s chýbajúcou odchýlkou = 0 a zápornou mínus toleranciou', () => {
    expect(evaluate(num({ kind: 'tolerance', target: 6, minus: 1, plus: 1 }), 5)).toBe('OK');
    expect(evaluate(num({ kind: 'tolerance', target: 6, minus: -1, plus: 1 }), 5)).toBe('OK');
    expect(evaluate(num({ kind: 'tolerance', target: 6 }), 6.1)).toBe('NOK');
  });
  it('neúplné pravidlo sa nevyhodnocuje (nie je NOK)', () => {
    expect(ruleIsComplete({ kind: 'tolerance' })).toBe(false);
    expect(evaluate(num({ kind: 'tolerance' }), 5)).toBeUndefined();
    expect(evaluate(num({ kind: 'range', min: 1 }), 5)).toBeUndefined();
    expect(ruleText(num({ kind: 'range', min: 1 }))).toBe('');
  });
  it('rovnosť s desatinnými číslami', () => {
    expect(evaluate(num({ kind: 'eq', target: 0.3 }), 0.1 + 0.2)).toBe('OK');
  });
  it('ostré nerovnosti', () => {
    expect(evaluate(num({ kind: 'gt', min: 1 }), 1)).toBe('NOK');
    expect(evaluate(num({ kind: 'lt', max: 1 }), 0.99)).toBe('OK');
  });
});

describe('isAnswered / missingItems', () => {
  it('prázdny text sa nepočíta ako vyplnený', () => {
    const f: FieldDef = { id: 't', section: 'S', label: 'T', type: 'text', required: true };
    expect(isAnswered(f, ans('t', { value: '   ' }))).toBe(false);
    expect(isAnswered(f, ans('t', { value: 'x' }))).toBe(true);
  });
  it('NDT vyžaduje výsledok pre všetky kusy', () => {
    const f: FieldDef = { id: 'd', section: 'S', label: 'D', type: 'ndt', quantity: 2, required: true };
    expect(isAnswered(f, ans('d', { items: [{ method: 'UT', result: 'OK' }] }))).toBe(false);
    expect(isAnswered(f, ans('d', { items: [{ method: 'UT', result: 'OK' }, { method: 'UT', result: 'NOK' }] }))).toBe(true);
    expect(ndtResult([{ method: 'UT', result: 'OK' }, { method: 'UT', result: 'NOK' }], 2)).toBe('NOK');
    expect(ndtResult([{ method: 'UT', result: 'OK' }], 2)).toBeUndefined();
  });
  it('NOK s povinnou fotografiou bez fotky chýba; fotka vo fronte sa hlási zvlášť', () => {
    const t: Template = { ...seedTemplates[0], fields: [{ id: 'a', section: 'S', label: 'A', type: 'ok_nok', required: true, photoMode: 'on_fail', minPhotos: 1 }] };
    expect(missingItems(t, { a: ans('a', { result: 'NOK' }) })[0].reason).toBe('photo');
    expect(missingItems(t, { a: ans('a', { result: 'NOK' }) }, { a: 1 })[0].reason).toBe('photo_pending');
    expect(missingItems(t, { a: ans('a', { result: 'NOK', photos: ['u'] }) })).toHaveLength(0);
  });
  it('ukážková NDT šablóna sa dá vyplniť a uzavrieť', () => {
    const ndt = seedTemplates.find((t) => t.id === 'ndt-hv6-v1')!;
    const answers: Record<string, Answer> = {};
    for (const f of fieldsFor(ndt)) answers[f.id] = ans(f.id, { items: Array.from({ length: f.quantity || 1 }, () => ({ method: 'VT', result: 'OK' as const })), result: 'OK' });
    expect(missingItems(ndt, answers)).toHaveLength(0);
  });
});

describe('fieldsFor', () => {
  it('rozbalí body jednotky podľa vozidiel a opakovaní', () => {
    const drive = seedTemplates.find((t) => t.id === 'drive-v1')!;
    const ids = fieldsFor(drive).map((f) => f.id);
    expect(ids).toContain('d3::hv5');
    expect(ids).toContain('d3::hv6');
    const rep: Template = { ...drive, fields: [{ id: 'r', section: 'S', label: 'R', type: 'text', quantity: 3 }] };
    expect(fieldsFor(rep).map((f) => f.id)).toEqual(['r#1', 'r#2', 'r#3']);
  });
});

describe('displayValue', () => {
  it('tlačí nameranú hodnotu s jednotkou', () => {
    expect(displayValue(num({ kind: 'none' }, { unit: 'mm' }), ans('n', { value: 6.5, result: 'OK' }))).toBe('6,5 mm');
  });
});

describe('validateTemplate', () => {
  it('ukážkové šablóny sú platné', () => {
    for (const t of seedTemplates) expect(validateTemplate(t)).toEqual([]);
  });
  it('odhalí neúplné pravidlo, duplicitné ID a výber bez možností', () => {
    const t: Template = {
      ...seedTemplates[0],
      fields: [
        num({ kind: 'tolerance' }),
        num({ kind: 'range', min: 5, max: 1 }),
        { id: 'c', section: 'S', label: 'C', type: 'single_choice' },
      ],
    };
    const errors = validateTemplate(t);
    expect(errors.some((e) => e.includes('duplicitné ID'))).toBe(true);
    expect(errors.some((e) => e.includes('nemá vyplnené'))).toBe(true);
    expect(errors.some((e) => e.includes('minimum je väčšie'))).toBe(true);
    expect(errors.some((e) => e.includes('možnosť výberu'))).toBe(true);
  });
});
