import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Dashboard } from './pages/Dashboard';
import { FindingDetailPage, FindingEditorPage, FindingsPage } from './pages/FindingsPage';
import { NewSet } from './pages/NewSet';
import { PackageEditor, PackageList } from './pages/Packages';
import { PrintView } from './pages/PrintView';
import { ProtocolPage } from './pages/ProtocolPage';
import { SetDetail } from './pages/SetDetail';
import { TemplateEditor } from './pages/TemplateEditor';
import { TemplateList } from './pages/Templates';

export class Boundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal">
        <img src="./zos-trnava-logo.png" alt="ŽOS Trnava" />
        <h1>Aplikáciu sa nepodarilo zobraziť</h1>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => location.assign(`${location.pathname}#/`)}>
          Späť na úvod
        </button>
      </div>
    );
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/sets/new" element={<NewSet />} />
      <Route path="/sets/:id" element={<SetDetail />} />
      <Route path="/sets/:sid/protocol/:pid" element={<ProtocolPage />} />
      <Route path="/sets/:sid/protocol/:pid/print" element={<PrintView />} />
      <Route path="/templates" element={<TemplateList />} />
      <Route path="/templates/new" element={<TemplateEditor />} />
      <Route path="/templates/:id" element={<TemplateEditor />} />
      <Route path="/packages" element={<PackageList />} />
      <Route path="/packages/new" element={<PackageEditor />} />
      <Route path="/packages/:id" element={<PackageEditor />} />
      <Route path="/findings" element={<FindingsPage />} />
      <Route path="/findings/new" element={<FindingEditorPage />} />
      <Route path="/findings/:id" element={<FindingDetailPage />} />
      <Route
        path="*"
        element={
          <Shell title="Stránka sa nenašla">
            <Link to="/">Späť na úvod</Link>
          </Shell>
        }
      />
    </Routes>
  );
}
