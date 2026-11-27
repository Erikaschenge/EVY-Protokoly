import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox, Notice, NotFound, Status } from '../components/ui';
import { useAction, useAsync } from '../lib/hooks';
import { uid } from '../lib/ids';
import { getWorker } from '../lib/worker';
import { newProtocol, protocolRepo, templateRepo, trainsetRepo } from '../repository';
import type { ProtocolSummary, Template, Trainset, TrainsetMeta, VehicleIdentity } from '../types';
import { SetProgress } from './Dashboard';
import { validateSet } from './NewSet';

function templatesFor(ts: Template[], vehicle: VehicleIdentity | undefined) {
  return ts.filter((t) =>
    vehicle
      ? t.header.subjectType === 'single_vehicle' && (t.vehicleSeries === vehicle.roleCode || t.vehicleSeries === 'ALL' || t.vehicleSeries === '')
      : t.header.subjectType === 'vehicle_unit' || t.vehicleSeries === 'UNIT',
  );
}

function ProtocolList({
  items,
  open,
  remove,
}: {
  items: ProtocolSummary[];
  open: (p: ProtocolSummary) => void;
  remove: (p: ProtocolSummary) => void;
}) {
  return (
    <div className="protocolList">
      {items.map((p) =>
        p.templateMissing ? (
          <div className="orphanProtocol" key={p.id}>
            <div>
              <strong>Neznáma šablóna</strong>
              <small>Protokol bol vytvorený zo šablóny, ktorá už neexistuje, a nedá sa vyplniť. Odkaz možno bezpečne odobrať.</small>
            </div>
            <button className="danger" type="button" onClick={() => remove(p)}>
              Odstrániť zo súpravy
            </button>
          </div>
        ) : (
          <button type="button" key={p.id} onClick={() => open(p)}>
            <span>
              {p.templateName}
              {p.protocolNumber && <small> • č. {p.protocolNumber}</small>}
              {p.nok > 0 && <small className="warn"> • {p.nok} NOK</small>}
            </span>
            <Status value={p.status} />
          </button>
        ),
      )}
      {!items.length && <small>Žiadne protokoly</small>}
    </div>
  );
}

const metaOf = (s: Trainset): TrainsetMeta => ({
  name: s.name,
  customer: s.customer,
  orderNumber: s.orderNumber,
  orderTypes: s.orderTypes,
  orderScopes: s.orderScopes,
  ecmF2: s.ecmF2,
  series: s.series,
  status: s.status,
  vehicles: s.vehicles,
});

export function SetDetail() {
  const { id = '' } = useParams();
  const n = useNavigate();
  const set = useAsync(() => trainsetRepo.get(id), [id]);
  const templates = useAsync(() => templateRepo.list(), []);
  const action = useAction();
  const [vehicleId, setVehicleId] = useState('unit');
  const [templateId, setTemplateId] = useState('');
  const [draft, setDraft] = useState<TrainsetMeta>();

  if (set.loading && !set.data)
    return (
      <Shell title="Načítavam">
        <Notice>Načítavam súpravu…</Notice>
      </Shell>
    );
  if (set.error)
    return (
      <Shell title="Súprava">
        <ErrorBox message={set.error} />
        <button type="button" className="secondary" onClick={set.reload}>
          Skúsiť znova
        </button>
      </Shell>
    );
  const s = set.data;
  if (!s)
    return (
      <Shell title="Súprava">
        <NotFound what="Záznam súpravy" />
      </Shell>
    );

  const active = (templates.data || []).filter((x) => x.status === 'active');
  const selectedVehicle = vehicleId === 'unit' ? undefined : s.vehicles.find((v) => v.id === vehicleId);
  const available = templatesFor(active, selectedVehicle);
  const selectedTemplate = available.find((t) => t.id === templateId) || available[0];
  const index = Object.values(s.protocolIndex).sort((a, b) => a.order - b.order);
  const byVehicle = (vid: string) => index.filter((p) => p.vehicleId === vid);
  const unit = index.filter((p) => !p.vehicleId || !s.vehicles.some((v) => v.id === p.vehicleId));
  const openProtocol = (p: ProtocolSummary) => n(`/sets/${s.id}/protocol/${p.id}`);

  const addProtocol = () =>
    action.run(async () => {
      if (!selectedTemplate) throw new Error('Pre vybraný predmet nie je dostupná aktívna šablóna.');
      const vid = selectedTemplate.header.subjectType === 'vehicle_unit' ? undefined : selectedVehicle?.id;
      if (selectedTemplate.header.subjectType === 'single_vehicle' && !vid) throw new Error('Vyberte vozidlo.');
      const order = Math.max(0, ...index.map((p) => p.order)) + 1;
      await protocolRepo.add(s.id, [newProtocol(s.id, selectedTemplate, vid, order, getWorker() || undefined)]);
      set.reload();
    });

  const removeOrphan = (summary: ProtocolSummary) =>
    action.run(async () => {
      if (!window.confirm('Odstrániť tento neplatný protokol zo súpravy?')) return;
      const p = await protocolRepo.get(s.id, summary.id);
      if (p) await protocolRepo.remove(p);
      set.reload();
    });

  const saveDraft = () =>
    action.run(async () => {
      if (!draft) return;
      const problem = validateSet(draft);
      if (problem) throw new Error(problem);
      const removedVehicles = s.vehicles.filter((v) => !draft.vehicles.some((x) => x.id === v.id));
      const affected = index.filter((p) => removedVehicles.some((v) => v.id === p.vehicleId));
      if (removedVehicles.length) {
        const closed = affected.filter((p) => p.status === 'closed').length;
        const msg =
          `Odstránia sa vozidlá ${removedVehicles.map((v) => v.roleCode || v.label).join(', ')}` +
          (affected.length ? ` a ${affected.length} priradených protokolov${closed ? ` (z toho ${closed} uzatvorených)` : ''} vrátane fotografií.` : '.') +
          ' Túto operáciu nemožno vrátiť späť.';
        if (!window.confirm(msg)) return;
      }
      for (const summary of affected) {
        const p = await protocolRepo.get(s.id, summary.id);
        if (p) await protocolRepo.remove(p);
      }
      await trainsetRepo.updateMeta(s.id, draft);
      setDraft(undefined);
      set.reload();
    });

  const deleteSet = () =>
    action.run(async () => {
      const findings = await trainsetRepo.countFindings(s.id);
      const closed = index.filter((p) => p.status === 'closed').length;
      const msg =
        `Odstrániť celú zákazku ${s.name}? Odstráni sa ${s.vehicles.length} vozidiel, ${index.length} protokolov` +
        `${closed ? ` (z toho ${closed} uzatvorených)` : ''}` +
        `${findings ? ` a ${findings} evidovaných chýb` : ''} vrátane všetkých fotografií. Túto operáciu nemožno vrátiť späť.`;
      if (!window.confirm(msg)) return;
      await trainsetRepo.remove(s.id);
      n('/', { replace: true });
    });

  const patchVehicle = (vid: string, patch: Partial<VehicleIdentity>) =>
    draft && setDraft({ ...draft, vehicles: draft.vehicles.map((v) => (v.id === vid ? { ...v, ...patch } : v)) });
  const addVehicle = () => {
    const base = draft || metaOf(s);
    setDraft({
      ...base,
      vehicles: [...base.vehicles, { id: uid(), roleCode: '', label: 'Nové vozidlo', vehicleType: '', series: s.series, serialNumber: '', uic: '' }],
    });
  };
  const list = (draft?.vehicles || s.vehicles) as VehicleIdentity[];

  return (
    <Shell title={`${s.name} • zákazka ${s.orderNumber}`}>
      <div className="toolbar">
        {draft ? (
          <>
            <button type="button" className="secondary" onClick={() => setDraft(undefined)} disabled={action.busy}>
              Zrušiť úpravy
            </button>
            <button type="button" onClick={saveDraft} disabled={action.busy}>
              {action.busy ? 'Ukladám…' : 'Uložiť zmeny'}
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setDraft(metaOf(s))}>
            Upraviť zákazku
          </button>
        )}
        <button type="button" className="secondary" onClick={addVehicle}>
          + Pridať vozidlo
        </button>
        {!draft && (
          <button type="button" className="danger" onClick={deleteSet} disabled={action.busy}>
            Odstrániť zákazku
          </button>
        )}
      </div>
      <ErrorBox message={action.error || templates.error} onClose={() => action.setError('')} />
      {draft ? (
        <div className="form grid2 editOrder">
          <label>
            Označenie súpravy
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            Číslo zákazky
            <input value={draft.orderNumber} onChange={(e) => setDraft({ ...draft, orderNumber: e.target.value })} />
          </label>
          <label>
            Zákazník
            <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
          </label>
          <label>
            Rad jednotky
            <input value={draft.series} onChange={(e) => setDraft({ ...draft, series: e.target.value })} />
          </label>
          <label>
            ECM F2
            <input value={draft.ecmF2} onChange={(e) => setDraft({ ...draft, ecmF2: e.target.value })} />
          </label>
          <label>
            Stav
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Trainset['status'] })}>
              <option value="active">Aktívna</option>
              <option value="review">Na overenie</option>
              <option value="closed">Uzatvorená</option>
            </select>
          </label>
          <label>
            Druh zákazky
            <input
              value={draft.orderTypes.join(', ')}
              onChange={(e) => setDraft({ ...draft, orderTypes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </label>
          <label>
            Rozsah zákazky
            <input
              value={draft.orderScopes.join(', ')}
              onChange={(e) => setDraft({ ...draft, orderScopes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </label>
        </div>
      ) : (
        <div className="setSummary">
          <div>
            <b>{s.customer}</b>
            <span>Rad {s.series}</span>
          </div>
          <div>
            <b>{s.orderTypes.join(', ')}</b>
            <span>{s.orderScopes.join(', ')}</span>
          </div>
          <SetProgress set={s} />
        </div>
      )}

      {!draft && (
        <section className="addProtocol">
          <h2>Pridať protokol alebo sprievodku</h2>
          <select
            aria-label="Predmet protokolu"
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              setTemplateId('');
            }}
          >
            <option value="unit">Celá jednotka</option>
            {s.vehicles.map((v) => (
              <option value={v.id} key={v.id}>
                {v.roleCode || v.label} – {v.serialNumber}
              </option>
            ))}
          </select>
          <select
            aria-label="Šablóna"
            value={selectedTemplate?.id || ''}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={!available.length}
          >
            {!available.length && <option value="">{templates.loading ? 'Načítavam šablóny…' : 'Žiadna vhodná aktívna šablóna'}</option>}
            {available.map((t) => (
              <option value={t.id} key={t.id}>
                {t.code} – {t.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={addProtocol} disabled={!available.length || action.busy}>
            Pridať
          </button>
        </section>
      )}

      <h2>Vozidlá súpravy</h2>
      <div className="vehicleGrid detail">
        {list.map((v) => (
          <section key={v.id}>
            {draft ? (
              <>
                <label>
                  Pozícia / označenie
                  <input value={v.roleCode} onChange={(e) => patchVehicle(v.id, { roleCode: e.target.value })} />
                </label>
                <label>
                  Názov vozidla
                  <input value={v.label} onChange={(e) => patchVehicle(v.id, { label: e.target.value })} />
                </label>
                <label>
                  Druh vozidla
                  <input value={v.vehicleType} onChange={(e) => patchVehicle(v.id, { vehicleType: e.target.value })} />
                </label>
                <label>
                  Rad
                  <input value={v.series} onChange={(e) => patchVehicle(v.id, { series: e.target.value })} />
                </label>
                <label>
                  Výrobné číslo
                  <input value={v.serialNumber} onChange={(e) => patchVehicle(v.id, { serialNumber: e.target.value })} />
                </label>
                <label>
                  UIC
                  <input value={v.uic} onChange={(e) => patchVehicle(v.id, { uic: e.target.value })} />
                </label>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setDraft({ ...draft, vehicles: draft.vehicles.filter((x) => x.id !== v.id) })}
                >
                  Odstrániť vozidlo
                </button>
                {byVehicle(v.id).length > 0 && (
                  <small className="warn">Pri odstránení vozidla sa po uložení odstráni aj {byVehicle(v.id).length} jeho protokolov.</small>
                )}
              </>
            ) : (
              <>
                <h3>{v.roleCode || v.label}</h3>
                <p>
                  {v.vehicleType} • rad <b>{v.series}</b>
                </p>
                <p>
                  Výrobné číslo: <b>{v.serialNumber}</b>
                </p>
                <p>
                  UIC: <b>{v.uic}</b>
                </p>
                <ProtocolList items={byVehicle(v.id)} open={openProtocol} remove={removeOrphan} />
              </>
            )}
          </section>
        ))}
      </div>
      {draft && <Notice>Nové alebo upravené vozidlá sa uložia až tlačidlom „Uložiť zmeny“.</Notice>}
      <h2>Protokoly celej jednotky</h2>
      <ProtocolList items={unit} open={openProtocol} remove={removeOrphan} />
    </Shell>
  );
}
