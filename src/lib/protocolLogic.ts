import type { Answer, EvalRule, FieldDef, NdtItem, ProtocolInstance, ProtocolSummary, Template } from '../types';

export const DEFAULT_NDT_METHODS = ['VT', 'MT', 'UT', 'PT'];
const MAX_QUANTITY = 100;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export const formatNumber = (n: number) => String(n).replace('.', ',');

export function quantityOf(f: FieldDef): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(f.quantity || 1)));
}

/** Rozbalí body šablóny na konkrétne vyplňované polia (podľa vozidiel jednotky a počtu opakovaní). */
export function fieldsFor(t: Template): FieldDef[] {
  return t.fields.flatMap((f) => {
    let expanded: FieldDef[] = [f];
    if (t.header.subjectType === 'vehicle_unit') {
      const slots =
        f.scope === 'all_vehicles'
          ? t.header.vehicleSlots
          : f.scope === 'selected_vehicles'
            ? t.header.vehicleSlots.filter((s) => f.vehicleSlotIds?.includes(s.id))
            : [];
      if (slots.length) {
        expanded = slots.map((slot) => ({
          ...f,
          id: `${f.id}::${slot.id}`,
          label: `${f.label} – ${slot.label}`,
          vehicleSlotIds: [slot.id],
        }));
      }
    }
    // NDT má opakovanie riešené vo vnútri jedného bodu (riadky kusov).
    const q = f.type === 'ndt' ? 1 : quantityOf(f);
    if (q <= 1) return expanded;
    return expanded.flatMap((x) =>
      Array.from({ length: q }, (_, i) => ({ ...x, id: `${x.id}#${i + 1}`, label: `${x.label} (${i + 1}/${q})`, quantity: 1 })),
    );
  });
}

/** Prevedie text na číslo. Akceptuje desatinnú čiarku aj bodku. undefined = prázdne, null = neplatné. */
export function parseDecimal(raw: string): number | undefined | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return undefined;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const almostEqual = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const gte = (a: number, b: number) => a > b || almostEqual(a, b);
const lte = (a: number, b: number) => a < b || almostEqual(a, b);

/** Je pravidlo úplne zadané? Neúplné pravidlo sa nevyhodnocuje automaticky (nie je to NOK). */
export function ruleIsComplete(r?: EvalRule): boolean {
  if (!r) return false;
  switch (r.kind) {
    case 'range':
      return isNum(r.min) && isNum(r.max);
    case 'min':
    case 'gte':
    case 'gt':
      return isNum(r.min);
    case 'max':
    case 'lte':
    case 'lt':
      return isNum(r.max);
    case 'eq':
    case 'tolerance':
      return isNum(r.target);
    default:
      return false;
  }
}

export function toleranceBounds(r: EvalRule): [number, number] {
  return [r.target! - Math.abs(r.minus ?? 0), r.target! + Math.abs(r.plus ?? 0)];
}

export function evaluate(f: FieldDef, value: number | undefined): 'OK' | 'NOK' | undefined {
  const r = f.rule;
  if (!isNum(value) || !r || !ruleIsComplete(r)) return undefined;
  switch (r.kind) {
    case 'range':
      return gte(value, r.min!) && lte(value, r.max!) ? 'OK' : 'NOK';
    case 'min':
    case 'gte':
      return gte(value, r.min!) ? 'OK' : 'NOK';
    case 'gt':
      return value > r.min! && !almostEqual(value, r.min!) ? 'OK' : 'NOK';
    case 'max':
    case 'lte':
      return lte(value, r.max!) ? 'OK' : 'NOK';
    case 'lt':
      return value < r.max! && !almostEqual(value, r.max!) ? 'OK' : 'NOK';
    case 'eq':
      return almostEqual(value, r.target!) ? 'OK' : 'NOK';
    case 'tolerance': {
      const [lo, hi] = toleranceBounds(r);
      return gte(value, lo) && lte(value, hi) ? 'OK' : 'NOK';
    }
    default:
      return undefined;
  }
}

export function ruleText(f: FieldDef): string {
  if (f.expectedText) return `Predpis: ${f.expectedText}`;
  const r = f.rule;
  if (!r || !ruleIsComplete(r)) return '';
  const u = f.unit ? ` ${f.unit}` : '';
  const n = formatNumber;
  switch (r.kind) {
    case 'range':
      return `Predpis: ${n(r.min!)} – ${n(r.max!)}${u}`;
    case 'min':
    case 'gte':
      return `Predpis: ≥ ${n(r.min!)}${u}`;
    case 'gt':
      return `Predpis: > ${n(r.min!)}${u}`;
    case 'max':
    case 'lte':
      return `Predpis: ≤ ${n(r.max!)}${u}`;
    case 'lt':
      return `Predpis: < ${n(r.max!)}${u}`;
    case 'eq':
      return `Predpis: = ${n(r.target!)}${u}`;
    case 'tolerance':
      return `Predpis: ${n(r.target!)}${u} (−${n(Math.abs(r.minus ?? 0))} / +${n(Math.abs(r.plus ?? 0))})`;
    default:
      return '';
  }
}

export function ndtResult(items: NdtItem[], quantity: number): 'OK' | 'NOK' | undefined {
  const rows = items.slice(0, quantity);
  if (rows.some((x) => x.result === 'NOK')) return 'NOK';
  if (rows.length >= quantity && rows.every((x) => x.result === 'OK')) return 'OK';
  return undefined;
}

export function isAnswered(f: FieldDef, a?: Answer): boolean {
  if (!a) return false;
  if (a.result === 'NA') return true;
  switch (f.type) {
    case 'ok_nok':
      return a.result === 'OK' || a.result === 'NOK';
    case 'binary':
      return a.value === 0 || a.value === 1;
    case 'number':
      return isNum(a.value);
    case 'ndt': {
      const q = quantityOf(f);
      const items = a.items || [];
      return items.length >= q && items.slice(0, q).every((x) => x.result === 'OK' || x.result === 'NOK');
    }
    default:
      return typeof a.value === 'string' && a.value.trim() !== '';
  }
}

/** Koľko fotografií je pre bod povinných pri danej odpovedi. */
export function requiredPhotos(f: FieldDef, a?: Answer): number {
  const min = Math.max(1, Math.floor(f.minPhotos || 0));
  if (f.photoMode === 'always') return a?.result === 'NA' ? 0 : min;
  if (f.photoMode === 'on_fail' && a?.result === 'NOK') return min;
  return 0;
}

export type MissingItem = { field: FieldDef; reason: 'answer' | 'photo' | 'photo_pending' };

export function missingItems(t: Template, answers: Record<string, Answer>, pendingPhotos: Record<string, number> = {}): MissingItem[] {
  return missingForFields(fieldsFor(t), answers, pendingPhotos);
}

/** Kontrola úplnosti pre už rozbalené polia (výsledok fieldsFor). */
export function missingForFields(
  fields: FieldDef[],
  answers: Record<string, Answer>,
  pendingPhotos: Record<string, number> = {},
): MissingItem[] {
  const result: MissingItem[] = [];
  for (const f of fields) {
    const a = answers[f.id];
    if (f.required && !isAnswered(f, a)) {
      result.push({ field: f, reason: 'answer' });
      continue;
    }
    const need = requiredPhotos(f, a);
    const have = a?.photos?.length || 0;
    if (need > have) result.push({ field: f, reason: have + (pendingPhotos[f.id] || 0) >= need ? 'photo_pending' : 'photo' });
  }
  return result;
}

export function nokCount(p: Pick<ProtocolInstance, 'answers'>): number {
  return Object.values(p.answers || {}).filter((a) => a.result === 'NOK').length;
}

export function summarize(p: ProtocolInstance): ProtocolSummary {
  return {
    id: p.id,
    templateId: p.templateId,
    templateCode: p.templateSnapshot?.code || '',
    templateName: p.templateSnapshot?.name || 'Neznáma šablóna',
    templateMissing: p.templateSnapshot ? undefined : true,
    vehicleId: p.vehicleId,
    order: p.order,
    status: p.status,
    nok: nokCount(p),
    protocolNumber: p.protocolNumber || '',
    updatedAt: p.updatedAt,
  };
}

const formatDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : v;
};

/** Textová hodnota pre tlač a prehľady. */
export function displayValue(f: FieldDef, a?: Answer): string {
  if (!a) return '';
  if (a.result === 'NA') return 'N/A';
  switch (f.type) {
    case 'ok_nok':
      return a.result || '';
    case 'number':
      return isNum(a.value) ? `${formatNumber(a.value)}${f.unit ? ` ${f.unit}` : ''}` : '';
    case 'binary': {
      if (a.value !== 0 && a.value !== 1) return '';
      const meaning = a.value === 0 ? f.zeroMeaning : f.oneMeaning;
      return `${a.value}${meaning ? ` (${meaning})` : ''}`;
    }
    case 'ndt':
      return (a.items || [])
        .slice(0, quantityOf(f))
        .map((x, i) => `${i + 1}: ${x.method} ${x.result || '–'}${x.note ? ` (${x.note})` : ''}`)
        .join('; ');
    case 'date':
      return typeof a.value === 'string' ? formatDate(a.value) : '';
    case 'datetime':
      return typeof a.value === 'string' ? `${formatDate(a.value)} ${a.value.slice(11, 16)}`.trim() : '';
    default:
      return a.value === undefined ? '' : String(a.value);
  }
}

/** Kontrola šablóny pred uložením. Vráti zoznam problémov; prázdny zoznam = v poriadku. */
export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  if (!t.code.trim()) errors.push('Vyplňte kód protokolu.');
  if (!t.name.trim()) errors.push('Vyplňte názov protokolu.');
  if (t.status === 'active' && !t.fields.length) errors.push('Aktívny protokol musí mať aspoň jeden bod.');
  const seen = new Set<string>();
  t.fields.forEach((f, i) => {
    const where = `Bod ${i + 1}${f.label ? ` „${f.label}“` : ''}`;
    if (seen.has(f.id)) errors.push(`${where}: duplicitné ID bodu „${f.id}“.`);
    seen.add(f.id);
    if (!f.label.trim()) errors.push(`${where}: chýba názov bodu.`);
    if (!f.section.trim()) errors.push(`${where}: chýba sekcia.`);
    if (f.type === 'single_choice' && !f.options?.length)
      errors.push(`${where}: zadajte aspoň jednu možnosť výberu.`);
    if (f.type === 'number' && f.rule && f.rule.kind !== 'none' && f.rule.kind !== 'manual') {
      if (!ruleIsComplete(f.rule)) errors.push(`${where}: pravidlo vyhodnotenia nemá vyplnené všetky hodnoty.`);
      else if (f.rule.kind === 'range' && f.rule.min! > f.rule.max!) errors.push(`${where}: minimum je väčšie ako maximum.`);
    }
    if (f.quantity !== undefined && (!Number.isInteger(f.quantity) || f.quantity < 1 || f.quantity > MAX_QUANTITY))
      errors.push(`${where}: počet opakovaní musí byť celé číslo 1 – ${MAX_QUANTITY}.`);
    if (f.minPhotos !== undefined && (f.minPhotos < 0 || !Number.isInteger(f.minPhotos)))
      errors.push(`${where}: minimálny počet fotografií musí byť celé nezáporné číslo.`);
    if (t.header.subjectType === 'vehicle_unit' && f.scope === 'selected_vehicles' && !f.vehicleSlotIds?.length)
      errors.push(`${where}: vyberte aspoň jedno vozidlo.`);
  });
  return errors;
}
