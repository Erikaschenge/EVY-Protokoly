import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox, Notice, TEMPLATE_STATUS_LABEL } from '../components/ui';
import { useAction, useAsync } from '../lib/hooks';
import { uid, now } from '../lib/ids';
import { packageRepo, templateRepo } from '../repository';
import { importProtocolWorkbook } from '../services/protocolImport';
import type { Template } from '../types';

export function TemplateList() {
  const n = useNavigate();
  const data = useAsync(() => Promise.all([templateRepo.list(), packageRepo.list()]), []);
  const [active, setActive] = useState('all');
  const [importMessage, setImportMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const action = useAction();
  const ts = data.data?.[0] || [];
  const packs = data.data?.[1] || [];

  const runImport = (file?: File) =>
    action.run(async () => {
      if (!file) return;
      setImportMessage('Načítavam súbor…');
      try {
        const { template, warnings } = await importProtocolWorkbook(file);
        const existing = ts.find((x) => x.code === template.code);
        if (existing && !window.confirm(`Protokol ${template.code} už existuje. Importovať ho ako nový návrh?`)) {
          setImportMessage('Import bol zrušený.');
          return;
        }
        await templateRepo.save(template);
        data.reload();
        setImportMessage(
          [`Importovaný protokol ${template.code}: ${template.fields.length} kontrolných bodov (ako návrh).`, ...warnings].join('\n'),
        );
      } catch (e) {
        setImportMessage('');
        throw e;
      } finally {
        if (inputRef.current) inputRef.current.value = '';
      }
    });

  const selected = packs.find((x) => x.id === active);
  const visible = selected
    ? [...selected.items]
        .sort((a, b) => a.order - b.order)
        .map((i) => ts.find((t) => t.id === i.templateId))
        .filter((x): x is Template => Boolean(x))
    : ts;

  return (
    <Shell title="Správa protokolov">
      <div className="protocolTabs">
        <button type="button" className={active === 'all' ? 'active' : ''} onClick={() => setActive('all')}>
          Všetky protokoly
        </button>
        {packs.map((x) => (
          <button type="button" key={x.id} className={active === x.id ? 'active' : ''} onClick={() => setActive(x.id)}>
            {x.name}
          </button>
        ))}
        <button type="button" className="addTab" onClick={() => n('/packages/new')}>
          + Pridať vozeň / jednotku
        </button>
      </div>
      <div className="toolbar">
        <button type="button" onClick={() => n('/templates/new')}>
          + Nový protokol
        </button>
        <button type="button" className="secondary" onClick={() => inputRef.current?.click()} disabled={action.busy}>
          Importovať z Excelu
        </button>
        {selected && (
          <>
            <button type="button" className="secondary" onClick={() => n(`/packages/${selected.id}`)}>
              Upraviť záložku
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                action.run(async () => {
                  const copy = {
                    ...selected,
                    id: uid(),
                    code: `${selected.code}-COPY`,
                    name: `${selected.name} – kópia`,
                    status: 'draft' as const,
                    items: selected.items.map((x) => ({ ...x, id: uid() })),
                    updatedAt: now(),
                  };
                  await packageRepo.save(copy);
                  data.reload();
                  setActive(copy.id);
                })
              }
            >
              Duplikovať záložku
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                action.run(async () => {
                  if (!window.confirm('Odstrániť záložku? Protokoly zostanú zachované.')) return;
                  await packageRepo.remove(selected.id);
                  setActive('all');
                  data.reload();
                })
              }
            >
              Odstrániť záložku
            </button>
          </>
        )}
        <a className="upload" href="./EVY-Predloha-importu-protokolu.xlsx" download>
          Stiahnuť predlohu
        </a>
        <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={(e) => runImport(e.target.files?.[0] || undefined)} />
      </div>
      <ErrorBox message={action.error || data.error} onClose={() => action.setError('')} />
      {importMessage && <p className="notice preline">{importMessage}</p>}
      {data.loading && !ts.length && <Notice>Načítavam protokoly…</Notice>}
      {visible.map((t) => (
        <div className="templateRow" key={t.id}>
          <div>
            <strong>
              {t.code} • {t.name}
            </strong>
            <span>
              {t.header.subjectType === 'vehicle_unit' ? 'Celá jednotka' : t.vehicleSeries === 'ALL' ? 'Všetky vozidlá' : t.vehicleSeries || 'Bez príslušnosti'}{' '}
              • verzia {t.version} • {t.fields.length} bodov • {TEMPLATE_STATUS_LABEL[t.status] || t.status}
            </span>
          </div>
          <div>
            <button type="button" className="secondary" onClick={() => n(`/templates/${t.id}`)}>
              Upraviť
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                action.run(async () => {
                  const x = await templateRepo.duplicate(t);
                  n(`/templates/${x.id}`);
                })
              }
            >
              Duplikovať
            </button>
            {t.status === 'draft' && (
              <button
                type="button"
                className="danger"
                onClick={() =>
                  action.run(async () => {
                    if (!window.confirm('Odstrániť návrh? Existujúce protokoly z neho zostanú zachované.')) return;
                    await templateRepo.remove(t.id);
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
      {!data.loading && !visible.length && <div className="empty">Táto záložka zatiaľ neobsahuje žiadny protokol.</div>}
    </Shell>
  );
}
