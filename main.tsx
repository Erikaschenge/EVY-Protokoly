import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { templates } from "./templates";
import { repository, uid } from "./repository";
import type { Answer, FieldDef, Inspection, Template } from "./types";
import "./styles.css";

const now = () => new Date().toISOString();

function expandedFields(template: Template): FieldDef[] {
  return template.fields.flatMap((field) => {
    if (!field.repeatBy?.length) return [field];
    return field.repeatBy.map((repeatKey) => ({
      ...field,
      id: `${field.id}::${repeatKey}`,
      label: `${field.label} – ${repeatKey}`,
      repeatBy: undefined,
    }));
  });
}

function evaluateNumber(field: FieldDef, raw: string): "OK" | "NOK" | undefined {
  if (!raw || field.type !== "number" || !field.rule || field.rule.kind === "none") {
    return undefined;
  }
  const value = Number(raw);
  const rule = field.rule;
  if (rule.kind === "range") return value >= rule.min! && value <= rule.max! ? "OK" : "NOK";
  if (rule.kind === "min") return value >= rule.min! ? "OK" : "NOK";
  if (rule.kind === "max") return value <= rule.max! ? "OK" : "NOK";
  if (rule.kind === "tolerance") {
    return value >= rule.target! - rule.minus! && value <= rule.target! + rule.plus! ? "OK" : "NOK";
  }
  return undefined;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<NewInspection />} />
      <Route path="/inspection/:id" element={<InspectionPage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <header>
        <Link to="/" className="brand">Digitálne protokoly ŽKV</Link>
        <span className="pilot">PILOT • lokálny režim</span>
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Inspection[]>([]);

  useEffect(() => {
    repository.list().then(setItems);
  }, []);

  const drafts = items.filter((item) => item.status !== "closed");
  const closed = items.filter((item) => item.status === "closed");

  return (
    <Shell title="Prehľad">
      <section className="hero">
        <div>
          <h2>Univerzálne kontroly, skúšky a merania</h2>
          <p>Konfigurovateľný pilot pre rozdielne typy železničných protokolov.</p>
        </div>
        <button onClick={() => navigate("/new")}>Nová kontrola</button>
      </section>

      <div className="cards">
        <div className="stat"><strong>{drafts.length}</strong><span>Rozpracované</span></div>
        <div className="stat"><strong>{closed.length}</strong><span>Uzatvorené</span></div>
        <div className="stat"><strong>{templates.length}</strong><span>Šablóny v pilote</span></div>
      </div>

      <h2>Rozpracované kontroly</h2>
      {drafts.length === 0 ? (
        <div className="empty">Zatiaľ nie je rozpracovaná žiadna kontrola.</div>
      ) : (
        <div className="list">
          {drafts.map((inspection) => {
            const template = templates.find((item) => item.id === inspection.templateId)!;
            return (
              <button
                className="row"
                key={inspection.id}
                onClick={() => navigate(`/inspection/${inspection.id}`)}
              >
                <div>
                  <b>{inspection.protocolNo}</b>
                  <span>{template.code} • {template.name}</span>
                </div>
                <div>
                  <b>{inspection.vehicleId}</b>
                  <span>{inspection.answers.length}/{expandedFields(template).length} bodov</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="actions">
        <button className="secondary" onClick={() => navigate("/history")}>História</button>
      </div>
    </Shell>
  );
}

function NewInspection() {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [protocolNo, setProtocolNo] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [uic, setUic] = useState("");
  const [orderNo, setOrderNo] = useState("");

  async function createInspection() {
    if (!protocolNo.trim() || !vehicleId.trim()) {
      window.alert("Vyplňte číslo protokolu a identifikáciu vozidla.");
      return;
    }
    const inspection: Inspection = {
      id: uid(),
      templateId,
      protocolNo: protocolNo.trim(),
      vehicleId: vehicleId.trim(),
      uic: uic.trim(),
      orderNo: orderNo.trim(),
      status: "in_progress",
      createdAt: now(),
      updatedAt: now(),
      answers: [],
    };
    await repository.save(inspection);
    navigate(`/inspection/${inspection.id}`);
  }

  return (
    <Shell title="Nová kontrola">
      <div className="form">
        <label>
          Šablóna protokolu
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.code} – {template.name}
              </option>
            ))}
          </select>
        </label>
        <label>Číslo protokolu<input value={protocolNo} onChange={(e) => setProtocolNo(e.target.value)} /></label>
        <label>Vozidlo / zostava<input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} /></label>
        <label>UIC<input value={uic} onChange={(e) => setUic(e.target.value)} /></label>
        <label>Zákazka<input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} /></label>
        <div className="actions">
          <button className="secondary" onClick={() => navigate(-1)}>Späť</button>
          <button onClick={createInspection}>Začať kontrolu</button>
        </div>
      </div>
    </Shell>
  );
}

function InspectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<Inspection>();
  const [section, setSection] = useState("");

  useEffect(() => {
    if (!id) return;
    repository.get(id).then((value) => {
      setInspection(value);
      if (value) {
        const template = templates.find((item) => item.id === value.templateId)!;
        setSection(expandedFields(template)[0]?.section || "");
      }
    });
  }, [id]);

  if (!inspection) return <Shell title="Načítavam"><div /></Shell>;

  const template = templates.find((item) => item.id === inspection.templateId)!;
  const fields = expandedFields(template);
  const sections = [...new Set(fields.map((field) => field.section))];
  const answers = new Map(inspection.answers.map((answer) => [answer.fieldId, answer]));

  async function setAnswer(field: FieldDef, patch: Partial<Answer>) {
    const existing = answers.get(field.id);
    const answer: Answer = { fieldId: field.id, updatedAt: now(), ...existing, ...patch };
    const next: Inspection = {
      ...inspection!,
      answers: [...inspection!.answers.filter((item) => item.fieldId !== field.id), answer],
      updatedAt: now(),
    };
    setInspection(next);
    await repository.save(next);
  }

  async function closeInspection() {
    const current = new Map(inspection!.answers.map((answer) => [answer.fieldId, answer]));
    const missing = fields.filter((field) => {
      if (!field.required) return false;
      const answer = current.get(field.id);
      return !answer || (answer.value === undefined && answer.result === undefined);
    });
    if (missing.length) {
      window.alert(`Nie je vyplnených ${missing.length} povinných bodov.`);
      return;
    }
    const next: Inspection = { ...inspection!, status: "closed", updatedAt: now() };
    await repository.save(next);
    navigate("/history");
  }

  return (
    <Shell title={`${inspection.protocolNo} • ${template.name}`}>
      <div className="progress">
        <span>{inspection.answers.length}/{fields.length} vyhodnotených</span>
        <progress value={inspection.answers.length} max={fields.length} />
        <span>{inspection.answers.filter((answer) => answer.result === "NOK").length} nezhôd</span>
      </div>

      <div className="workspace">
        <aside>
          {sections.map((item) => (
            <button className={item === section ? "active" : ""} onClick={() => setSection(item)} key={item}>
              {item}
              <small>{fields.filter((field) => field.section === item && answers.has(field.id)).length}/{fields.filter((field) => field.section === item).length}</small>
            </button>
          ))}
        </aside>
        <section className="fields">
          {fields.filter((field) => field.section === section).map((field) => (
            <Field key={field.id} field={field} answer={answers.get(field.id)} onChange={(patch) => setAnswer(field, patch)} />
          ))}
        </section>
      </div>

      <div className="sticky">
        <button className="secondary" onClick={() => navigate("/")}>Uložiť a odísť</button>
        <button onClick={closeInspection}>Uzatvoriť kontrolu</button>
      </div>
    </Shell>
  );
}

function Field({ field, answer, onChange }: { field: FieldDef; answer?: Answer; onChange: (patch: Partial<Answer>) => void }) {
  const failed = answer?.result === "NOK";

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const photos = await Promise.all([...files].map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    onChange({ photos: [...(answer?.photos || []), ...photos] });
  }

  return (
    <article className={`field ${failed ? "fail" : ""}`}>
      <div className="fieldhead">
        <div><b>{field.label}</b>{field.help && <small>{field.help}</small>}</div>
        {answer?.result && <span className={`badge ${answer.result.toLowerCase()}`}>{answer.result}</span>}
      </div>

      {field.type === "ok_nok" && (
        <div className="seg">
          <button className={answer?.result === "OK" ? "sel ok" : ""} onClick={() => onChange({ result: "OK", value: "OK" })}>OK</button>
          <button className={answer?.result === "NOK" ? "sel nok" : ""} onClick={() => onChange({ result: "NOK", value: "NOK" })}>NOK</button>
          {field.allowNA && <button className={answer?.result === "NA" ? "sel na" : ""} onClick={() => onChange({ result: "NA", value: "NA" })}>N/A</button>}
        </div>
      )}

      {field.type === "number" && (
        <div className="measure">
          <input
            type="number"
            step="any"
            value={String(answer?.value ?? "")}
            onChange={(e) => onChange({ value: e.target.value === "" ? undefined : Number(e.target.value), result: evaluateNumber(field, e.target.value) })}
          />
          <span>{field.unit}</span>
          <Rule field={field} />
        </div>
      )}

      {["text", "date", "time", "datetime"].includes(field.type) && (
        <input
          type={field.type === "text" ? "text" : field.type === "datetime" ? "datetime-local" : field.type}
          value={String(answer?.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )}

      {field.type === "single_choice" && (
        <select
          value={String(answer?.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value, result: e.target.value.toLowerCase().startsWith("nevy") ? "NOK" : "OK" })}
        >
          <option value="">Vyberte</option>
          {field.options?.map((option) => <option key={option}>{option}</option>)}
        </select>
      )}

      {field.type === "ndt" && (
        <div className="ndt">
          <select value={String(answer?.note ?? field.defaultMethod ?? "")} onChange={(e) => onChange({ note: e.target.value })}>
            {field.options?.map((option) => <option key={option}>{option}</option>)}
          </select>
          <span>{field.quantity} ks</span>
          <div className="seg">
            <button onClick={() => onChange({ value: "Vyhovuje", result: "OK" })}>Vyhovuje</button>
            <button onClick={() => onChange({ value: "Nevyhovuje", result: "NOK" })}>Nevyhovuje</button>
          </div>
        </div>
      )}

      {failed && (
        <div className="defect">
          <textarea placeholder="Popis nezhody" value={answer?.note || ""} onChange={(e) => onChange({ note: e.target.value })} />
          <label className="photo">
            Pridať fotografie
            <input hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => addPhotos(e.target.files)} />
          </label>
          <div className="thumbs">{answer?.photos?.map((photo, index) => <img src={photo} key={index} />)}</div>
        </div>
      )}
    </article>
  );
}

function Rule({ field }: { field: FieldDef }) {
  const rule = field.rule;
  if (!rule || rule.kind === "none") return null;
  let text = "";
  if (rule.kind === "range") text = `Rozsah ${rule.min} – ${rule.max} ${field.unit || ""}`;
  if (rule.kind === "min") text = `Minimum ${rule.min} ${field.unit || ""}`;
  if (rule.kind === "max") text = `Maximum ${rule.max} ${field.unit || ""}`;
  if (rule.kind === "tolerance") text = `Cieľ ${rule.target} ${field.unit || ""}, tolerancia -${rule.minus}/+${rule.plus}`;
  return <small>{text}</small>;
}

function HistoryPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  useEffect(() => { repository.list().then(setItems); }, []);

  return (
    <Shell title="História kontrol">
      <div className="list">
        {items.map((inspection) => {
          const template = templates.find((item) => item.id === inspection.templateId)!;
          return (
            <Link className="row" to={`/inspection/${inspection.id}`} key={inspection.id}>
              <div><b>{inspection.protocolNo}</b><span>{template.code} • {template.name}</span></div>
              <div><b>{inspection.status}</b><span>{new Date(inspection.updatedAt).toLocaleString("sk-SK")}</span></div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
