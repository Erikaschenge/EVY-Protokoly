import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { clearSaveError, subscribeSaveState, type SaveState } from '../lib/saveTracker';
import { askWorker, useWorker } from '../lib/worker';
import { retryFailedUploads, subscribeUploadQueue, type QueueSummary } from '../services/uploadQueue';

function SaveIndicator() {
  const [s, setS] = useState<SaveState>({ pending: 0, online: true });
  useEffect(() => subscribeSaveState(setS), []);
  if (s.error)
    return (
      <button type="button" className="saveState error" onClick={clearSaveError} title={s.error}>
        Uloženie zlyhalo – {s.error}
      </button>
    );
  if (!s.online) return <span className="saveState offline">Offline – zmeny sú uložené v zariadení a odošlú sa po pripojení</span>;
  if (s.pending > 0) return <span className="saveState">Ukladám…</span>;
  return <span className="saveState ok">Uložené</span>;
}

function UploadIndicator() {
  const [q, setQ] = useState<QueueSummary>({ pending: 0, uploading: 0, failed: 0 });
  useEffect(() => subscribeUploadQueue(setQ), []);
  return (
    <div className="uploadQueue">
      {q.uploading > 0 && <span>Nahráva sa fotografií: {q.uploading}</span>}
      {q.pending > 0 && <span>Čaká na nahranie: {q.pending}</span>}
      {q.failed > 0 && (
        <button type="button" onClick={() => void retryFailedUploads()}>
          Nenahrané: {q.failed} • skúsiť znova
        </button>
      )}
    </div>
  );
}

function WorkerBadge() {
  const name = useWorker();
  return (
    <button type="button" className="workerBadge" onClick={() => askWorker()} title="Zmeniť meno pracovníka">
      {name ? `Pracovník: ${name}` : 'Zadať meno pracovníka'}
    </button>
  );
}

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header>
        <Link className="brand" to="/">
          <img src="./zos-trnava-logo.png" alt="ŽOS Trnava" />
          <span>Digitálne protokoly</span>
        </Link>
        <nav>
          <Link to="/">Súpravy</Link>
          <Link to="/templates">Správa protokolov</Link>
          <Link to="/findings">Evidencia chýb</Link>
        </nav>
        <div className="headerStatus">
          <SaveIndicator />
          <UploadIndicator />
          <WorkerBadge />
        </div>
        <b className="appVersion">v{__APP_VERSION__}</b>
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
