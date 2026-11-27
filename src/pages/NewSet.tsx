import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Checks, ErrorBox, Notice, Select } from '../components/ui';
import { dictionaries as d } from '../dictionaries';
import { useAction, useAsync } from '../lib/hooks';
import { now, uid } from '../lib/ids';
import { UNIT_ROLES } from '../lib/templateDefaults';
import { getWorker } from '../lib/worker';
import { newProtocol, packageRepo, templateRepo, trainsetRepo } from '../repository';
import type { ProtocolInstance, Trainset, VehicleIdentity } from '../types';

export function validateSet(s: Pick<Trainset, 'name' | 'customer' | 'orderNumber' | 'vehicles'>): string {
  const missing: string[] = [];
  if (!s.name.trim()) missing.push('označenie súpravy');
  if (!s.orderNumber.trim()) missing.push('číslo zákazky');
  if (!s.customer.trim()) missing.push('zákazníka');
  const badVehicles = s.vehicles.filter((v) => !v.roleCode.trim() || !v.serialNumber.trim() || !v.uic.trim());
  if (badVehicles.length) missing.push(`označenie, výrobné číslo a UIC vozidiel (${badVehicles.map((v) => v.roleCode || v.label).join(', ')})`);
  const codes = s.vehicles.map((v) => v.roleCode.trim().toUpperCase()).filter(Boolean);
  const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
  const parts = missing.length ? [`Vyplňte ${missing.join(', ')}.`] : [];
  if (dup.length) parts.push(`Označenie vozidla sa opakuje: ${[...new Set(dup)].join(', ')}.`);
  return parts.join(' ');
}

export function NewSet() {
  const n = useNavigate();
  const stamp = now();
  const [s, setS] = useState<Trainset>({
    id: uid(),
    name: '',
    customer: '',
    orderNumber: '',
    orderTypes: [],
    orderScopes: [],
    ecmF2: '',
    series: '660',
    status: 'active',
    vehicles: UNIT_ROLES.map((r) => ({
      id: uid(),
      roleCode: r,
      label: r,
      vehicleType: r.startsWith('HV') ? 'Hnací vozeň' : 'Vložený vozeň',
      series: r,
      serialNumber: '',
      uic: '',
    })),
    protocolIndex: {},
    createdAt: stamp,
    updatedAt: stamp,
  });
  const [packageId, setPackageId] = useState<string>();
  const action = useAction();
  const lists = useAsync(() => Promise.all([packageRepo.list(), templateRepo.list()]), []);
  const packages = (lists.data?.[0] || []).filter((x) => x.status === 'active');
  const templates = (lists.data?.[1] || []).filter((x) => x.status === 'active');
  const selectedPackageId = packageId ?? packages[0]?.id ?? '';
  const vehicle = (id: string, p: Partial<VehicleIdentity>) => setS({ ...s, vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...p } : v)) });

  const save = () =>
    action.run(async () => {
      const problem = validateSet(s);
      if (problem) throw new Error(problem);
      const pack = packages.find((x) => x.id === selectedPackageId);
      const skipped: string[] = [];
      const protocols: ProtocolInstance[] = [];
      for (const item of [...(pack?.items || [])].sort((a, b) => a.order - b.order)) {
        const template = templates.find((t) => t.id === item.templateId);
        if (!template) {
          skipped.push(`šablóna ${item.templateId} nie je aktívna`);
          continue;
        }
        const vehicleId = item.target === 'UNIT' ? undefined : s.vehicles.find((v) => v.roleCode === item.target)?.id;
        if (item.target !== 'UNIT' && !vehicleId) {
          skipped.push(`${template.code} – v súprave chýba vozidlo ${item.target}`);
          continue;
        }
        protocols.push(newProtocol(s.id, template, vehicleId, protocols.length + 1, getWorker() || undefined));
      }
      if (skipped.length && !window.confirm(`Niektoré protokoly z balíka sa nevytvoria:\n${skipped.join('\n')}\n\nPokračovať?`)) return;
      await trainsetRepo.create({ ...s, updatedAt: now() }, protocols);
      n(`/sets/${s.id}`, { replace: true });
    });

  return (
    <Shell title="Nová zákazka / súprava">
      <ErrorBox message={action.error || lists.error} />
      {lists.loading && <Notice>Načítavam balíky protokolov…</Notice>}
      <div className="form grid2">
        <label>
          Označenie súpravy
          <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="napr. 660-008" />
        </label>
        <label>
          Číslo zákazky
          <input value={s.orderNumber} onChange={(e) => setS({ ...s, orderNumber: e.target.value })} />
        </label>
        <Select label="Zákazník" value={s.customer} set={(x) => setS({ ...s, customer: x })} options={d.customers} />
        <Select label="Rad jednotky" value={s.series} set={(x) => setS({ ...s, series: x })} options={d.series} />
        <label>
          Balík protokolov
          <select value={selectedPackageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">Bez automatického balíka</option>
            {packages.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} – {x.name}
              </option>
            ))}
          </select>
        </label>
        <Checks label="Druh zákazky" values={d.orderTypes} selected={s.orderTypes} set={(x) => setS({ ...s, orderTypes: x })} />
        <Checks label="Rozsah zákazky" values={d.orderScopes} selected={s.orderScopes} set={(x) => setS({ ...s, orderScopes: x })} />
        <Select label="ECM F2" value={s.ecmF2} set={(x) => setS({ ...s, ecmF2: x })} options={d.ecmF2} />
      </div>
      <h2>Vozidlá súpravy</h2>
      <div className="vehicleGrid">
        {s.vehicles.map((v) => (
          <section key={v.id}>
            <h3>{v.roleCode}</h3>
            <label>
              Výrobné číslo
              <input value={v.serialNumber} onChange={(e) => vehicle(v.id, { serialNumber: e.target.value })} />
            </label>
            <label>
              UIC
              <input value={v.uic} onChange={(e) => vehicle(v.id, { uic: e.target.value })} />
            </label>
          </section>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => n('/')}>
          Zrušiť
        </button>
        <button type="button" onClick={save} disabled={action.busy || lists.loading}>
          {action.busy ? 'Vytváram…' : 'Vytvoriť súpravu'}
        </button>
      </div>
    </Shell>
  );
}
