import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PhotoButton, PhotoStrip, useQueuedPhotos } from '../components/Photos';
import { Shell } from '../components/Shell';
import { DebouncedText, ErrorBox, Lightbox, Notice, NotFound } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { useAction, useAsync } from '../lib/hooks';
import { requireWorker } from '../lib/worker';
import { findingRepo, trainsetRepo } from '../repository';
import type { Finding, FindingPriority, FindingStatus } from '../types';

const statusLabel: Record<FindingStatus, string> = {
  new: 'Nové',
  assigned: 'Pridelené',
  fixed: 'Odstránené pracovníkom',
  rejected: 'Vrátené na opravu',
  verified: 'Overené kontrolórom',
  closed: 'Uzatvorené',
};
const priorityLabel: Record<FindingPriority, string> = { critical: 'Kritická', high: 'Vysoká', medium: 'Stredná', low: 'Nízka' };
const categories = ['Interiér', 'Exteriér', 'Podvozok', 'Brzdy', 'Elektrická výzbroj', 'Klimatizácia', 'Dvere', 'WC', 'Stanovište', 'Dokumentácia', 'Iné'];
const isDone = (s: FindingStatus) => s === 'verified' || s === 'closed';

export function FindingsPage() {
  const n = useNavigate();
  const data = useAsync(() => Promise.all([findingRepo.list(), trainsetRepo.list()]), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const items = data.data?.[0] || [];
  const sets = data.data?.[1] || [];
  const filtered = items.filter((x) => {
    const set = sets.find((s) => s.id === x.trainsetId);
    const vehicle = set?.vehicles.find((v) => v.id === x.vehicleId);
    const hay = [x.number, x.labelNumber, x.location, x.category, x.description, set?.name, set?.orderNumber, vehicle?.roleCode].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase()) && (status === 'all' || x.status === status) && (priority === 'all' || x.priority === priority);
  });
  const open = items.filter((x) => !isDone(x.status)).length;
  return (
    <Shell title="Evidencia chýb vozňov">
      <section className="findingSummary">
        <div>
          <b>{open}</b>
          <span>otvorených</span>
        </div>
        <div>
          <b>{items.filter((x) => x.status === 'fixed').length}</b>
          <span>čaká na overenie</span>
        </div>
        <div>
          <b>{items.filter((x) => x.priority === 'critical' && !isDone(x.status)).length}</b>
          <span>kritických</span>
        </div>
        <button type="button" onClick={() => n('/findings/new')}>
          + Nová chyba
        </button>
      </section>
      <div className="findingFilters">
        <input aria-label="Hľadať" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Číslo chyby, nálepka, súprava, vozidlo, miesto…" />
        <select aria-label="Stav" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Všetky stavy</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Závažnosť" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="all">Všetky priority</option>
          {Object.entries(priorityLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox message={data.error} />
      {data.loading && !items.length && <Notice>Načítavam evidované chyby…</Notice>}
      <div className="findingList">
        {filtered.map((x) => {
          const set = sets.find((s) => s.id === x.trainsetId);
          const vehicle = set?.vehicles.find((v) => v.id === x.vehicleId);
          return (
            <button type="button" className="findingCard" key={x.id} onClick={() => n(`/findings/${x.id}`)}>
              <div className="findingIdentity">
                <strong>{x.number}</strong>
                {x.labelNumber && <span>Nálepka: {x.labelNumber}</span>}
                <small>
                  {set?.name || 'Neznáma súprava'} • {vehicle?.roleCode || 'Celá jednotka'} • {x.location}
                </small>
              </div>
              <div>
                <span className={`priority ${x.priority}`}>{priorityLabel[x.priority]}</span>
                <span className={`findingStatus ${x.status}`}>{statusLabel[x.status]}</span>
              </div>
            </button>
          );
        })}
        {!data.loading && !filtered.length && <div className="empty">Nenašli sa žiadne evidované chyby.</div>}
      </div>
    </Shell>
  );
}

export function FindingEditorPage() {
  const n = useNavigate();
  const setsData = useAsync(() => trainsetRepo.list(), []);
  const sets = setsData.data || [];
  const [trainsetId, setTrainsetId] = useState<string>();
  const [vehicleId, setVehicleId] = useState('');
  const [labelNumber, setLabelNumber] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<FindingPriority>('medium');
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [light, setLight] = useState<string>();
  const action = useAction();
  const selectedSetId = trainsetId ?? sets[0]?.id ?? '';
  const trainset = sets.find((x) => x.id === selectedSetId);
  const previews = useMemo(() => photos.map((b) => URL.createObjectURL(b)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const save = () =>
    action.run(async () => {
      if (!selectedSetId) throw new Error('Najprv vytvorte alebo vyberte súpravu.');
      if (!location.trim()) throw new Error('Vyplňte miesto chyby.');
      if (!description.trim()) throw new Error('Vyplňte stručný popis chyby.');
      const user = requireWorker();
      const id = await findingRepo.create(
        {
          labelNumber: labelNumber.trim(),
          trainsetId: selectedSetId,
          vehicleId: vehicleId || undefined,
          location: location.trim(),
          category,
          description: description.trim(),
          priority,
        },
        photos,
        user,
      );
      n(`/findings/${id}`, { replace: true });
    });

  return (
    <Shell title="Nová evidovaná chyba">
      <ErrorBox message={action.error || setsData.error} onClose={() => action.setError('')} />
      {!setsData.loading && !sets.length && <Notice>Nie je vytvorená žiadna súprava. Pred evidovaním chyby najprv vytvorte súpravu.</Notice>}
      <div className="form grid2">
        <label>
          Číslo chyby
          <input value="Pridelí sa pri uložení" readOnly disabled />
        </label>
        <label>
          Číslo fyzickej nálepky
          <input value={labelNumber} onChange={(e) => setLabelNumber(e.target.value)} placeholder="napr. TK-0047 alebo 0047" />
        </label>
        <label>
          Súprava
          <select
            value={selectedSetId}
            onChange={(e) => {
              setTrainsetId(e.target.value);
              setVehicleId('');
            }}
          >
            <option value="">Vyberte</option>
            {sets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} • {x.orderNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vozidlo
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Celá jednotka</option>
            {trainset?.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.roleCode} • {v.serialNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Miesto *
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="napr. oddiel cestujúcich, sedadlo 12" />
        </label>
        <label>
          Kategória
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Závažnosť
          <select value={priority} onChange={(e) => setPriority(e.target.value as FindingPriority)}>
            {Object.entries(priorityLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Stručný popis *
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Čo bolo zistené a kde presne sa chyba nachádza" />
        </label>
      </div>
      <section className="photoSection">
        <h2>Fotografie pred opravou</h2>
        <PhotoButton label="Pridať fotografie" onPhotos={(b) => setPhotos((p) => [...p, ...b])} onError={(m) => action.setError(m)} />
        <div className="findingPhotos">
          {previews.map((url, i) => (
            <figure key={url}>
              <img src={url} alt={`Fotografia ${i + 1}`} onClick={() => setLight(url)} />
              <button type="button" className="danger" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                Odstrániť
              </button>
            </figure>
          ))}
        </div>
      </section>
      <div className="sticky">
        <button type="button" className="secondary" onClick={() => n('/findings')}>
          Zrušiť
        </button>
        <button type="button" onClick={save} disabled={action.busy || !sets.length}>
          {action.busy ? 'Ukladám…' : 'Uložiť chybu'}
        </button>
      </div>
      {light && <Lightbox src={light} close={() => setLight(undefined)} />}
    </Shell>
  );
}

export function FindingDetailPage() {
  const { id = '' } = useParams();
  const n = useNavigate();
  const [state, setState] = useState<{ loading: boolean; item?: Finding | null; error?: string }>({ loading: true });
  const sets = useAsync(() => trainsetRepo.list(), []);
  const [note, setNote] = useState('');
  const [light, setLight] = useState<string>();
  const action = useAction();
  // Posledný zadaný popis opravy – pole sa ukladá pri opustení, tlačidlo ho musí vidieť hneď.
  const repairRef = useRef<string | null>(null);
  const queued = useQueuedPhotos(state.item ? `findings/${id}` : undefined, (field) => field[0]);
  useEffect(
    () =>
      findingRepo.subscribe(
        id,
        (item) => setState({ loading: false, item }),
        (e) => setState({ loading: false, error: errorMessage(e) }),
      ),
    [id],
  );

  if (state.loading)
    return (
      <Shell title="Načítavam">
        <Notice>Načítavam evidenčný list chyby…</Notice>
      </Shell>
    );
  if (state.error)
    return (
      <Shell title="Evidencia chýb">
        <ErrorBox message={state.error} />
      </Shell>
    );
  const item = state.item;
  if (!item)
    return (
      <Shell title="Evidencia chýb">
        <NotFound what="Evidenčný list chyby" back="/findings" backLabel="Späť na zoznam" />
      </Shell>
    );

  const trainset = (sets.data || []).find((x) => x.id === item.trainsetId);
  const vehicle = trainset?.vehicles.find((v) => v.id === item.vehicleId);
  const repairEditable = ['new', 'assigned', 'rejected'].includes(item.status);
  const lastFixer = [...item.history].reverse().find((h) => h.action === 'fixed')?.user;

  const changeStatus = (status: FindingStatus, defaultNote: string, check?: (user: string) => void) =>
    action.run(async () => {
      const user = requireWorker();
      check?.(user);
      await findingRepo.changeStatus(item, status, note.trim() || defaultNote, user);
      setNote('');
    });

  const deleteFinding = () =>
    action.run(async () => {
      const closedNote = isDone(item.status) ? ' Chyba je už overená/uzatvorená.' : '';
      if (!window.confirm(`Naozaj odstrániť chybu ${item.number} vrátane fotografií?${closedNote} Táto operácia sa nedá vrátiť späť.`)) return;
      await findingRepo.remove(item);
      n('/findings', { replace: true });
    });

  return (
    <Shell title={item.number}>
      <ErrorBox message={action.error} onClose={() => action.setError('')} />
      <div className="findingHeader">
        <div>
          <span className={`priority ${item.priority}`}>{priorityLabel[item.priority]}</span>
          <span className={`findingStatus ${item.status}`}>{statusLabel[item.status]}</span>
        </div>
        <div>
          <b>{trainset?.name || (sets.loading ? '…' : 'Neznáma súprava')}</b> • {vehicle?.roleCode || 'Celá jednotka'} • {item.location}
        </div>
        {item.labelNumber && (
          <div>
            Nálepka: <b>{item.labelNumber}</b>
          </div>
        )}
      </div>
      <div className="findingColumns">
        <section>
          <h2>Evidenčný list chyby</h2>
          <p>
            <b>Kategória:</b> {item.category}
          </p>
          {item.createdBy && (
            <p>
              <b>Zaevidoval:</b> {item.createdBy}
            </p>
          )}
          <p className="findingDescription">{item.description}</p>
          {!isDone(item.status) && (
            <PhotoButton
              label="Pridať fotografie pred opravou"
              onPhotos={(b) => findingRepo.addPhotos(item, 'beforePhotos', b)}
              onError={(m) => action.setError(m)}
            />
          )}
          <PhotoStrip
            large
            photos={item.beforePhotos}
            queued={queued.beforePhotos}
            onOpen={setLight}
            disabled={isDone(item.status)}
            onRemove={(url) => void action.run(() => findingRepo.removePhoto(item, 'beforePhotos', url))}
          />
        </section>
        <section>
          <h2>Odstránenie</h2>
          <DebouncedText
            multiline
            rows={4}
            ariaLabel="Popis vykonanej opravy"
            placeholder="Popis vykonanej opravy"
            value={item.repairDescription}
            disabled={!repairEditable}
            onCommit={(v) => {
              repairRef.current = v;
              findingRepo.saveRepairDescription(item, v).catch((e) => action.setError(errorMessage(e)));
            }}
          />
          {repairEditable && (
            <PhotoButton label="Pridať fotografie po oprave" onPhotos={(b) => findingRepo.addPhotos(item, 'afterPhotos', b)} onError={(m) => action.setError(m)} />
          )}
          <PhotoStrip
            large
            photos={item.afterPhotos}
            queued={queued.afterPhotos}
            onOpen={setLight}
            disabled={!repairEditable}
            onRemove={(url) => void action.run(() => findingRepo.removePhoto(item, 'afterPhotos', url))}
          />
        </section>
      </div>
      <section className="findingActions">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poznámka k zmene stavu" aria-label="Poznámka k zmene stavu" />
        {item.status === 'new' && (
          <button type="button" disabled={action.busy} onClick={() => changeStatus('assigned', 'Chyba pridelená na odstránenie')}>
            Prideliť
          </button>
        )}
        {repairEditable && (
          <button
            type="button"
            disabled={action.busy}
            onClick={() =>
              changeStatus('fixed', 'Označené ako odstránené', () => {
                if (!(repairRef.current ?? item.repairDescription).trim()) throw new Error('Doplňte popis vykonanej opravy.');
                if ((queued.afterPhotos || []).some((x) => x.state !== 'failed'))
                  throw new Error('Fotografie po oprave sa ešte nahrávajú. Počkajte na ich nahranie.');
              })
            }
          >
            Označiť ako odstránené
          </button>
        )}
        {item.status === 'fixed' && (
          <>
            <button type="button" disabled={action.busy} className="danger" onClick={() => changeStatus('rejected', 'Oprava vrátená na dopracovanie')}>
              Vrátiť na opravu
            </button>
            <button
              type="button"
              disabled={action.busy}
              onClick={() =>
                changeStatus('verified', 'Odstránenie overené kontrolórom', (user) => {
                  if (lastFixer && lastFixer.trim().toLowerCase() === user.trim().toLowerCase())
                    throw new Error(`Odstránenie nemôže overiť ten istý pracovník, ktorý ho vykonal (${lastFixer}).`);
                })
              }
            >
              Potvrdiť odstránenie
            </button>
          </>
        )}
        {item.status === 'verified' && (
          <button type="button" disabled={action.busy} onClick={() => changeStatus('closed', 'Evidenčný list chyby uzatvorený')}>
            Uzatvoriť
          </button>
        )}
        <button type="button" className="secondary" onClick={() => n('/findings')}>
          Späť na zoznam
        </button>
        <button type="button" className="danger" disabled={action.busy} onClick={deleteFinding}>
          Odstrániť chybu
        </button>
      </section>
      <section className="history">
        <h2>História</h2>
        {[...item.history].reverse().map((x) => (
          <div key={x.id}>
            <b>{x.action === 'created' ? 'Vytvorené' : statusLabel[x.action as FindingStatus]}</b>
            <span>
              {new Date(x.createdAt).toLocaleString('sk-SK')}
              {x.user ? ` • ${x.user}` : ''}
            </span>
            <p>{x.note}</p>
          </div>
        ))}
      </section>
      {light && <Lightbox src={light} close={() => setLight(undefined)} />}
    </Shell>
  );
}
