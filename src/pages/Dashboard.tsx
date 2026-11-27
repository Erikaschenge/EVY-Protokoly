import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox, Notice } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { trainsetRepo } from '../repository';
import type { Trainset } from '../types';

export function SetProgress({ set }: { set: Trainset }) {
  const items = Object.values(set.protocolIndex);
  const all = items.length;
  const done = items.filter((p) => p.status === 'closed').length;
  const nok = items.reduce((n, p) => n + (p.nok || 0), 0);
  const pct = all ? Math.round((done / all) * 100) : 0;
  return (
    <div className="setProgress">
      <b>{pct}%</b>
      <span>
        {done}/{all} protokolov
      </span>
      <span className={nok ? 'warn' : ''}>{nok} NOK</span>
    </div>
  );
}

export function Dashboard() {
  const n = useNavigate();
  const { data: sets = [], loading, error, reload } = useAsync(() => trainsetRepo.list(), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = sets.filter((s) => {
    const hay = [s.name, s.customer, s.orderNumber, ...s.vehicles.flatMap((v) => [v.serialNumber, v.uic, v.roleCode])].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase()) && (status === 'all' || s.status === status);
  });
  return (
    <Shell title="Aktívne zákazky a súpravy">
      <section className="hero">
        <div>
          <h2>Dokumentácia podľa súprav a vozidiel</h2>
          <p>Vyhľadajte zákazku, UIC, výrobné číslo alebo označenie súpravy.</p>
        </div>
        <button type="button" onClick={() => n('/sets/new')}>
          + Nová zákazka / súprava
        </button>
      </section>
      <div className="searchbar">
        <input
          aria-label="Hľadať"
          placeholder="Hľadať zákazku, súpravu, UIC alebo výrobné číslo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Stav" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Všetky stavy</option>
          <option value="active">Aktívne</option>
          <option value="review">Na overenie</option>
          <option value="closed">Uzatvorené</option>
        </select>
      </div>
      {error && (
        <>
          <ErrorBox message={error} />
          <button type="button" className="secondary" onClick={reload}>
            Skúsiť znova
          </button>
        </>
      )}
      {loading && !sets.length && <Notice>Načítavam súpravy…</Notice>}
      <div className="setList">
        {filtered.map((s) => (
          <button type="button" className="setCard" key={s.id} onClick={() => n(`/sets/${s.id}`)}>
            <div>
              <strong>{s.name}</strong>
              <span>
                Zákazka {s.orderNumber} • {s.customer} • rad {s.series}
              </span>
              <small>{s.vehicles.map((v) => `${v.roleCode}: ${v.serialNumber || 'bez čísla'}`).join(' • ')}</small>
            </div>
            <SetProgress set={s} />
          </button>
        ))}
        {!loading && !error && !filtered.length && (
          <div className="empty">{sets.length ? 'Hľadaniu nezodpovedá žiadna súprava.' : 'Zatiaľ nie je vytvorená žiadna súprava.'}</div>
        )}
      </div>
    </Shell>
  );
}
