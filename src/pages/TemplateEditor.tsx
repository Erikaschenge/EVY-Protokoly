import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox, Notice, NotFound } from '../components/ui';
import { useAction, useAsync } from '../lib/hooks';
import { now, uid } from '../lib/ids';
import { compressToDataUrl } from '../lib/images';
import { DEFAULT_NDT_METHODS, formatNumber, parseDecimal, ruleText, validateTemplate } from '../lib/protocolLogic';
import { defaultUnitSlots, singleVehicleSlot } from '../lib/templateDefaults';
import { templateRepo } from '../repository';
import type { EvalRule, FieldDef, FieldType, MeasuringMode, PhotoMode, RuleKind, Template, TemplateStatus } from '../types';

const TYPE_LABEL: Record<FieldType, string> = {
  ok_nok: 'OK / NOK / N/A',
  number: 'Číslo (meranie)',
  text: 'Text',
  multiline: 'Viacriadkový text',
  single_choice: 'Výber z možností',
  date: 'Dátum',
  time: 'Čas',
  datetime: 'Dátum a čas',
  binary: 'Stav 0/1',
  ndt: 'Defektoskopia (NDT)',
};
const RULE_LABEL: [RuleKind, string][] = [
  ['none', 'Bez automatického vyhodnotenia'],
  ['range', 'Rozsah od – do'],
  ['tolerance', 'Cieľ s toleranciou'],
  ['gte', 'Viac alebo rovné (≥)'],
  ['gt', 'Viac ako (>)'],
  ['lte', 'Menej alebo rovné (≤)'],
  ['lt', 'Menej ako (<)'],
  ['eq', 'Presne (=)'],
  ['manual', 'Ručné vyhodnotenie'],
];

function NumberInput({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : formatNumber(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const parsed = parseDecimal(text);
    if (parsed !== value && !(parsed === null && value === undefined)) setText(value === undefined ? '' : formatNumber(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label>
      {label}
      <input
        inputMode="decimal"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          setInvalid(n === null);
          if (n !== null) onChange(n);
        }}
      />
      {invalid && <small className="required">Zadajte číslo</small>}
    </label>
  );
}

function RuleEditor({ f, patch }: { f: FieldDef; patch: (p: Partial<FieldDef>) => void }) {
  const r: EvalRule = f.rule || { kind: 'none' };
  const set = (p: Partial<EvalRule>) => patch({ rule: { ...r, ...p } });
  const k = r.kind;
  return (
    <div className="numberRule">
      <label>
        Jednotka
        <input value={f.unit || ''} placeholder="napr. mm, Ω, MΩ, V, bar" onChange={(e) => patch({ unit: e.target.value || undefined })} />
      </label>
      <label>
        Podmienka
        <select value={k} onChange={(e) => patch({ rule: { kind: e.target.value as RuleKind } })}>
          {RULE_LABEL.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {(k === 'min' || k === 'max') && <option value={k}>{k === 'min' ? 'Minimum (≥)' : 'Maximum (≤)'}</option>}
        </select>
      </label>
      {(k === 'range' || k === 'gte' || k === 'gt' || k === 'min') && (
        <NumberInput label={k === 'range' ? 'Minimum' : 'Hraničná hodnota'} value={r.min} onChange={(v) => set({ min: v })} />
      )}
      {(k === 'range' || k === 'lte' || k === 'lt' || k === 'max') && (
        <NumberInput label={k === 'range' ? 'Maximum' : 'Hraničná hodnota'} value={r.max} onChange={(v) => set({ max: v })} />
      )}
      {(k === 'eq' || k === 'tolerance') && (
        <NumberInput label={k === 'eq' ? 'Požadovaná hodnota' : 'Cieľová hodnota'} value={r.target} onChange={(v) => set({ target: v })} />
      )}
      {k === 'tolerance' && (
        <>
          <NumberInput label="Mínusová tolerancia" value={r.minus} onChange={(v) => set({ minus: v === undefined ? undefined : Math.abs(v) })} />
          <NumberInput label="Plusová tolerancia" value={r.plus} onChange={(v) => set({ plus: v === undefined ? undefined : Math.abs(v) })} />
        </>
      )}
      <div className="rulePreview">{ruleText(f) || 'Predpis sa nebude automaticky vyhodnocovať.'}</div>
    </div>
  );
}

const splitOptions = (v: string) =>
  v
    .split(/[|\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function OptionsInput({ label, value, onChange, placeholder }: { label: string; value?: string[]; onChange: (v: string[] | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState((value || []).join(' | '));
  return (
    <label className="wide">
      {label}
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const list = splitOptions(e.target.value);
          onChange(list.length ? list : undefined);
        }}
      />
      <small>Možnosti oddeľte znakom |</small>
    </label>
  );
}

function blankTemplate(): Template {
  return {
    id: uid(),
    code: '',
    name: '',
    vehicleSeries: '',
    version: '1',
    status: 'draft',
    description: '',
    updatedAt: now(),
    header: {
      subjectType: 'single_vehicle',
      measuringMode: 'hidden',
      vehicleSlots: [singleVehicleSlot('Vozidlo')],
      templateEffectiveDate: new Date().toISOString().slice(0, 10),
    },
    fields: [],
    sectionImages: {},
  };
}

export function TemplateEditor() {
  const { id } = useParams();
  const n = useNavigate();
  const loaded = useAsync(() => (id ? templateRepo.get(id) : Promise.resolve(blankTemplate())), [id]);
  const [t, setT] = useState<Template>();
  const action = useAction();
  useEffect(() => {
    if (loaded.data) setT(loaded.data);
  }, [loaded.data]);

  if (loaded.loading || (loaded.data && !t))
    return (
      <Shell title="Editor protokolu">
        <Notice>Načítavam editor…</Notice>
      </Shell>
    );
  if (loaded.error)
    return (
      <Shell title="Editor protokolu">
        <ErrorBox message={loaded.error} />
      </Shell>
    );
  if (!t)
    return (
      <Shell title="Editor protokolu">
        <NotFound what="Protokol" back="/templates" backLabel="Späť na správu protokolov" />
      </Shell>
    );

  const wasActive = loaded.data?.status === 'active';
  const unit = t.vehicleSeries === 'UNIT';
  const patch = (fid: string, p: Partial<FieldDef>) => setT({ ...t, fields: t.fields.map((f) => (f.id === fid ? { ...f, ...p } : f)) });
  const sections = [...new Set(t.fields.map((f) => f.section).filter(Boolean))];
  const sectionImages = t.sectionImages || {};
  const slots = unit ? (t.header.vehicleSlots.length > 1 ? t.header.vehicleSlots : defaultUnitSlots()) : t.header.vehicleSlots;

  const addSectionImage = (section: string, files: FileList | null) =>
    action.run(async () => {
      const file = files?.[0];
      if (!file) return;
      const dataUrl = await compressToDataUrl(file);
      setT((cur) =>
        cur && {
          ...cur,
          sectionImages: { ...(cur.sectionImages || {}), [section]: [...(cur.sectionImages?.[section] || []), { id: uid(), name: file.name, dataUrl, caption: '' }] },
        },
      );
    });
  const addFieldImage = (fid: string, files: FileList | null) =>
    action.run(async () => {
      const file = files?.[0];
      if (!file) return;
      const dataUrl = await compressToDataUrl(file);
      setT((cur) =>
        cur && {
          ...cur,
          fields: cur.fields.map((f) =>
            f.id === fid ? { ...f, referenceImages: [...(f.referenceImages || []), { id: uid(), name: file.name, dataUrl, caption: '' }] } : f,
          ),
        },
      );
    });

  const changeType = (f: FieldDef, type: FieldType) =>
    patch(f.id, {
      type,
      rule: type === 'number' ? f.rule || { kind: 'none' } : undefined,
      options: type === 'single_choice' || type === 'ndt' ? f.options : undefined,
      allowNA: type === 'ok_nok' ? (f.allowNA ?? true) : f.allowNA,
    });

  const save = () =>
    action.run(async () => {
      const prepared: Template = {
        ...t,
        header: {
          ...t.header,
          subjectType: unit ? 'vehicle_unit' : 'single_vehicle',
          vehicleSlots: unit ? slots : [singleVehicleSlot(t.vehicleSeries === 'ALL' || !t.vehicleSeries ? 'Vozidlo' : t.vehicleSeries)],
        },
        fields: t.fields.map((f) => ({ ...f, scope: unit ? f.scope : 'inspection' })),
      };
      const problems = validateTemplate(prepared);
      if (problems.length) throw new Error(problems.slice(0, 10).join('\n') + (problems.length > 10 ? `\n… a ďalších ${problems.length - 10}.` : ''));
      await templateRepo.save(prepared);
      n('/templates');
    });

  return (
    <Shell title="Editor protokolu">
      {wasActive && (
        <Notice>
          Protokol je aktívny. Zmeny sa prejavia iba v novo vytvorených protokoloch – už existujúce protokoly majú uloženú pôvodnú verziu šablóny.
          Pri podstatnej zmene zvýšte číslo verzie.
        </Notice>
      )}
      <ErrorBox message={action.error} onClose={() => action.setError('')} />
      <div className="form grid2">
        <label>
          Kód *
          <input value={t.code} onChange={(e) => setT({ ...t, code: e.target.value })} />
        </label>
        <label>
          Názov *
          <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </label>
        <label>
          Príslušnosť šablóny
          <select value={t.vehicleSeries || ''} onChange={(e) => setT({ ...t, vehicleSeries: e.target.value })}>
            <option value="">Vyberte</option>
            {['HV5', 'VV5', 'VV6', 'HV6'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
            <option value="ALL">Všetky vozidlá</option>
            <option value="UNIT">Celá jednotka</option>
            {t.vehicleSeries && !['HV5', 'VV5', 'VV6', 'HV6', 'ALL', 'UNIT'].includes(t.vehicleSeries) && <option>{t.vehicleSeries}</option>}
          </select>
        </label>
        <label>
          Verzia
          <input value={t.version} onChange={(e) => setT({ ...t, version: e.target.value })} />
        </label>
        <label>
          Dátum účinnosti
          <input type="date" value={t.header.templateEffectiveDate} onChange={(e) => setT({ ...t, header: { ...t.header, templateEffectiveDate: e.target.value } })} />
        </label>
        <label>
          Podnadpis v tlači
          <input
            value={t.header.subtitle || ''}
            placeholder="napr. Vstupný / výstupný protokol"
            onChange={(e) => setT({ ...t, header: { ...t.header, subtitle: e.target.value || undefined } })}
          />
        </label>
        <label>
          Meradlá
          <select
            value={t.header.measuringMode}
            onChange={(e) => setT({ ...t, header: { ...t.header, measuringMode: e.target.value as MeasuringMode } })}
          >
            <option value="hidden">Nepoužívajú sa</option>
            <option value="optional">Voliteľné</option>
            <option value="required">Povinné pred uzatvorením</option>
          </select>
        </label>
        <label>
          Stav
          <select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value as TemplateStatus })}>
            <option value="draft">Návrh</option>
            <option value="active">Aktívny</option>
            <option value="archived">Archívny</option>
          </select>
        </label>
        <label className="wide">
          Popis
          <textarea rows={2} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
        </label>
      </div>

      <h2>Obrázky kapitol</h2>
      {sections.length === 0 && <Notice>Najprv pridajte kontrolný bod a zadajte názov kapitoly.</Notice>}
      {sections.map((sec) => (
        <section className="editorCard" key={sec}>
          <div className="chapterHead">
            <div>
              <strong>{sec}</strong>
              <small>Obrázok sa zobrazí vo veľkom formáte nad bodmi kapitoly.</small>
            </div>
            <label className="upload">
              Pridať obrázok kapitoly
              <input hidden type="file" accept="image/*" onChange={(e) => addSectionImage(sec, e.target.files)} />
            </label>
          </div>
          {(sectionImages[sec] || []).length > 0 && (
            <div className="chapterImages">
              {(sectionImages[sec] || []).map((x) => (
                <figure key={x.id}>
                  <img src={x.dataUrl} alt={x.caption || x.name} />
                  <input
                    placeholder="Popis obrázka"
                    value={x.caption || ''}
                    onChange={(e) =>
                      setT({ ...t, sectionImages: { ...sectionImages, [sec]: sectionImages[sec].map((y) => (y.id === x.id ? { ...y, caption: e.target.value } : y)) } })
                    }
                  />
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setT({ ...t, sectionImages: { ...sectionImages, [sec]: sectionImages[sec].filter((y) => y.id !== x.id) } })}
                  >
                    Odstrániť obrázok
                  </button>
                </figure>
              ))}
            </div>
          )}
        </section>
      ))}

      <h2>Kontrolné body ({t.fields.length})</h2>
      {t.fields.map((f, i) => (
        <section className="editorCard" key={f.id}>
          <div className="editGrid">
            <label>
              Sekcia
              <input value={f.section} onChange={(e) => patch(f.id, { section: e.target.value })} />
            </label>
            <label>
              Názov bodu
              <input value={f.label} onChange={(e) => patch(f.id, { label: e.target.value })} />
            </label>
            <label>
              Typ
              <select value={f.type} onChange={(e) => changeType(f, e.target.value as FieldType)}>
                {(Object.keys(TYPE_LABEL) as FieldType[]).map((x) => (
                  <option key={x} value={x}>
                    {TYPE_LABEL[x]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Číslo bodu
              <input value={f.displayNumber || ''} onChange={(e) => patch(f.id, { displayNumber: e.target.value || undefined })} />
            </label>
            <label className="wideField">
              Pomocný text
              <input value={f.help || ''} onChange={(e) => patch(f.id, { help: e.target.value || undefined })} />
            </label>
            <div className="checkRow">
              <label className="check">
                <input type="checkbox" checked={!!f.required} onChange={(e) => patch(f.id, { required: e.target.checked })} />
                Povinný
              </label>
              <label className="check">
                <input type="checkbox" checked={!!f.allowNA} onChange={(e) => patch(f.id, { allowNA: e.target.checked })} />
                Povoliť N/A
              </label>
            </div>

            {f.type === 'number' && <RuleEditor f={f} patch={(p) => patch(f.id, p)} />}
            {f.type === 'single_choice' && (
              <OptionsInput label="Možnosti výberu" value={f.options} placeholder="Vyhovel | Nevyhovel" onChange={(options) => patch(f.id, { options })} />
            )}
            {f.type === 'ndt' && (
              <>
                <OptionsInput
                  label="Metódy NDT"
                  value={f.options}
                  placeholder={DEFAULT_NDT_METHODS.join(' | ')}
                  onChange={(options) => patch(f.id, { options })}
                />
                <label>
                  Predvolená metóda
                  <select value={f.defaultMethod || ''} onChange={(e) => patch(f.id, { defaultMethod: e.target.value || undefined })}>
                    <option value="">Prvá v zozname</option>
                    {(f.options?.length ? f.options : DEFAULT_NDT_METHODS).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {f.type === 'binary' && (
              <>
                <label>
                  Očakávaný stav
                  <select
                    value={f.expectedBinary === undefined ? '' : String(f.expectedBinary)}
                    onChange={(e) => patch(f.id, { expectedBinary: e.target.value === '' ? undefined : (Number(e.target.value) as 0 | 1) })}
                  >
                    <option value="">Bez vyhodnotenia</option>
                    <option value="0">0</option>
                    <option value="1">1</option>
                  </select>
                </label>
                <label>
                  Význam stavu 0
                  <input value={f.zeroMeaning || ''} onChange={(e) => patch(f.id, { zeroMeaning: e.target.value || undefined })} />
                </label>
                <label>
                  Význam stavu 1
                  <input value={f.oneMeaning || ''} onChange={(e) => patch(f.id, { oneMeaning: e.target.value || undefined })} />
                </label>
              </>
            )}
            <label>
              {f.type === 'ndt' ? 'Počet kusov' : 'Počet opakovaní'}
              <input
                type="number"
                min={1}
                max={100}
                value={f.quantity ?? 1}
                onChange={(e) => patch(f.id, { quantity: e.target.value === '' ? undefined : Math.floor(Number(e.target.value)) })}
              />
            </label>
            {unit && (
              <label>
                Rozsah
                <select value={f.scope || 'inspection'} onChange={(e) => patch(f.id, { scope: e.target.value as FieldDef['scope'] })}>
                  <option value="inspection">Celý protokol</option>
                  <option value="all_vehicles">Každé vozidlo zvlášť</option>
                  <option value="selected_vehicles">Vybrané vozidlá</option>
                </select>
              </label>
            )}
            {unit && f.scope === 'selected_vehicles' && (
              <fieldset className="vehicleScope">
                <legend>Vybrané vozidlá</legend>
                {slots.map((slot) => (
                  <label className="check" key={slot.id}>
                    <input
                      type="checkbox"
                      checked={(f.vehicleSlotIds || []).includes(slot.id)}
                      onChange={(e) =>
                        patch(f.id, {
                          vehicleSlotIds: e.target.checked ? [...(f.vehicleSlotIds || []), slot.id] : (f.vehicleSlotIds || []).filter((x) => x !== slot.id),
                        })
                      }
                    />
                    {slot.label}
                  </label>
                ))}
              </fieldset>
            )}
            <label>
              Fotografia
              <select value={f.photoMode || 'optional'} onChange={(e) => patch(f.id, { photoMode: e.target.value as PhotoMode })}>
                <option value="optional">Nepovinná</option>
                <option value="always">Povinná vždy</option>
                <option value="on_fail">Povinná pri NOK</option>
              </select>
            </label>
            {f.photoMode && f.photoMode !== 'optional' && (
              <label>
                Min. počet fotografií
                <input
                  type="number"
                  min={1}
                  value={Math.max(1, f.minPhotos || 0)}
                  onChange={(e) => patch(f.id, { minPhotos: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                />
              </label>
            )}
          </div>
          {!!f.referenceImages?.length && (
            <div className="refs">
              {f.referenceImages.map((img) => (
                <figure key={img.id}>
                  <img src={img.dataUrl} alt={img.caption || img.name} />
                  <button
                    type="button"
                    className="danger small"
                    onClick={() => patch(f.id, { referenceImages: f.referenceImages!.filter((x) => x.id !== img.id) })}
                  >
                    Odstrániť
                  </button>
                </figure>
              ))}
            </div>
          )}
          <div className="editorActions">
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              aria-label="Posunúť vyššie"
              onClick={() => {
                const a = [...t.fields];
                const [x] = a.splice(i, 1);
                a.splice(i - 1, 0, x);
                setT({ ...t, fields: a });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="secondary"
              disabled={i === t.fields.length - 1}
              aria-label="Posunúť nižšie"
              onClick={() => {
                const a = [...t.fields];
                const [x] = a.splice(i, 1);
                a.splice(i + 1, 0, x);
                setT({ ...t, fields: a });
              }}
            >
              ↓
            </button>
            <label className="upload">
              Referenčný obrázok
              <input hidden type="file" accept="image/*" onChange={(e) => addFieldImage(f.id, e.target.files)} />
            </label>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm(`Zmazať bod „${f.label}“?`)) setT({ ...t, fields: t.fields.filter((x) => x.id !== f.id) });
              }}
            >
              Zmazať
            </button>
          </div>
        </section>
      ))}
      <div className="toolbar">
        <button
          type="button"
          onClick={() =>
            setT({
              ...t,
              fields: [
                ...t.fields,
                {
                  id: uid(),
                  section: t.fields[t.fields.length - 1]?.section || 'Nová sekcia',
                  label: 'Nový bod',
                  type: 'ok_nok',
                  required: true,
                  allowNA: true,
                  photoMode: 'on_fail',
                  minPhotos: 1,
                  scope: 'inspection',
                  referenceImages: [],
                },
              ],
            })
          }
        >
          + Pridať bod
        </button>
      </div>
      <div className="sticky">
        <button type="button" className="secondary" onClick={() => n('/templates')}>
          Zrušiť
        </button>
        <button type="button" onClick={save} disabled={action.busy}>
          {action.busy ? 'Ukladám…' : 'Uložiť šablónu'}
        </button>
      </div>
    </Shell>
  );
}
