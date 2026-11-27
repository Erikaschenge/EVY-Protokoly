import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { deleteObject, listAll, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, ensureFirebaseReady, fileStorage } from './firebase';
import { errorCode } from './lib/errors';
import { now, uid } from './lib/ids';
import { summarize } from './lib/protocolLogic';
import { write } from './lib/saveTracker';
import { queuePhotos, removeQueuedFor } from './services/uploadQueue';
import { seedTemplates } from './templates';
import type {
  Answer,
  Finding,
  FindingHistoryEntry,
  FindingPhotoField,
  FindingStatus,
  ProtocolHistoryEntry,
  ProtocolInstance,
  ProtocolPackage,
  Template,
  Trainset,
  TrainsetMeta,
} from './types';

export { uid };

// ---------------------------------------------------------------- pomocné funkcie

async function ready(): Promise<Firestore> {
  await ensureFirebaseReady();
  return db!;
}

const stripUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function deleteStorageUrl(url: string) {
  if (!fileStorage || !/^https?:\/\//.test(url)) return;
  try {
    await deleteObject(ref(fileStorage, url));
  } catch (error) {
    if (errorCode(error) !== 'storage/object-not-found') console.warn('Súbor sa nepodarilo odstrániť', url, error);
  }
}

async function deleteStorageFolder(path: string, filter: (name: string) => boolean = () => true) {
  if (!fileStorage) return;
  try {
    const listing = await listAll(ref(fileStorage, path));
    await Promise.all(listing.items.filter((x) => filter(x.name)).map((x) => deleteObject(x).catch(() => undefined)));
  } catch (error) {
    console.warn('Priečinok sa nepodarilo vyčistiť', path, error);
  }
}

async function deleteDocs(d: Firestore, refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(d);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await write(batch.commit());
  }
}

/** Nahrá obrázky vložené ako data: URL a nahradí ich adresou súboru (len pre šablóny). */
async function externalizeImages<T>(value: T, folder: string): Promise<T> {
  const visit = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string' && v.startsWith('data:')) {
      if (!fileStorage) throw new Error('Firebase Storage nie je dostupný.');
      const blob = await (await fetch(v)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const objectRef = ref(fileStorage, `${folder}/${uid()}.${ext}`);
      await uploadBytes(objectRef, blob, { contentType: blob.type });
      return getDownloadURL(objectRef);
    }
    if (Array.isArray(v)) return Promise.all(v.map(visit));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await visit(x);
      return out;
    }
    return v;
  };
  return (await visit(value)) as T;
}

// ---------------------------------------------------------------- šablóny

const templateRef = (d: Firestore, id: string) => doc(d, 'templates', id);

export const templateRepo = {
  async list(): Promise<Template[]> {
    const d = await ready();
    const snap = await getDocs(collection(d, 'templates'));
    const items = snap.docs.map((x) => ({ ...(x.data() as Template), id: x.id }));
    if (items.length) return items.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
    // Ukážkové šablóny sa vložia len raz – po zmazaní všetkých šablón sa už nevrátia.
    const marker = doc(d, 'system', 'seed');
    if ((await getDoc(marker)).exists()) return [];
    const batch = writeBatch(d);
    seedTemplates.forEach((t) => batch.set(templateRef(d, t.id), stripUndefined(t)));
    batch.set(marker, { templatesSeededAt: now() });
    await write(batch.commit());
    return [...seedTemplates];
  },
  async get(id: string): Promise<Template | undefined> {
    const d = await ready();
    const snap = await getDoc(templateRef(d, id));
    return snap.exists() ? { ...(snap.data() as Template), id } : undefined;
  },
  async save(item: Template): Promise<Template> {
    const d = await ready();
    const prepared = await externalizeImages({ ...item, updatedAt: now() }, `templates/${item.id}`);
    await write(setDoc(templateRef(d, item.id), stripUndefined(prepared)));
    return prepared;
  },
  async remove(id: string) {
    const d = await ready();
    // Obrázky šablóny sa zámerne nemažú: odkazujú na ne kópie šablóny v existujúcich protokoloch.
    await write(writeBatch(d).delete(templateRef(d, id)).commit());
  },
  async duplicate(item: Template): Promise<Template> {
    const copy: Template = {
      ...item,
      id: uid(),
      code: `${item.code}-COPY`,
      name: `${item.name} – kópia`,
      status: 'draft',
      version: '1',
      updatedAt: now(),
      fields: item.fields.map((f) => ({ ...f, id: uid() })),
    };
    return this.save(copy);
  },
};

// ---------------------------------------------------------------- balíky

export const packageRepo = {
  async list(): Promise<ProtocolPackage[]> {
    const d = await ready();
    const snap = await getDocs(collection(d, 'protocolPackages'));
    return snap.docs.map((x) => ({ ...(x.data() as ProtocolPackage), id: x.id })).sort((a, b) => a.name.localeCompare(b.name, 'sk'));
  },
  async get(id: string): Promise<ProtocolPackage | undefined> {
    const d = await ready();
    const snap = await getDoc(doc(d, 'protocolPackages', id));
    return snap.exists() ? { ...(snap.data() as ProtocolPackage), id } : undefined;
  },
  async save(item: ProtocolPackage) {
    const d = await ready();
    await write(setDoc(doc(d, 'protocolPackages', item.id), stripUndefined({ ...item, updatedAt: now() })));
  },
  async remove(id: string) {
    const d = await ready();
    await write(writeBatch(d).delete(doc(d, 'protocolPackages', id)).commit());
  },
};

// ---------------------------------------------------------------- protokoly

const trainsetRef = (d: Firestore, id: string) => doc(d, 'trainsets', id);
const protocolRef = (d: Firestore, sid: string, pid: string) => doc(d, 'trainsets', sid, 'protocols', pid);
export const protocolDocPath = (sid: string, pid: string) => `trainsets/${sid}/protocols/${pid}`;

type RawProtocol = Omit<ProtocolInstance, 'answers'> & { answers?: Answer[] | Record<string, Partial<Answer>> };

function normalizeProtocol(raw: RawProtocol, trainsetId: string): ProtocolInstance {
  const answers: Record<string, Answer> = {};
  if (Array.isArray(raw.answers)) {
    for (const a of raw.answers) answers[a.fieldId] = a;
  } else {
    for (const [key, a] of Object.entries(raw.answers || {})) answers[key] = { updatedAt: '', ...a, fieldId: key };
  }
  return {
    ...raw,
    trainsetId,
    templateSnapshot: raw.templateSnapshot ?? null,
    order: raw.order ?? 0,
    answers,
    history: raw.history || [],
    measuringDevices: raw.measuringDevices || [],
    protocolNumber: raw.protocolNumber || '',
    reportNumber: raw.reportNumber || '',
    protocolType: raw.protocolType || 'Vstupný',
  };
}

export function newProtocol(trainsetId: string, template: Template, vehicleId: string | undefined, order: number, user?: string): ProtocolInstance {
  const stamp = now();
  return {
    id: uid(),
    trainsetId,
    templateId: template.id,
    templateSnapshot: template,
    subjectType: template.header.subjectType,
    vehicleId,
    order,
    status: 'not_started',
    protocolNumber: '',
    reportNumber: '',
    protocolType: 'Vstupný',
    measuringDevices: [],
    answers: {},
    history: [{ id: uid(), action: 'created', createdAt: stamp, user }],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Zostaví argumenty pre update(): striedavo FieldPath a hodnota. undefined = zmazanie poľa. */
function fieldArgs(entries: [FieldPath | string, unknown][]): [FieldPath | string, unknown, ...unknown[]] {
  const flat: unknown[] = [];
  for (const [path, value] of entries) flat.push(path, value === undefined ? deleteField() : value);
  return flat as [FieldPath | string, unknown, ...unknown[]];
}

export const protocolRepo = {
  async list(sid: string): Promise<ProtocolInstance[]> {
    const d = await ready();
    const snap = await getDocs(collection(d, 'trainsets', sid, 'protocols'));
    return snap.docs.map((x) => normalizeProtocol({ ...(x.data() as RawProtocol), id: x.id }, sid)).sort((a, b) => a.order - b.order);
  },
  async get(sid: string, pid: string): Promise<ProtocolInstance | undefined> {
    const d = await ready();
    const snap = await getDoc(protocolRef(d, sid, pid));
    return snap.exists() ? normalizeProtocol({ ...(snap.data() as RawProtocol), id: pid }, sid) : undefined;
  },
  /** Priebežné sledovanie protokolu – zmeny od kolegov aj dokončené nahrávanie fotografií sa zobrazia hneď. */
  subscribe(sid: string, pid: string, next: (p: ProtocolInstance | null) => void, fail: (e: Error) => void): () => void {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;
    ready().then(
      (d) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          protocolRef(d, sid, pid),
          (snap) => next(snap.exists() ? normalizeProtocol({ ...(snap.data() as RawProtocol), id: pid }, sid) : null),
          fail,
        );
      },
      (e: Error) => fail(e),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  },
  async add(sid: string, protocols: ProtocolInstance[]) {
    if (!protocols.length) return;
    const d = await ready();
    const batch = writeBatch(d);
    const index: [FieldPath | string, unknown][] = [];
    for (const p of protocols) {
      batch.set(protocolRef(d, sid, p.id), stripUndefined(p));
      index.push([new FieldPath('protocolIndex', p.id), stripUndefined(summarize(p))]);
    }
    index.push(['updatedAt', now()]);
    batch.update(trainsetRef(d, sid), ...fieldArgs(index));
    await write(batch.commit());
  },
  /** Uloží iba zmenené časti jednej odpovede. Fotografie sa menia výhradne cez frontu a removePhoto. */
  async saveAnswer(p: ProtocolInstance, fieldId: string, patch: Partial<Omit<Answer, 'photos' | 'fieldId'>>, user?: string) {
    const d = await ready();
    const stamp = now();
    const merged: Answer = { ...p.answers[fieldId], ...patch, fieldId, updatedAt: stamp, updatedBy: user };
    const next: ProtocolInstance = {
      ...p,
      answers: { ...p.answers, [fieldId]: merged },
      status: p.status === 'not_started' ? 'in_progress' : p.status,
      updatedAt: stamp,
    };
    const entries: [FieldPath | string, unknown][] = Object.entries({ ...patch, fieldId, updatedAt: stamp, updatedBy: user }).map(
      ([k, v]) => [new FieldPath('answers', fieldId, k), v === undefined ? undefined : stripUndefined(v)],
    );
    entries.push(['status', next.status], ['updatedAt', stamp]);
    const batch = writeBatch(d);
    batch.update(protocolRef(d, p.trainsetId, p.id), ...fieldArgs(entries));
    batch.update(trainsetRef(d, p.trainsetId), new FieldPath('protocolIndex', p.id), stripUndefined(summarize(next)), 'updatedAt', stamp);
    await write(batch.commit());
  },
  async updateHeader(
    p: ProtocolInstance,
    patch: Partial<Pick<ProtocolInstance, 'protocolNumber' | 'reportNumber' | 'protocolType' | 'measuringDevices'>>,
  ) {
    const d = await ready();
    const stamp = now();
    const next = { ...p, ...patch, updatedAt: stamp };
    const batch = writeBatch(d);
    batch.update(protocolRef(d, p.trainsetId, p.id), stripUndefined({ ...patch, updatedAt: stamp }));
    batch.update(trainsetRef(d, p.trainsetId), new FieldPath('protocolIndex', p.id), stripUndefined(summarize(next)), 'updatedAt', stamp);
    await write(batch.commit());
  },
  async close(p: ProtocolInstance, user: string) {
    const d = await ready();
    const stamp = now();
    const entry: ProtocolHistoryEntry = { id: uid(), action: 'closed', createdAt: stamp, user };
    const next: ProtocolInstance = { ...p, status: 'closed', closedAt: stamp, closedBy: user, updatedAt: stamp };
    const batch = writeBatch(d);
    batch.update(protocolRef(d, p.trainsetId, p.id), {
      status: 'closed',
      closedAt: stamp,
      closedBy: user,
      updatedAt: stamp,
      history: arrayUnion(entry),
    });
    batch.update(trainsetRef(d, p.trainsetId), new FieldPath('protocolIndex', p.id), stripUndefined(summarize(next)), 'updatedAt', stamp);
    await write(batch.commit());
  },
  async reopen(p: ProtocolInstance, user: string, reason: string) {
    const d = await ready();
    const stamp = now();
    const entry: ProtocolHistoryEntry = { id: uid(), action: 'reopened', note: reason, createdAt: stamp, user };
    const next: ProtocolInstance = { ...p, status: 'in_progress', closedAt: undefined, closedBy: undefined, updatedAt: stamp };
    const batch = writeBatch(d);
    batch.update(protocolRef(d, p.trainsetId, p.id), {
      status: 'in_progress',
      closedAt: deleteField(),
      closedBy: deleteField(),
      updatedAt: stamp,
      history: arrayUnion(entry),
    });
    batch.update(trainsetRef(d, p.trainsetId), new FieldPath('protocolIndex', p.id), stripUndefined(summarize(next)), 'updatedAt', stamp);
    await write(batch.commit());
  },
  async addPhotos(p: ProtocolInstance, fieldId: string, blobs: Blob[]) {
    await queuePhotos(protocolDocPath(p.trainsetId, p.id), ['answers', fieldId, 'photos'], `trainsets/${p.trainsetId}`, blobs, `${p.id}_`);
  },
  async removePhoto(p: ProtocolInstance, fieldId: string, url: string) {
    const d = await ready();
    await write(updateDoc(protocolRef(d, p.trainsetId, p.id), new FieldPath('answers', fieldId, 'photos'), arrayRemove(url), 'updatedAt', now()));
    await deleteStorageUrl(url);
  },
  async remove(p: ProtocolInstance) {
    const d = await ready();
    await removeQueuedFor(protocolDocPath(p.trainsetId, p.id));
    const urls = Object.values(p.answers).flatMap((a) => a.photos || []);
    await Promise.all(urls.map(deleteStorageUrl));
    await deleteStorageFolder(`trainsets/${p.trainsetId}`, (name) => name.startsWith(`${p.id}_`));
    const batch = writeBatch(d);
    batch.delete(protocolRef(d, p.trainsetId, p.id));
    batch.update(trainsetRef(d, p.trainsetId), new FieldPath('protocolIndex', p.id), deleteField(), 'updatedAt', now());
    await write(batch.commit());
  },
};

// ---------------------------------------------------------------- súpravy

type RawTrainset = Partial<Trainset> & { id: string; protocols?: RawProtocol[] };

function normalizeTrainset(raw: RawTrainset): Trainset {
  return {
    id: raw.id,
    name: raw.name || '',
    customer: raw.customer || '',
    orderNumber: raw.orderNumber || '',
    orderTypes: raw.orderTypes || [],
    orderScopes: raw.orderScopes || [],
    ecmF2: raw.ecmF2 || '',
    series: raw.series || '',
    status: raw.status || 'active',
    vehicles: raw.vehicles || [],
    protocolIndex: raw.protocolIndex || {},
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || '',
  };
}

/**
 * Prevod zo staršieho formátu, kde boli všetky protokoly v jednom dokumente súpravy.
 * Protokoly sa presunú do podkolekcie a dostanú kópiu aktuálnej šablóny.
 */
async function migrateLegacy(d: Firestore, raw: RawTrainset, templates: () => Promise<Template[]>): Promise<Trainset> {
  const all = await templates();
  const set = normalizeTrainset(raw);
  const batch = writeBatch(d);
  const index: Trainset['protocolIndex'] = { ...set.protocolIndex };
  (raw.protocols || []).forEach((legacy, i) => {
    const template = all.find((t) => t.id === legacy.templateId) || null;
    const p = normalizeProtocol(
      {
        ...legacy,
        templateSnapshot: template,
        order: i + 1,
        history: [{ id: uid(), action: 'created', note: 'Prenesené zo staršej verzie aplikácie', createdAt: legacy.createdAt || now() }],
      },
      raw.id,
    );
    index[p.id] = summarize(p);
    batch.set(protocolRef(d, raw.id, p.id), stripUndefined(p));
  });
  batch.update(trainsetRef(d, raw.id), { protocolIndex: stripUndefined(index), protocols: deleteField() });
  // Nečakáme – offline sa migrácia dokončí po pripojení, lokálne údaje sú hneď správne.
  void write(batch.commit()).catch((e) => console.warn('Prevod súpravy zlyhal', raw.id, e));
  return { ...set, protocolIndex: index };
}

function templateLoader() {
  let cache: Promise<Template[]> | undefined;
  return () => (cache ??= templateRepo.list());
}

const META_KEYS: (keyof TrainsetMeta)[] = ['name', 'customer', 'orderNumber', 'orderTypes', 'orderScopes', 'ecmF2', 'series', 'status', 'vehicles'];

export const trainsetRepo = {
  async list(): Promise<Trainset[]> {
    const d = await ready();
    const snap = await getDocs(collection(d, 'trainsets'));
    const templates = templateLoader();
    const items = await Promise.all(
      snap.docs.map((x) => {
        const raw = { ...(x.data() as RawTrainset), id: x.id };
        return Array.isArray(raw.protocols) ? migrateLegacy(d, raw, templates) : normalizeTrainset(raw);
      }),
    );
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string): Promise<Trainset | undefined> {
    const d = await ready();
    const snap = await getDoc(trainsetRef(d, id));
    if (!snap.exists()) return undefined;
    const raw = { ...(snap.data() as RawTrainset), id };
    return Array.isArray(raw.protocols) ? migrateLegacy(d, raw, templateLoader()) : normalizeTrainset(raw);
  },
  async create(set: Trainset, protocols: ProtocolInstance[]) {
    const d = await ready();
    const batch = writeBatch(d);
    const index: Trainset['protocolIndex'] = {};
    for (const p of protocols) {
      batch.set(protocolRef(d, set.id, p.id), stripUndefined(p));
      index[p.id] = summarize(p);
    }
    batch.set(trainsetRef(d, set.id), stripUndefined({ ...set, protocolIndex: index }));
    await write(batch.commit());
  },
  /** Uloží len základné údaje zákazky – prehľad protokolov sa neprepisuje. */
  async updateMeta(id: string, meta: TrainsetMeta) {
    const d = await ready();
    const patch: Record<string, unknown> = { updatedAt: now() };
    for (const k of META_KEYS) patch[k] = meta[k];
    await write(updateDoc(trainsetRef(d, id), stripUndefined(patch)));
  },
  /** Odstráni súpravu vrátane protokolov, chýb a všetkých fotografií. */
  async remove(id: string) {
    const d = await ready();
    const protocols = await getDocs(collection(d, 'trainsets', id, 'protocols'));
    const findings = await getDocs(query(collection(d, 'findings'), where('trainsetId', '==', id)));
    await removeQueuedFor(`trainsets/${id}`);
    for (const f of findings.docs) await findingRepo.remove({ ...(f.data() as Finding), id: f.id });
    for (const p of protocols.docs) {
      const urls = Object.values(normalizeProtocol({ ...(p.data() as RawProtocol), id: p.id }, id).answers).flatMap((a) => a.photos || []);
      await Promise.all(urls.map(deleteStorageUrl));
    }
    await deleteStorageFolder(`trainsets/${id}`);
    await deleteDocs(d, [...protocols.docs.map((p) => protocolRef(d, id, p.id)), trainsetRef(d, id)]);
  },
  async countFindings(id: string): Promise<number> {
    const d = await ready();
    return (await getDocs(query(collection(d, 'findings'), where('trainsetId', '==', id)))).docs.length;
  },
};

// ---------------------------------------------------------------- evidencia chýb

const findingRef = (d: Firestore, id: string) => doc(d, 'findings', id);

function normalizeFinding(raw: Partial<Finding> & { id: string }): Finding {
  return {
    labelNumber: '',
    repairDescription: '',
    beforePhotos: [],
    afterPhotos: [],
    history: [],
    location: '',
    category: '',
    description: '',
    priority: 'medium',
    status: 'new',
    number: '',
    trainsetId: '',
    createdAt: '',
    updatedAt: '',
    ...raw,
  } as Finding;
}

/** Pridelí ďalšie číslo TK-RR-NNNN atomicky (transakcia nad počítadlom). Vyžaduje pripojenie. */
async function nextFindingNumber(d: Firestore): Promise<string> {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `TK-${year}-`;
  const counter = doc(d, 'counters', `findings-${year}`);
  let seed = 0;
  if (!(await getDoc(counter)).exists()) {
    // Prvé použitie počítadla – nadviažeme na už existujúce čísla.
    const existing = await getDocs(collection(d, 'findings'));
    seed = Math.max(
      0,
      ...existing.docs
        .map((x) => String(x.data().number || ''))
        .filter((n) => n.startsWith(prefix))
        .map((n) => Number(n.slice(prefix.length)))
        .filter(Number.isFinite),
    );
  }
  try {
    const value = await runTransaction(d, async (tx) => {
      const snap = await tx.get(counter);
      const current = snap.exists() ? Number(snap.data()?.value) || 0 : 0;
      const next = Math.max(current, seed) + 1;
      tx.set(counter, { value: next, updatedAt: now() });
      return next;
    });
    return `${prefix}${String(value).padStart(4, '0')}`;
  } catch (error) {
    if (!navigator.onLine || ['unavailable', 'failed-precondition'].includes(errorCode(error)))
      throw new Error('Na pridelenie čísla chyby je potrebné pripojenie na internet. Skúste to znova po pripojení.');
    throw error;
  }
}

export type NewFindingInput = Pick<Finding, 'labelNumber' | 'trainsetId' | 'vehicleId' | 'location' | 'category' | 'description' | 'priority'>;

export const findingRepo = {
  async list(): Promise<Finding[]> {
    const d = await ready();
    const snap = await getDocs(collection(d, 'findings'));
    return snap.docs.map((x) => normalizeFinding({ ...(x.data() as Finding), id: x.id })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string): Promise<Finding | undefined> {
    const d = await ready();
    const snap = await getDoc(findingRef(d, id));
    return snap.exists() ? normalizeFinding({ ...(snap.data() as Finding), id }) : undefined;
  },
  subscribe(id: string, next: (f: Finding | null) => void, fail: (e: Error) => void): () => void {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;
    ready().then(
      (d) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          findingRef(d, id),
          (snap) => next(snap.exists() ? normalizeFinding({ ...(snap.data() as Finding), id }) : null),
          fail,
        );
      },
      (e: Error) => fail(e),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  },
  async create(input: NewFindingInput, photos: Blob[], user: string): Promise<string> {
    const d = await ready();
    const number = await nextFindingNumber(d);
    const stamp = now();
    const finding: Finding = {
      ...input,
      id: uid(),
      number,
      status: 'new',
      beforePhotos: [],
      afterPhotos: [],
      repairDescription: '',
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: user,
      history: [{ id: uid(), action: 'created', note: 'Chyba zaevidovaná', createdAt: stamp, user }],
    };
    await write(setDoc(findingRef(d, finding.id), stripUndefined(finding)));
    if (photos.length) await queuePhotos(`findings/${finding.id}`, ['beforePhotos'], `findings/${finding.id}`, photos);
    return finding.id;
  },
  async changeStatus(item: Finding, status: FindingStatus, note: string, user: string, extra: { repairDescription?: string } = {}) {
    const d = await ready();
    const stamp = now();
    const entry: FindingHistoryEntry = stripUndefined({ id: uid(), action: status, note, createdAt: stamp, user });
    const patch: Record<string, unknown> = { status, updatedAt: stamp, history: arrayUnion(entry) };
    if (extra.repairDescription !== undefined) patch.repairDescription = extra.repairDescription;
    await write(updateDoc(findingRef(d, item.id), patch));
  },
  async saveRepairDescription(item: Finding, repairDescription: string) {
    const d = await ready();
    await write(updateDoc(findingRef(d, item.id), { repairDescription, updatedAt: now() }));
  },
  async addPhotos(item: Finding, field: FindingPhotoField, blobs: Blob[]) {
    await queuePhotos(`findings/${item.id}`, [field], `findings/${item.id}`, blobs);
  },
  async removePhoto(item: Finding, field: FindingPhotoField, url: string) {
    const d = await ready();
    await write(updateDoc(findingRef(d, item.id), field, arrayRemove(url), 'updatedAt', now()));
    await deleteStorageUrl(url);
  },
  async remove(item: Pick<Finding, 'id'> & Partial<Finding>) {
    const d = await ready();
    await removeQueuedFor(`findings/${item.id}`);
    await Promise.all([...(item.beforePhotos || []), ...(item.afterPhotos || [])].map(deleteStorageUrl));
    await deleteStorageFolder(`findings/${item.id}`);
    await write(writeBatch(d).delete(findingRef(d, item.id)).commit());
  },
};
