import { useEffect, useMemo, useState } from 'react';
import { compressFiles } from '../lib/images';
import { removeQueuedItem, subscribeQueueItems, type QueueItem, type UploadState } from '../services/uploadQueue';

export type QueuedPhoto = { id: string; url: string; state: UploadState; error?: string };

/** Fotografie dokumentu, ktoré ešte čakajú vo fronte, zoskupené podľa cieľového poľa. */
export function useQueuedPhotos(docPath: string | undefined, fieldKey: (field: string[]) => string): Record<string, QueuedPhoto[]> {
  const [items, setItems] = useState<QueueItem[]>([]);
  useEffect(() => {
    if (!docPath) return;
    return subscribeQueueItems((all) => setItems(all.filter((x) => x.docPath === docPath)));
  }, [docPath]);
  const urls = useMemo(() => items.map((x) => ({ item: x, url: URL.createObjectURL(x.blob) })), [items]);
  useEffect(() => () => urls.forEach((x) => URL.revokeObjectURL(x.url)), [urls]);
  return useMemo(() => {
    const out: Record<string, QueuedPhoto[]> = {};
    for (const { item, url } of urls) (out[fieldKey(item.field)] ||= []).push({ id: item.id, url, state: item.state, error: item.error });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);
}

const STATE_LABEL: Record<UploadState, string> = { pending: 'Čaká na nahranie', uploading: 'Nahráva sa…', failed: 'Nahranie zlyhalo' };

export function PhotoStrip({
  photos,
  queued = [],
  onOpen,
  onRemove,
  disabled,
  large,
}: {
  photos: string[];
  queued?: QueuedPhoto[];
  onOpen: (url: string) => void;
  onRemove?: (url: string) => void;
  disabled?: boolean;
  large?: boolean;
}) {
  if (!photos.length && !queued.length) return null;
  return (
    <div className={large ? 'findingPhotos' : 'thumbs'}>
      {photos.map((url, i) => (
        <figure key={url}>
          <img src={url} alt={`Fotografia ${i + 1}`} onClick={() => onOpen(url)} />
          {onRemove && !disabled && (
            <button
              type="button"
              className="danger small"
              onClick={() => {
                if (window.confirm('Odstrániť túto fotografiu?')) onRemove(url);
              }}
            >
              Odstrániť
            </button>
          )}
        </figure>
      ))}
      {queued.map((q) => (
        <figure key={q.id} className={`queued ${q.state}`}>
          <img src={q.url} alt="Fotografia čakajúca na nahranie" onClick={() => onOpen(q.url)} />
          <figcaption title={q.error}>{STATE_LABEL[q.state]}</figcaption>
          {!disabled && q.state !== 'uploading' && (
            <button type="button" className="danger small" onClick={() => void removeQueuedItem(q.id)}>
              Zrušiť
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}

/** Tlačidlo na pridanie fotografií – fotografie sa pred uložením zmenšia. */
export function PhotoButton({
  label,
  onPhotos,
  onError,
  disabled,
  required,
}: {
  label: string;
  onPhotos: (blobs: Blob[]) => void | Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`upload${disabled || busy ? ' disabled' : ''}`}>
      {busy ? 'Spracúvam fotografie…' : label}
      {required ? ' *' : ''}
      <input
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={disabled || busy}
        onChange={async (e) => {
          const input = e.target as HTMLInputElement;
          const files = input.files;
          setBusy(true);
          try {
            const blobs = await compressFiles(files);
            if (blobs.length) await onPhotos(blobs);
          } catch (error) {
            onError(error instanceof Error ? error.message : 'Fotografiu sa nepodarilo spracovať.');
          } finally {
            setBusy(false);
            input.value = '';
          }
        }}
      />
    </label>
  );
}
