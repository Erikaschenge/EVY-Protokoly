import { useState } from 'react';
import {
  DEFAULT_NDT_METHODS,
  evaluate,
  formatNumber,
  ndtResult,
  parseDecimal,
  quantityOf,
  requiredPhotos,
  ruleText,
} from '../lib/protocolLogic';
import type { Answer, FieldDef, NdtItem, ResultValue } from '../types';
import { PhotoButton, PhotoStrip, type QueuedPhoto } from './Photos';
import { DebouncedText } from './ui';

type Patch = Partial<Omit<Answer, 'photos' | 'fieldId'>>;

function Seg<T extends string | number>({
  options,
  value,
  onPick,
  disabled,
  label,
}: {
  options: { value: T; label: string; tone?: 'ok' | 'nok' | 'na' }[];
  value: T | undefined;
  onPick: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={value === o.value ? `active ${o.tone || ''}` : ''}
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onPick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NdtInput({ f, a, change, disabled }: { f: FieldDef; a?: Answer; change: (p: Patch) => void; disabled?: boolean }) {
  const q = quantityOf(f);
  const methods = f.options?.length ? f.options : DEFAULT_NDT_METHODS;
  const fallbackMethod = f.defaultMethod && methods.includes(f.defaultMethod) ? f.defaultMethod : methods[0];
  const items: NdtItem[] = Array.from({ length: q }, (_, i) => a?.items?.[i] || { method: fallbackMethod });
  const update = (i: number, patch: Partial<NdtItem>) => {
    const next = items.map((x, j) => (j === i ? { ...x, ...patch } : x));
    change({ items: next, result: ndtResult(next, q) });
  };
  return (
    <div className="ndtTable">
      {items.map((item, i) => (
        <div className="ndtRow" key={i}>
          <span className="ndtIndex">{q > 1 ? `Kus ${i + 1}` : 'Výsledok'}</span>
          <select
            value={item.method}
            disabled={disabled}
            aria-label={`Metóda – kus ${i + 1}`}
            onChange={(e) => update(i, { method: e.target.value })}
          >
            {methods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <Seg
            label={`Výsledok – kus ${i + 1}`}
            value={item.result}
            disabled={disabled}
            onPick={(v) => update(i, { result: v })}
            options={[
              { value: 'OK', label: 'OK', tone: 'ok' },
              { value: 'NOK', label: 'NOK', tone: 'nok' },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

export function Field({
  f,
  a,
  locked,
  change,
  addPhotos,
  removePhoto,
  queued,
  light,
  onError,
}: {
  f: FieldDef;
  a?: Answer;
  locked: boolean;
  change: (p: Patch) => void;
  addPhotos: (blobs: Blob[]) => Promise<void>;
  removePhoto: (url: string) => void;
  queued: QueuedPhoto[];
  light: (url: string) => void;
  onError: (message: string) => void;
}) {
  const [invalidNumber, setInvalidNumber] = useState(false);
  const photos = a?.photos || [];
  const needPhotos = requiredPhotos(f, a);
  const meta = [
    f.displayNumber,
    f.technicalLocation && `Lokácia ${f.technicalLocation}`,
    f.testPoint && `Bod ${f.testPoint}`,
    f.componentId && `Pozícia ${f.componentId}`,
    f.componentCode,
    f.materialNumber,
  ]
    .filter(Boolean)
    .join(' • ');
  const rule = ruleText(f);
  const textValue = typeof a?.value === 'string' ? a.value : '';
  const isNA = a?.result === 'NA';
  const naButton = f.allowNA && f.type !== 'ok_nok' && (
    <button
      type="button"
      className={`naToggle${isNA ? ' active na' : ''}`}
      aria-pressed={isNA}
      disabled={locked}
      onClick={() => change(isNA ? { result: undefined } : { result: 'NA', value: undefined, items: undefined })}
    >
      N/A
    </button>
  );

  return (
    <article className={`field${a?.result === 'NOK' ? ' fail' : ''}${a?.result === 'OK' ? ' pass' : ''}`}>
      <div className="fieldhead">
        <b>
          {f.label}
          {f.required && <span className="requiredMark" title="Povinný bod"> *</span>}
        </b>
        {a?.result && <span className={`badge ${a.result.toLowerCase()}`}>{a.result === 'NA' ? 'N/A' : a.result}</span>}
      </div>
      {meta && <small className="fieldMeta">{meta}</small>}
      {f.help && <p className="fieldHelp">{f.help}</p>}
      {rule && <div className="ruleInfo">{rule}</div>}
      {!!f.referenceImages?.length && (
        <div className="refs">
          {f.referenceImages.map((img) => (
            <figure key={img.id}>
              <img src={img.dataUrl} alt={img.caption || img.name} onClick={() => light(img.dataUrl)} />
              {img.caption && <figcaption>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {f.type === 'ok_nok' && (
        <Seg<ResultValue>
          label={f.label}
          value={a?.result}
          disabled={locked}
          onPick={(v) => change({ value: v === 'NA' ? 'N/A' : v, result: v })}
          options={[
            { value: 'OK', label: 'OK', tone: 'ok' },
            { value: 'NOK', label: 'NOK', tone: 'nok' },
            ...(f.allowNA ? [{ value: 'NA' as const, label: 'N/A', tone: 'na' as const }] : []),
          ]}
        />
      )}

      {f.type === 'number' && !isNA && (
        <div className="measure">
          <DebouncedText
            ariaLabel={f.label}
            inputMode="decimal"
            value={typeof a?.value === 'number' ? formatNumber(a.value) : ''}
            disabled={locked}
            invalid={invalidNumber}
            onCommit={(raw) => {
              const n = parseDecimal(raw);
              if (n === null) return setInvalidNumber(true);
              setInvalidNumber(false);
              change({ value: n, result: n === undefined ? undefined : evaluate(f, n) });
            }}
          />
          <span>{f.unit}</span>
          {naButton}
        </div>
      )}
      {f.type === 'number' && isNA && <div className="measure">{naButton}</div>}
      {invalidNumber && <small className="required">Zadajte číslo, napr. 12,5. Hodnota nebola uložená.</small>}

      {(f.type === 'text' || f.type === 'multiline') && (
        <div className="measure">
          {!isNA && (
            <DebouncedText
              ariaLabel={f.label}
              multiline={f.type === 'multiline'}
              value={textValue}
              disabled={locked}
              onCommit={(v) => change({ value: v.trim() === '' ? undefined : v })}
            />
          )}
          {naButton}
        </div>
      )}

      {(f.type === 'date' || f.type === 'time' || f.type === 'datetime') && (
        <div className="measure">
          {!isNA && (
            <input
              aria-label={f.label}
              type={f.type === 'datetime' ? 'datetime-local' : f.type}
              value={textValue}
              disabled={locked}
              onChange={(e) => change({ value: e.target.value || undefined })}
            />
          )}
          {naButton}
        </div>
      )}

      {f.type === 'binary' && (
        <div className="measure">
          {!isNA && (
            <Seg<number>
              label={f.label}
              value={typeof a?.value === 'number' ? a.value : undefined}
              disabled={locked}
              onPick={(v) =>
                change({ value: v, result: f.expectedBinary === undefined ? undefined : f.expectedBinary === v ? 'OK' : 'NOK' })
              }
              options={[
                { value: 0, label: f.zeroMeaning ? `0 – ${f.zeroMeaning}` : '0' },
                { value: 1, label: f.oneMeaning ? `1 – ${f.oneMeaning}` : '1' },
              ]}
            />
          )}
          {naButton}
        </div>
      )}

      {f.type === 'single_choice' && (
        <div className="measure">
          {!isNA && (
            <select
              aria-label={f.label}
              value={textValue}
              disabled={locked}
              onChange={(e) => change({ value: e.target.value || undefined })}
            >
              <option value="">Vyberte</option>
              {f.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
          {naButton}
        </div>
      )}

      {f.type === 'ndt' && (
        <>
          {!isNA && <NdtInput f={f} a={a} change={change} disabled={locked} />}
          {naButton && <div className="measure">{naButton}</div>}
        </>
      )}

      {a?.result === 'NOK' && (
        <div className="defect">
          <DebouncedText
            ariaLabel="Popis nezhody"
            multiline
            placeholder="Popis nezhody"
            value={a.note || ''}
            disabled={locked}
            onCommit={(v) => change({ note: v.trim() === '' ? undefined : v })}
          />
        </div>
      )}

      <div className={`photoRow${needPhotos > photos.length ? ' needed' : ''}`}>
        {!locked && (
          <PhotoButton
            label={photos.length || queued.length ? 'Pridať ďalšiu fotografiu' : 'Pridať fotografiu'}
            required={needPhotos > 0}
            onPhotos={addPhotos}
            onError={onError}
          />
        )}
        <PhotoStrip photos={photos} queued={queued} onOpen={light} onRemove={removePhoto} disabled={locked} />
        {needPhotos > photos.length && (
          <small className="required">
            Povinná fotografia: minimálne {needPhotos}
            {queued.length ? ' (čaká sa na nahranie)' : ''}
          </small>
        )}
      </div>
    </article>
  );
}
