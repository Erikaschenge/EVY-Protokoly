import type { EvalRule, FieldDef, FieldScope, FieldType, MeasuringMode, PhotoMode, Template } from '../types';
import { uid } from './ids';
import { validateTemplate } from './protocolLogic';
import { defaultUnitSlots, singleVehicleSlot, UNIT_ROLES } from './templateDefaults';

export type SheetRow = Record<string, unknown>;
export type ImportResult = { template: Template; warnings: string[] };

/** Porovnávanie bez diakritiky a veľkosti písmen. */
export const norm = (v: unknown) =>
  text(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

function text(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
}

const TYPES: Record<string, FieldType> = {
  'ok/nok': 'ok_nok',
  cislo: 'number',
  text: 'text',
  'viacriadkovy text': 'multiline',
  'jedna moznost': 'single_choice',
  vyber: 'single_choice',
  datum: 'date',
  cas: 'time',
  'datum a cas': 'datetime',
  'stav 0/1': 'binary',
  ndt: 'ndt',
  defektoskopia: 'ndt',
  'vyrobne cislo': 'text',
  'bez vstupu': 'text',
};
const RULES: Record<string, EvalRule['kind']> = {
  'bez pravidla': 'none',
  rozsah: 'range',
  minimum: 'min',
  maximum: 'max',
  'viac ako': 'gt',
  'viac alebo rovne': 'gte',
  'menej ako': 'lt',
  'menej alebo rovne': 'lte',
  presne: 'eq',
  tolerancia: 'tolerance',
  'rucne vyhodnotenie': 'manual',
};
const PHOTO: Record<string, PhotoMode> = {
  volitelna: 'optional',
  nepovinna: 'optional',
  vzdy: 'always',
  'pri nok': 'on_fail',
  'pri nevyhovujucom vysledku': 'on_fail',
};
const SCOPE: Record<string, FieldScope> = {
  kontrola: 'inspection',
  'cely protokol': 'inspection',
  'vsetky vozidla': 'all_vehicles',
  'vybrane vozidla': 'selected_vehicles',
};
const MEASURING: Record<string, MeasuringMode> = { skryte: 'hidden', volitelne: 'optional', povinne: 'required' };
const ROW_TYPES: Record<string, NonNullable<FieldDef['rowType']>> = {
  'kontrolny bod': 'check',
  'meraci bod': 'measure',
  komponent: 'component',
  'dvojfazova kontrola': 'two_phase',
  'informacny blok': 'info',
  'zaverecne potvrdenie': 'final',
};

class RowReader {
  private map = new Map<string, unknown>();
  constructor(
    row: SheetRow,
    readonly rowNumber: number,
    private errors: string[],
  ) {
    for (const [k, v] of Object.entries(row)) this.map.set(norm(k), v);
  }
  raw(...names: string[]): unknown {
    for (const n of names) {
      const v = this.map.get(norm(n));
      if (v !== undefined && text(v) !== '') return v;
    }
    return undefined;
  }
  str(...names: string[]) {
    return text(this.raw(...names));
  }
  num(...names: string[]): number | undefined {
    const v = this.raw(...names);
    if (v === undefined) return undefined;
    if (typeof v === 'number') return v;
    const n = Number(text(v).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) {
      this.errors.push(`Riadok ${this.rowNumber}: „${names[0]}“ musí byť číslo (zadané „${text(v)}“).`);
      return undefined;
    }
    return n;
  }
  error(message: string) {
    this.errors.push(`Riadok ${this.rowNumber}: ${message}`);
  }
  yes(...names: string[]) {
    return ['ano', 'true', '1', 'x'].includes(norm(this.raw(...names)));
  }
  pick<T>(table: Record<string, T>, fallback: T, ...names: string[]): T {
    const v = this.raw(...names);
    if (v === undefined) return fallback;
    const found = table[norm(v)];
    if (found === undefined) {
      this.errors.push(`Riadok ${this.rowNumber}: neznáma hodnota „${text(v)}“ v stĺpci „${names[0]}“.`);
      return fallback;
    }
    return found;
  }
}

function findSheet(sheets: Record<string, SheetRow[]>, name: string): SheetRow[] | undefined {
  const key = Object.keys(sheets).find((k) => norm(k) === name);
  return key ? sheets[key] : undefined;
}

function readField(r: RowReader, index: number, unit: boolean): FieldDef {
  const type = r.pick(TYPES, 'text', 'Typ poľa');
  const ruleKind = type === 'number' ? r.pick(RULES, 'none', 'Pravidlo vyhodnotenia') : 'none';
  const options = r.str('Možnosti');
  const targets = r
    .str('Cieľové vozidlá')
    .split(/[|,;]/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  const scope = unit ? r.pick(SCOPE, 'inspection', 'Rozsah kontroly') : 'inspection';
  const unknownTargets = targets.filter((x) => !(UNIT_ROLES as readonly string[]).includes(x));
  if (unknownTargets.length) r.error(`neznáme cieľové vozidlo ${unknownTargets.join(', ')} (povolené: ${UNIT_ROLES.join(', ')}).`);
  const expectedBinary = r.num('Očakávaný stav 0/1');
  return {
    id: r.str('ID bodu') || uid(),
    rowType: r.pick(ROW_TYPES, 'check', 'Typ riadka'),
    section: r.str('Sekcia') || 'Kontrola',
    displayNumber: r.str('Číslo bodu') || undefined,
    label: r.str('Kontrolný bod', 'Názov bodu') || `Bod ${index + 1}`,
    help: r.str('Pomocný text') || undefined,
    type,
    required: r.yes('Povinné'),
    allowNA: r.yes('Povoliť N/A'),
    unit: r.str('Jednotka') || undefined,
    options: options ? options.split('|').map((x) => x.trim()).filter(Boolean) : undefined,
    rule: {
      kind: ruleKind,
      min: r.num('Minimum'),
      max: r.num('Maximum'),
      target: r.num('Cieľová hodnota'),
      minus: r.num('Mínusová tolerancia'),
      plus: r.num('Plusová tolerancia'),
    },
    photoMode: r.pick(PHOTO, 'optional', 'Režim fotografie'),
    minPhotos: r.num('Minimálny počet fotografií') ?? 0,
    scope,
    vehicleSlotIds: scope === 'selected_vehicles' ? targets.map((x) => x.toLowerCase()) : undefined,
    quantity: r.num('Množstvo', 'Množstvo opakovaní'),
    defaultMethod: r.str('Predvolená metóda') || undefined,
    componentId: r.str('Pozičné ID') || undefined,
    componentCode: r.str('Katalógové číslo') || undefined,
    materialNumber: r.str('Materiálové číslo') || undefined,
    technicalLocation: r.str('Technická lokácia') || undefined,
    testPoint: r.str('Bod skúšky') || undefined,
    expectedText: r.str('Textový predpis') || undefined,
    manualResult: r.yes('Ručné potvrdenie výsledku') || undefined,
    expectedBinary: expectedBinary === 0 || expectedBinary === 1 ? expectedBinary : undefined,
    zeroMeaning: r.str('Význam stavu 0') || undefined,
    oneMeaning: r.str('Význam stavu 1') || undefined,
    referenceImages: [],
  };
}

/**
 * Prevedie hárky Excelu na šablónu. Podporuje predlohu (hárok „Polia“, jeden riadok = jeden bod)
 * aj starší formát (hárky „Protokol“ a „Body“). Pri chybe vyhodí Error so zoznamom problémov.
 */
export function parseProtocolSheets(sheets: Record<string, SheetRow[]>): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const polia = findSheet(sheets, 'polia');
  const legacyHeader = findSheet(sheets, 'protokol');
  const legacyBody = findSheet(sheets, 'body');

  let headerRow: RowReader;
  let rows: { reader: RowReader; order: number }[];
  if (polia) {
    const data = polia
      .map((row, i) => new RowReader(row, i + 2, errors))
      .filter((r) => r.str('Kontrolný bod', 'Názov bodu') || r.str('Typ poľa'));
    if (!data.length) throw new Error('Hárok „Polia“ neobsahuje žiadny kontrolný bod.');
    headerRow = data[0];
    const codes = new Set(data.map((r) => r.str('Kód protokolu')).filter(Boolean));
    if (codes.size > 1) errors.push(`Súbor obsahuje viac kódov protokolu (${[...codes].join(', ')}). Jeden súbor = jeden protokol.`);
    rows = data.map((reader, i) => ({ reader, order: reader.num('Poradie') ?? i + 1 }));
  } else if (legacyHeader && legacyBody) {
    if (!legacyHeader.length) throw new Error('Hárok „Protokol“ neobsahuje údaje.');
    headerRow = new RowReader(legacyHeader[0], 2, errors);
    rows = legacyBody
      .map((row, i) => new RowReader(row, i + 2, errors))
      .filter((r) => r.str('ID bodu') || r.str('Názov bodu', 'Kontrolný bod'))
      .map((reader, i) => ({ reader, order: reader.num('Poradie') ?? i + 1 }));
    if (!rows.length) throw new Error('Hárok „Body“ neobsahuje žiadny kontrolný bod.');
  } else {
    throw new Error('Súbor neobsahuje hárok „Polia“. Použite predlohu „Stiahnuť predlohu“.');
  }

  const code = headerRow.str('Kód protokolu');
  const name = headerRow.str('Názov protokolu');
  if (!code) errors.push('Chýba „Kód protokolu“.');
  if (!name) errors.push('Chýba „Názov protokolu“.');
  const unit = norm(headerRow.raw('Predmet protokolu', 'Rozsah protokolu')) === 'cela jednotka';
  const seriesRaw = headerRow.str('Rad vozidla', 'Určené pre vozidlo');
  const vehicleSeries = unit ? 'UNIT' : !seriesRaw || norm(seriesRaw) === 'vsetky typy' ? 'ALL' : seriesRaw;
  const fields = rows.sort((a, b) => a.order - b.order).map(({ reader }, i) => readField(reader, i, unit));
  const effective = headerRow.raw('Platnosť od');
  const template: Template = {
    id: uid(),
    code,
    name,
    description: headerRow.str('Popis'),
    version: headerRow.str('Verzia') || '1.0',
    status: 'draft',
    vehicleSeries,
    header: {
      subjectType: unit ? 'vehicle_unit' : 'single_vehicle',
      measuringMode: headerRow.pick(MEASURING, 'optional', 'Meradlá', 'Režim meradiel'),
      vehicleSlots: unit ? defaultUnitSlots() : [singleVehicleSlot(vehicleSeries === 'ALL' ? 'Vozidlo' : vehicleSeries)],
      templateEffectiveDate: effective ? text(effective) : new Date().toISOString().slice(0, 10),
      subtitle: headerRow.str('Podnadpis') || undefined,
    },
    fields,
    sectionImages: {},
    updatedAt: new Date().toISOString(),
  };
  errors.push(...validateTemplate(template));
  if (errors.length) {
    const shown = errors.slice(0, 12);
    throw new Error(
      `Import sa nepodaril:\n${shown.join('\n')}${errors.length > shown.length ? `\n… a ďalších ${errors.length - shown.length} problémov.` : ''}`,
    );
  }
  if (headerRow.str('Stav šablóny') && norm(headerRow.str('Stav šablóny')) !== 'navrh')
    warnings.push('Protokol bol importovaný ako návrh. Po kontrole ho v editore prepnite na Aktívny.');
  return { template, warnings };
}
