import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBox, Notice, NotFound } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { displayValue, fieldsFor, ruleText } from '../lib/protocolLogic';
import { protocolRepo, trainsetRepo } from '../repository';

const Uic = ({ value }: { value: string }) => (
  <div className="uicCells">
    {value
      .replace(/\s/g, '')
      .split('')
      .map((x, i) => (
        <span key={i}>{x}</span>
      ))}
  </div>
);

const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('sk-SK') : '');

export function PrintView() {
  const { sid = '', pid = '' } = useParams();
  const n = useNavigate();
  const data = useAsync(() => Promise.all([trainsetRepo.get(sid), protocolRepo.get(sid, pid)]), [sid, pid]);
  if (data.loading) return <Notice>Pripravujem náhľad…</Notice>;
  if (data.error) return <ErrorBox message={data.error} />;
  const [s, p] = data.data || [];
  if (!s || !p) return <NotFound what="Protokol" />;
  const t = p.templateSnapshot;
  if (!t) return <Notice>Šablóna protokolu neexistuje, náhľad nemožno zostaviť.</Notice>;

  const vehicles = p.vehicleId ? s.vehicles.filter((v) => v.id === p.vehicleId) : s.vehicles;
  const vehicleType = p.vehicleId
    ? vehicles[0]?.vehicleType || ''
    : [...new Set(s.vehicles.map((v) => v.vehicleType).filter(Boolean))].join(', ') || 'Jednotka';
  const fields = fieldsFor(t);
  const withPhotos = fields.filter((f) => p.answers[f.id]?.photos?.length);
  const devices = p.measuringDevices.filter((m) => m.name.trim() || m.inventoryNumber.trim());
  const performers = [...new Set(Object.values(p.answers).map((a) => a.updatedBy).filter(Boolean))] as string[];

  return (
    <div className="printPage">
      {p.status !== 'closed' && <div className="watermark">NÁHĽAD – ROZPRACOVANÝ DOKUMENT</div>}
      <div className="docTop">
        <div className="printLogo">
          <img src="./zos-trnava-logo.png" alt="ŽOS Trnava" />
        </div>
        <div className="docTitle">
          <b>{t.header.subtitle || 'Protokol'}</b>
          <strong>{t.name}</strong>
        </div>
        <div className="version">
          Šablóna {t.code}, verzia {t.version}
          <br />
          platná od: <b>{t.header.templateEffectiveDate}</b>
        </div>
      </div>
      <table className="headerTable">
        <tbody>
          <tr>
            <td>Zákazník</td>
            <th colSpan={3}>{s.customer}</th>
            <td>Druh vozidla</td>
            <th>{vehicleType}</th>
            <td>Rad</td>
            <th>{s.series}</th>
          </tr>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td>Výrobné číslo {vehicles.length > 1 ? v.roleCode : ''}</td>
              <th colSpan={3}>{v.serialNumber}</th>
              <td>UIC číslo {vehicles.length > 1 ? v.roleCode : ''}</td>
              <td colSpan={3}>
                <Uic value={v.uic} />
              </td>
            </tr>
          ))}
          <tr>
            <td>Druh zákazky</td>
            <th colSpan={2}>{s.orderTypes.join(' ')}</th>
            <td>Hlásenie č.</td>
            <th>{p.reportNumber}</th>
            <td>Protokol č.</td>
            <th colSpan={2}>{p.protocolNumber}</th>
          </tr>
          <tr>
            <td>Rozsah zákazky</td>
            <th colSpan={2}>{s.orderScopes.join(' ')}</th>
            <td>ECM F2</td>
            <th>{s.ecmF2}</th>
            <td>Druh protokolu</td>
            <th colSpan={2}>{p.protocolType}</th>
          </tr>
        </tbody>
      </table>

      {devices.length > 0 && (
        <table className="results devicesTable">
          <thead>
            <tr>
              <th>Použité meradlo</th>
              <th>Evidenčné číslo</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.inventoryNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="results">
        <thead>
          <tr>
            <th>Por.</th>
            <th>Kontrolný bod</th>
            <th>Predpis</th>
            <th>Nameraná hodnota / zistenie</th>
            <th>Výsledok</th>
            <th>Poznámka</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => {
            const a = p.answers[f.id];
            const value = f.type === 'ok_nok' ? '' : displayValue(f, a);
            const result = a?.result === 'NA' ? 'N/A' : a?.result || '';
            return (
              <tr key={f.id} className={a?.result === 'NOK' ? 'nokRow' : ''}>
                <td>{f.displayNumber || i + 1}</td>
                <td>
                  {f.label}
                  {f.section && <small className="printSection"> ({f.section})</small>}
                </td>
                <td>{ruleText(f).replace(/^Predpis: /, '')}</td>
                <td>{value}</td>
                <td className="resultCell">{result}</td>
                <td>
                  {a?.note || ''}
                  {a?.photos?.length ? `${a?.note ? ' • ' : ''}Foto: ${a.photos.length}` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="headerTable signatures">
        <tbody>
          <tr>
            <td>Vyplnil(i)</td>
            <th>{performers.join(', ')}</th>
            <td>Uzatvoril</td>
            <th>{p.closedBy || ''}</th>
          </tr>
          <tr>
            <td>Dátum uzatvorenia</td>
            <th>{fmtDateTime(p.closedAt)}</th>
            <td>Podpis</td>
            <th className="signatureBox" />
          </tr>
        </tbody>
      </table>

      {withPhotos.length > 0 && (
        <section className="photoAppendix">
          <h2>Fotodokumentácia</h2>
          {withPhotos.map((f) => (
            <div key={f.id} className="appendixItem">
              <b>
                {f.displayNumber ? `${f.displayNumber} ` : ''}
                {f.label}
              </b>
              <div className="appendixPhotos">
                {p.answers[f.id].photos!.map((url, i) => (
                  <img key={url} src={url} alt={`${f.label} – fotografia ${i + 1}`} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="printActions">
        <button type="button" className="secondary" onClick={() => n(`/sets/${s.id}/protocol/${p.id}`)}>
          Späť na protokol
        </button>
        <button type="button" onClick={() => window.print()}>
          Vytlačiť / Uložiť PDF
        </button>
      </div>
    </div>
  );
}
