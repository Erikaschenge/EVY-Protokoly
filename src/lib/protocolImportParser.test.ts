import { describe, expect, it } from 'vitest';
import { parseProtocolSheets, type SheetRow } from './protocolImportParser';

// Riadky zodpovedajú hárku „Polia“ v public/EVY-Predloha-importu-protokolu.xlsx
const base = {
  'Kód protokolu': '660.J-P.001.00',
  'Názov protokolu': 'Vizuálna kontrola vozidla',
  Popis: 'Príklad importovanej šablóny',
  Verzia: '1.0',
  'Stav šablóny': 'Návrh',
  'Rad vozidla': 'HV5',
  'Predmet protokolu': 'Jedno vozidlo',
  Meradlá: 'Voliteľné',
  'Platnosť od': '2026-11-09',
  Podnadpis: 'Kontrolný protokol',
};
const predloha: SheetRow[] = [
  { ...base, Sekcia: 'Identifikácia', Poradie: 1, 'Kontrolný bod': 'Kontrola označenia vozidla', 'Typ poľa': 'OK/NOK', Povinné: 'ÁNO', 'Povoliť N/A': 'NIE', 'Pravidlo vyhodnotenia': 'Bez pravidla', 'Režim fotografie': 'Pri nevyhovujúcom výsledku', 'Minimálny počet fotografií': 1, 'Rozsah kontroly': 'Kontrola' },
  { ...base, Sekcia: 'Rozmery', Poradie: 2, 'Kontrolný bod': 'Nameraná výška', 'Typ poľa': 'Číslo', Povinné: 'ÁNO', Jednotka: 'mm', 'Pravidlo vyhodnotenia': 'Rozsah', Minimum: 1000, Maximum: 1200, 'Režim fotografie': 'Voliteľná', 'Minimálny počet fotografií': 0, 'Rozsah kontroly': 'Kontrola' },
  { ...base, Sekcia: 'Záver', Poradie: 3, 'Kontrolný bod': 'Celkové vyhodnotenie', 'Typ poľa': 'Jedna možnosť', Povinné: 'ÁNO', Možnosti: 'Vyhovel|Nevyhovel', 'Pravidlo vyhodnotenia': 'Bez pravidla', 'Režim fotografie': 'Voliteľná', 'Rozsah kontroly': 'Kontrola' },
];

describe('parseProtocolSheets', () => {
  it('naimportuje oficiálnu predlohu (hárok Polia)', () => {
    const { template } = parseProtocolSheets({ Pokyny: [], Polia: predloha });
    expect(template.code).toBe('660.J-P.001.00');
    expect(template.vehicleSeries).toBe('HV5');
    expect(template.status).toBe('draft');
    expect(template.fields).toHaveLength(3);
    expect(template.fields[0]).toMatchObject({ type: 'ok_nok', required: true, photoMode: 'on_fail', minPhotos: 1 });
    expect(template.fields[1]).toMatchObject({ type: 'number', unit: 'mm', rule: { kind: 'range', min: 1000, max: 1200 } });
    expect(template.fields[2].options).toEqual(['Vyhovel', 'Nevyhovel']);
  });
  it('nahlási neznámy typ a chýbajúce hodnoty pravidla s číslom riadka', () => {
    const rows = [
      { ...predloha[0], 'Typ poľa': 'Neznámy' },
      { ...predloha[1], Maximum: '' },
    ];
    expect(() => parseProtocolSheets({ Polia: rows })).toThrow(/Riadok 2: neznáma hodnota „Neznámy“/);
    expect(() => parseProtocolSheets({ Polia: [predloha[1], { ...predloha[2], 'Pravidlo vyhodnotenia': '' }, { ...predloha[1], Maximum: '' }] })).toThrow(
      /nemá vyplnené všetky hodnoty/,
    );
  });
  it('odmietne súbor s viacerými kódmi protokolu', () => {
    expect(() => parseProtocolSheets({ Polia: [predloha[0], { ...predloha[1], 'Kód protokolu': 'INY' }] })).toThrow(/viac kódov/);
  });
  it('podporuje celú jednotku a vybrané vozidlá', () => {
    const rows = [{ ...predloha[0], 'Predmet protokolu': 'Celá jednotka', 'Rozsah kontroly': 'Vybrané vozidlá', 'Cieľové vozidlá': 'HV5|VV6' }];
    const { template } = parseProtocolSheets({ Polia: rows });
    expect(template.header.subjectType).toBe('vehicle_unit');
    expect(template.fields[0].vehicleSlotIds).toEqual(['hv5', 'vv6']);
  });
  it('podporuje starší formát Protokol + Body', () => {
    const { template } = parseProtocolSheets({
      Protokol: [{ 'Kód protokolu': 'X1', 'Názov protokolu': 'Starý' }],
      Body: [{ 'ID bodu': 'b1', 'Názov bodu': 'Bod', 'Typ poľa': 'OK/NOK' }],
    });
    expect(template.fields[0].id).toBe('b1');
  });
  it('bez hárku Polia vráti zrozumiteľnú chybu', () => {
    expect(() => parseProtocolSheets({ Hárok1: [] })).toThrow(/Polia/);
  });
});
