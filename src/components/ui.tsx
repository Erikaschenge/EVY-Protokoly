import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ProtocolStatus } from '../types';

export function Select({
  label,
  value,
  set,
  options,
  disabled,
  placeholder = 'Vyberte',
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
        {value && !options.includes(value) && <option>{value}</option>}
      </select>
    </label>
  );
}

export function Checks({
  label,
  values,
  selected,
  set,
}: {
  label: string;
  values: string[];
  selected: string[];
  set: (x: string[]) => void;
}) {
  const all = [...values, ...selected.filter((x) => !values.includes(x))];
  return (
    <fieldset>
      <legend>{label}</legend>
      {all.map((v) => (
        <label className="check" key={v}>
          <input
            type="checkbox"
            checked={selected.includes(v)}
            onChange={(e) => set(e.target.checked ? [...selected, v] : selected.filter((x) => x !== v))}
          />
          {v}
        </label>
      ))}
    </fieldset>
  );
}

const STATUS_LABEL: Record<ProtocolStatus, string> = {
  not_started: 'Nezačatý',
  in_progress: 'Rozpracovaný',
  review: 'Na overenie',
  closed: 'Uzatvorený',
};

export function Status({ value }: { value: ProtocolStatus }) {
  return <em className={`status ${value}`}>{STATUS_LABEL[value] || value}</em>;
}

export const TEMPLATE_STATUS_LABEL: Record<string, string> = { draft: 'Návrh', active: 'Aktívny', archived: 'Archívny' };

export function ErrorBox({ message, onClose }: { message?: string; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="error" role="alert">
      <span style={{ whiteSpace: 'pre-line' }}>{message}</span>
      {onClose && (
        <button type="button" className="linkButton" onClick={onClose} aria-label="Zavrieť správu">
          ×
        </button>
      )}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

export function NotFound({ what, back = '/', backLabel = 'Späť na úvod' }: { what: string; back?: string; backLabel?: string }) {
  return (
    <div className="notice">
      <p>{what} sa nenašiel. Mohol byť medzitým odstránený.</p>
      <Link to={back}>{backLabel}</Link>
    </div>
  );
}

export function Lightbox({ src, close }: { src: string; close: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="lightbox" onClick={close} role="dialog" aria-modal="true" aria-label="Zväčšená fotografia">
      <button type="button" aria-label="Zavrieť">
        ×
      </button>
      <img src={src} alt="Zväčšená fotografia" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/**
 * Textové pole, ktoré ukladá s oneskorením (nie pri každom stlačení klávesu).
 * Neuložená zmena sa uloží aj pri opustení poľa alebo odchode zo stránky.
 */
export function DebouncedText({
  value,
  onCommit,
  multiline,
  delay = 700,
  disabled,
  placeholder,
  inputMode,
  rows,
  ariaLabel,
  invalid,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  delay?: number;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
  rows?: number;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      commitRef.current(v);
    }
  };

  useEffect(() => {
    if (!focused.current && pending.current === null) setDraft(value);
  }, [value]);
  useEffect(() => () => flush(), []);

  const props = {
    value: draft,
    disabled,
    placeholder,
    'aria-label': ariaLabel,
    'aria-invalid': invalid || undefined,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush();
    },
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      pending.current = e.target.value;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
  };
  return multiline ? <textarea rows={rows || 3} {...props} /> : <input inputMode={inputMode} {...props} />;
}
