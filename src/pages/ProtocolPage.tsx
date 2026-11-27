import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { useQueuedPhotos } from '../components/Photos';
import { Shell } from '../components/Shell';
import { DebouncedText, ErrorBox, Lightbox, Notice, NotFound, Select, Status } from '../components/ui';
import { dictionaries as d } from '../dictionaries';
import { errorMessage } from '../lib/errors';
import { useAction, useAsync } from '../lib/hooks';
import { uid } from '../lib/ids';
import { fieldsFor, missingForFields, missingItems } from '../lib/protocolLogic';
import { getWorker, requireWorker } from '../lib/worker';
import { protocolDocPath, protocolRepo, trainsetRepo } from '../repository';
import type { FieldDef, MeasuringDevice, ProtocolInstance } from '../types';

function useProtocol(sid: string, pid: string) {
  const [state, setState] = useState<{ loading: boolean; p?: ProtocolInstance | null; error?: string }>({ loading: true });
  useEffect(() => {
    setState({ loading: true });
    return protocolRepo.subscribe(
      sid,
      pid,
      (p) => setState({ loading: false, p }),
      (e) => setState({ loading: false, error: errorMessage(e) }),
    );
  }, [sid, pid]);
  return state;
}

function Devices({ p, locked, required, onError }: { p: ProtocolInstance; locked: boolean; required: boolean; onError: (e: unknown) => void }) {
  const save = (measuringDevices: MeasuringDevice[]) => protocolRepo.updateHeader(p, { measuringDevices }).catch(onError);
  const update = (id: string, patch: Partial<MeasuringDevice>) =>
    save(p.measuringDevices.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <section className="devices">
      <h2>
        Použité meradlá{required && <span className="requiredMark"> *</span>}
      </h2>
      {p.measuringDevices.map((m) => (
        <div className="deviceRow" key={m.id}>
          <label>
            Názov meradla
            <DebouncedText value={m.name} disabled={locked} onCommit={(v) => update(m.id, { name: v })} />
          </label>
          <label>
            Inventárne / evidenčné číslo
            <DebouncedText value={m.inventoryNumber} disabled={locked} onCommit={(v) => update(m.id, { inventoryNumber: v })} />
          </label>
          {!locked && (
            <button type="button" className="danger" onClick={() => save(p.measuringDevices.filter((x) => x.id !== m.id))}>
              Odstrániť
            </button>
          )}
        </div>
      ))}
      {!p.measuringDevices.length && <small>{required ? 'Pred uzatvorením zadajte aspoň jedno meradlo.' : 'Žiadne meradlo nie je zadané.'}</small>}
      {!locked && (
        <div className="toolbar">
          <button type="button" className="secondary" onClick={() => save([...p.measuringDevices, { id: uid(), name: '', inventoryNumber: '' }])}>
            + Pridať meradlo
          </button>
        </div>
      )}
    </section>
  );
}

export function ProtocolPage() {
  const { sid = '', pid = '' } = useParams();
  const n = useNavigate();
  const set = useAsync(() => trainsetRepo.get(sid), [sid]);
  const { loading, p, error: loadError } = useProtocol(sid, pid);
  const [section, setSection] = useState('');
  const [light, setLight] = useState<string>();
  const action = useAction();
  const queued = useQueuedPhotos(p ? protocolDocPath(sid, pid) : undefined, (field) => field[1] || '');

  if ((loading || set.loading) && !p)
    return (
      <Shell title="Načítavam">
        <Notice>Načítavam protokol…</Notice>
      </Shell>
    );
  if (loadError || set.error)
    return (
      <Shell title="Protokol">
        <ErrorBox message={loadError || set.error} />
      </Shell>
    );
  const s = set.data;
  if (!p || !s)
    return (
      <Shell title="Protokol">
        <NotFound what="Protokol" back={s ? `/sets/${s.id}` : '/'} backLabel={s ? 'Späť na súpravu' : 'Späť na úvod'} />
      </Shell>
    );
  const t = p.templateSnapshot;
  if (!t)
    return (
      <Shell title="Protokol">
        <div className="notice">
          <p>Šablóna tohto protokolu už neexistuje, preto ho nemožno zobraziť. Protokol môžete odstrániť v detaile súpravy.</p>
          <button type="button" className="secondary" onClick={() => n(`/sets/${s.id}`)}>
            Späť na súpravu
          </button>
        </div>
      </Shell>
    );

  const locked = p.status === 'closed';
  const fields = fieldsFor(t);
  const sections = [...new Set(fields.map((f) => f.section))];
  const current = sections.includes(section) ? section : sections[0] || '';
  const sectionImages = t.sectionImages || {};
  const vehicle = s.vehicles.find((v) => v.id === p.vehicleId);
  const fail = (e: unknown) => action.setError(errorMessage(e));

  const answer = (f: FieldDef, patch: Parameters<typeof protocolRepo.saveAnswer>[2]) => {
    if (locked) return;
    protocolRepo
      .saveAnswer(p, f.id, { vehicleId: f.vehicleSlotIds?.[0], ...patch }, getWorker() || undefined)
      .catch(fail);
  };

  const pendingCount: Record<string, number> = {};
  for (const [k, list] of Object.entries(queued)) pendingCount[k] = list.filter((x) => x.state !== 'failed').length;
  const sectionStats = (sec: string) => {
    const inSection = fields.filter((f) => f.section === sec);
    const missing = missingForFields(inSection, p.answers, pendingCount).length;
    const nok = inSection.filter((f) => p.answers[f.id]?.result === 'NOK').length;
    return { missing, nok };
  };

  const close = () =>
    action.run(async () => {
      if (!p.protocolNumber.trim()) throw new Error('Pred uzatvorením vyplňte číslo protokolu.');
      if (t.header.measuringMode === 'required' && !p.measuringDevices.some((m) => m.name.trim() && m.inventoryNumber.trim()))
        throw new Error('Pred uzatvorením zadajte použité meradlo (názov aj evidenčné číslo).');
      const missing = missingItems(t, p.answers, pendingCount);
      if (missing.length) {
        setSection(missing[0].field.section);
        const pending = missing.filter((m) => m.reason === 'photo_pending');
        const list = missing
          .slice(0, 5)
          .map((m) => `${m.field.label}${m.reason === 'answer' ? '' : m.reason === 'photo' ? ' (fotografia)' : ' (fotografia sa nahráva)'}`)
          .join(', ');
        throw new Error(
          `Protokol nemožno uzatvoriť. Doplňte: ${list}${missing.length > 5 ? ` a ďalších ${missing.length - 5}` : ''}.` +
            (pending.length ? ' Niektoré fotografie ešte čakajú na nahranie – počkajte na pripojenie.' : ''),
        );
      }
      const user = requireWorker();
      await protocolRepo.close(p, user);
      n(`/sets/${s.id}/protocol/${p.id}/print`);
    });

  const reopen = () =>
    action.run(async () => {
      const user = requireWorker();
      const reason = window.prompt('Dôvod opätovného otvorenia uzatvoreného protokolu (zapíše sa do histórie):')?.trim();
      if (!reason) return;
      await protocolRepo.reopen(p, user, reason);
    });

  const removeProtocol = () =>
    action.run(async () => {
      const closedNote = locked ? ' Protokol je UZATVORENÝ.' : '';
      if (!window.confirm(`Naozaj odstrániť protokol ${p.protocolNumber || t.name} vrátane fotografií?${closedNote} Táto operácia sa nedá vrátiť späť.`))
        return;
      await protocolRepo.remove(p);
      n(`/sets/${s.id}`, { replace: true });
    });

  return (
    <Shell title={t.name}>
      <p className="subjectLine">
        {s.name} • {vehicle ? `${vehicle.roleCode} – ${vehicle.serialNumber}` : 'Celá jednotka'} • šablóna {t.code} verzia {t.version}
      </p>
      <ErrorBox message={action.error} onClose={() => action.setError('')} />
      {locked && (
        <div className="lockedBanner">
          Protokol je uzatvorený{p.closedBy ? ` (${p.closedBy}` : ''}
          {p.closedAt ? `, ${new Date(p.closedAt).toLocaleString('sk-SK')})` : p.closedBy ? ')' : ''}. Údaje nemožno meniť.
          <button type="button" className="secondary" onClick={reopen} disabled={action.busy}>
            Znovu otvoriť
          </button>
        </div>
      )}
      <div className="protocolMeta">
        <label>
          Číslo protokolu *
          <DebouncedText
            value={p.protocolNumber}
            disabled={locked}
            onCommit={(v) => protocolRepo.updateHeader(p, { protocolNumber: v.trim() }).catch(fail)}
          />
        </label>
        <label>
          Hlásenie č.
          <DebouncedText value={p.reportNumber} disabled={locked} onCommit={(v) => protocolRepo.updateHeader(p, { reportNumber: v.trim() }).catch(fail)} />
        </label>
        <Select
          label="Druh protokolu"
          value={p.protocolType}
          disabled={locked}
          set={(x) => protocolRepo.updateHeader(p, { protocolType: x }).catch(fail)}
          options={d.protocolTypes}
        />
        <Status value={p.status} />
      </div>
      {t.header.measuringMode !== 'hidden' && (
        <Devices p={p} locked={locked} required={t.header.measuringMode === 'required'} onError={fail} />
      )}
      <div className="workspace">
        <aside>
          {sections.map((x) => {
            const st = sectionStats(x);
            return (
              <button type="button" className={current === x ? 'active' : ''} onClick={() => setSection(x)} key={x}>
                <span>{x}</span>
                <small>
                  {st.nok > 0 && <span className="warn">{st.nok} NOK </span>}
                  {st.missing > 0 ? `chýba ${st.missing}` : '✓'}
                </small>
              </button>
            );
          })}
        </aside>
        <section className="fields">
          {(sectionImages[current] || []).length > 0 && (
            <div className="chapterReference">
              {(sectionImages[current] || []).map((x) => (
                <figure key={x.id} onClick={() => setLight(x.dataUrl)}>
                  <img src={x.dataUrl} alt={x.caption || x.name} />
                  <figcaption>{x.caption || x.name}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {fields
            .filter((f) => f.section === current)
            .map((f) => (
              <Field
                key={f.id}
                f={f}
                a={p.answers[f.id]}
                locked={locked}
                change={(patch) => answer(f, patch)}
                addPhotos={(blobs) => protocolRepo.addPhotos(p, f.id, blobs)}
                removePhoto={(url) => protocolRepo.removePhoto(p, f.id, url).catch(fail)}
                queued={queued[f.id] || []}
                light={setLight}
                onError={(m) => action.setError(m)}
              />
            ))}
        </section>
      </div>
      {p.history.length > 0 && (
        <details className="history compact">
          <summary>História protokolu</summary>
          {[...p.history].reverse().map((h) => (
            <div key={h.id}>
              <b>{h.action === 'created' ? 'Vytvorený' : h.action === 'closed' ? 'Uzatvorený' : 'Znovu otvorený'}</b>
              <span>
                {new Date(h.createdAt).toLocaleString('sk-SK')}
                {h.user ? ` • ${h.user}` : ''}
              </span>
              {h.note && <p>{h.note}</p>}
            </div>
          ))}
        </details>
      )}
      <div className="sticky">
        <button type="button" className="secondary" onClick={() => n(`/sets/${s.id}`)}>
          Späť na súpravu
        </button>
        <button type="button" className="secondary" onClick={() => n(`/sets/${s.id}/protocol/${p.id}/print`)}>
          Náhľad tlače
        </button>
        <button type="button" className="danger" onClick={removeProtocol} disabled={action.busy}>
          Odstrániť protokol
        </button>
        {!locked && (
          <button type="button" onClick={close} disabled={action.busy}>
            Uzatvoriť
          </button>
        )}
      </div>
      {light && <Lightbox src={light} close={() => setLight(undefined)} />}
    </Shell>
  );
}
