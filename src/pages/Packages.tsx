import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox, Notice, NotFound, TEMPLATE_STATUS_LABEL } from '../components/ui';
import { useAction, useAsync } from '../lib/hooks';
import { now, uid } from '../lib/ids';
import { UNIT_ROLES } from '../lib/templateDefaults';
import { packageRepo, templateRepo } from '../repository';
import type { PackageTarget, ProtocolPackage, Template } from '../types';

const targetFor = (t: Template): PackageTarget =>
  t.header.subjectType === 'vehicle_unit' ? 'UNIT' : (UNIT_ROLES as readonly string[]).includes(t.vehicleSeries) ? (t.vehicleSeries as PackageTarget) : 'HV5';

export function PackageList() {
  const n = useNavigate();
  const data = useAsync(() => packageRepo.list(), []);
  const action = useAction();
  return (
    <Shell title="Balíky protokolov">
      <div className="toolbar">
        <button type="button" onClick={() => n('/packages/new')}>
          + Nový balík
        </button>
      </div>
      <ErrorBox message={action.error || data.error} />
      {data.loading && <Notice>Načítavam balíky…</Notice>}
      {(data.data || []).map((x) => (
        <div className="templateRow" key={x.id}>
          <div>
            <strong>
              {x.code} • {x.name}
            </strong>
            <span>
              Rad {x.series} • {x.items.length} protokolov • {TEMPLATE_STATUS_LABEL[x.status] || x.status}
            </span>
          </div>
          <div>
            <button type="button" className="secondary" onClick={() => n(`/packages/${x.id}`)}>
              Upraviť
            </button>
            {x.status === 'draft' && (
              <button
                type="button"
                className="danger"
                onClick={() =>
                  action.run(async () => {
                    if (!window.confirm('Odstrániť balík?')) return;
                    await packageRepo.remove(x.id);
                    data.reload();
                  })
                }
              >
                Odstrániť
              </button>
            )}
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function PackageEditor() {
  const { id } = useParams();
  const n = useNavigate();
  const loaded = useAsync(
    () =>
      Promise.all([
        id ? packageRepo.get(id) : Promise.resolve<ProtocolPackage>({ id: uid(), code: '', name: '', series: '660', status: 'draft', items: [], updatedAt: now() }),
        templateRepo.list(),
      ]),
    [id],
  );
  const [item, setItem] = useState<ProtocolPackage>();
  const action = useAction();
  useEffect(() => {
    if (loaded.data?.[0]) setItem(loaded.data[0]);
  }, [loaded.data]);

  if (loaded.loading || (loaded.data?.[0] && !item))
    return (
      <Shell title="Balík protokolov">
        <Notice>Načítavam balík…</Notice>
      </Shell>
    );
  if (loaded.error)
    return (
      <Shell title="Balík protokolov">
        <ErrorBox message={loaded.error} />
      </Shell>
    );
  if (!item)
    return (
      <Shell title="Balík protokolov">
        <NotFound what="Balík protokolov" back="/templates" backLabel="Späť na správu protokolov" />
      </Shell>
    );

  const templates = (loaded.data?.[1] || []).filter((x) => x.status === 'active' || item.items.some((i) => i.templateId === x.id));
  const add = () => {
    const t = templates.find((x) => x.status === 'active');
    if (!t) return;
    setItem({ ...item, items: [...item.items, { id: uid(), templateId: t.id, target: targetFor(t), required: true, order: item.items.length + 1 }] });
  };
  const move = (i: number, dir: -1 | 1) => {
    const a = [...item.items];
    const [v] = a.splice(i, 1);
    a.splice(i + dir, 0, v);
    setItem({ ...item, items: a });
  };
  const save = () =>
    action.run(async () => {
      if (!item.code.trim() || !item.name.trim()) throw new Error('Vyplňte kód a názov balíka.');
      if (item.status === 'active' && !item.items.length) throw new Error('Aktívny balík musí obsahovať aspoň jeden protokol.');
      const inactive = item.items.filter((x) => templates.find((t) => t.id === x.templateId)?.status !== 'active');
      if (item.status === 'active' && inactive.length) throw new Error('Aktívny balík obsahuje šablóny, ktoré nie sú aktívne. Vymeňte ich alebo ich aktivujte.');
      await packageRepo.save({ ...item, items: item.items.map((x, i) => ({ ...x, order: i + 1 })) });
      n('/templates');
    });

  return (
    <Shell title="Záložka vozňa alebo jednotky">
      <ErrorBox message={action.error} onClose={() => action.setError('')} />
      <div className="form grid2">
        <label>
          Kód balíka *
          <input value={item.code} onChange={(e) => setItem({ ...item, code: e.target.value })} />
        </label>
        <label>
          Názov balíka *
          <input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </label>
        <label>
          Rad jednotky
          <input value={item.series} onChange={(e) => setItem({ ...item, series: e.target.value })} />
        </label>
        <label>
          Stav
          <select value={item.status} onChange={(e) => setItem({ ...item, status: e.target.value as ProtocolPackage['status'] })}>
            <option value="draft">Návrh</option>
            <option value="active">Aktívny</option>
            <option value="archived">Archívny</option>
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button type="button" onClick={add} disabled={!templates.some((x) => x.status === 'active')}>
          + Pridať protokol do balíka
        </button>
      </div>
      {item.items.map((x, i) => (
        <section className="packageItem" key={x.id}>
          <span className="packageOrder">{i + 1}</span>
          <label>
            Šablóna
            <select
              value={x.templateId}
              onChange={(e) => {
                const t = templates.find((y) => y.id === e.target.value);
                setItem({ ...item, items: item.items.map((y) => (y.id === x.id ? { ...y, templateId: e.target.value, target: t ? targetFor(t) : y.target } : y)) });
              }}
            >
              {!templates.some((t) => t.id === x.templateId) && <option value={x.templateId}>Neznáma šablóna</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} – {t.name}
                  {t.status !== 'active' ? ` (${TEMPLATE_STATUS_LABEL[t.status]})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cieľ
            <select
              value={x.target}
              onChange={(e) => setItem({ ...item, items: item.items.map((y) => (y.id === x.id ? { ...y, target: e.target.value as PackageTarget } : y)) })}
            >
              {UNIT_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
              <option value="UNIT">Celá jednotka</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={x.required}
              onChange={(e) => setItem({ ...item, items: item.items.map((y) => (y.id === x.id ? { ...y, required: e.target.checked } : y)) })}
            />
            Povinný
          </label>
          <div className="editorActions">
            <button type="button" className="secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Posunúť vyššie">
              ↑
            </button>
            <button type="button" className="secondary" disabled={i === item.items.length - 1} onClick={() => move(i, 1)} aria-label="Posunúť nižšie">
              ↓
            </button>
            <button type="button" className="danger" onClick={() => setItem({ ...item, items: item.items.filter((y) => y.id !== x.id) })}>
              Odstrániť
            </button>
          </div>
        </section>
      ))}
      {!item.items.length && <div className="empty">Balík zatiaľ neobsahuje žiadne protokoly.</div>}
      <div className="sticky">
        <button type="button" className="secondary" onClick={() => n('/templates')}>
          Zrušiť
        </button>
        <button type="button" onClick={save} disabled={action.busy}>
          {action.busy ? 'Ukladám…' : 'Uložiť záložku'}
        </button>
      </div>
    </Shell>
  );
}
