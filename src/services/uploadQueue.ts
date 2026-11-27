import { arrayUnion, doc, FieldPath, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, ensureFirebaseReady, fileStorage } from '../firebase';
import { errorCode, errorMessage } from '../lib/errors';

/**
 * Fronta fotografií v IndexedDB. Fotografia sa najprv uloží v zariadení a nahrá sa,
 * keď je k dispozícii pripojenie. Po nahraní sa jej adresa pridá do poľa dokumentu
 * cez arrayUnion, takže súbežné zápisy iných polí ju neprepíšu.
 */
export type UploadState = 'pending' | 'uploading' | 'failed';
export type QueueItem = {
  id: string;
  /** Cesta k dokumentu Firestore, napr. findings/abc alebo trainsets/x/protocols/y */
  docPath: string;
  /** Cesta k poľu s adresami fotografií, napr. ['beforePhotos'] alebo ['answers', fieldId, 'photos'] */
  field: string[];
  storagePath: string;
  blob: Blob;
  createdAt: string;
  state: UploadState;
  attempts: number;
  error?: string;
};
type LegacyItem = {
  id: string;
  documentId: string;
  field: 'beforePhotos' | 'afterPhotos';
  blob: Blob;
  createdAt: string;
  state: UploadState;
  attempts: number;
  error?: string;
};
export type QueueSummary = { pending: number; uploading: number; failed: number };

const DB_NAME = 'evy_upload_queue_v1';
const STORE = 'uploads';
const UPLOAD_TIMEOUT_MS = 60000;
const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 3;

const summaryListeners = new Set<(s: QueueSummary) => void>();
const itemListeners = new Set<(items: QueueItem[]) => void>();
let running = false;
let restartRequested = false;
let started = false;
let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const extensionOf = (blob: Blob) => (blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');

function normalize(x: QueueItem | LegacyItem): QueueItem {
  if ('docPath' in x) return x;
  // Položky zo staršej verzie fronty (len pre evidenciu chýb).
  return {
    id: x.id,
    docPath: `findings/${x.documentId}`,
    field: [x.field],
    storagePath: `findings/${x.documentId}/${x.id}.${extensionOf(x.blob)}`,
    blob: x.blob,
    createdAt: x.createdAt,
    state: x.state,
    attempts: x.attempts,
    error: x.error,
  };
}

async function all(): Promise<QueueItem[]> {
  const database = await openDb();
  const raw = await request(
    database.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<(QueueItem | LegacyItem)[]>,
  );
  return raw.map(normalize).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function put(item: QueueItem) {
  const database = await openDb();
  await request(database.transaction(STORE, 'readwrite').objectStore(STORE).put(item));
}

async function remove(id: string) {
  const database = await openDb();
  await request(database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
}

async function notify() {
  const items = await all().catch(() => [] as QueueItem[]);
  const summary: QueueSummary = {
    pending: items.filter((x) => x.state === 'pending').length,
    uploading: items.filter((x) => x.state === 'uploading').length,
    failed: items.filter((x) => x.state === 'failed').length,
  };
  summaryListeners.forEach((l) => l(summary));
  itemListeners.forEach((l) => l(items));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Operácia prekročila ${ms / 1000} sekúnd.`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function processOne(original: QueueItem) {
  const item: QueueItem = { ...original, state: 'uploading', attempts: original.attempts + 1 };
  await put(item);
  await notify();
  try {
    if (!fileStorage || !db) throw new Error('Firebase nie je dostupný.');
    const objectRef = ref(fileStorage, item.storagePath);
    // Bajty namiesto Blobu – Safari má problémy s Blobmi načítanými z IndexedDB.
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    await withTimeout(
      uploadBytes(objectRef, bytes, { contentType: item.blob.type || 'image/jpeg', customMetadata: { docPath: item.docPath } }),
      UPLOAD_TIMEOUT_MS,
    );
    const url = await withTimeout(getDownloadURL(objectRef), 15000);
    try {
      await withTimeout(
        updateDoc(doc(db, item.docPath), new FieldPath(...item.field), arrayUnion(url), 'updatedAt', new Date().toISOString()),
        15000,
      );
    } catch (error) {
      if (errorCode(error) === 'not-found') {
        // Záznam medzitým niekto odstránil – fotografiu zahodíme.
        await deleteObject(objectRef).catch(() => undefined);
        await remove(item.id);
        return;
      }
      throw error;
    }
    await remove(item.id);
  } catch (error) {
    await put({ ...item, state: item.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: errorMessage(error) });
  } finally {
    await notify();
  }
}

export async function processUploadQueue(): Promise<void> {
  if (running) {
    restartRequested = true;
    return;
  }
  if (!navigator.onLine) return;
  running = true;
  restartRequested = false;
  try {
    await ensureFirebaseReady();
    for (const item of await all()) {
      if (item.state === 'failed') continue;
      await processOne(item);
    }
  } catch {
    /* ďalší pokus príde z časovača alebo po pripojení */
  } finally {
    running = false;
    const remaining = await all().catch(() => [] as QueueItem[]);
    if (restartRequested || remaining.some((x) => x.state === 'pending'))
      window.setTimeout(() => void processUploadQueue(), RETRY_DELAY_MS);
  }
}

/** Zaradí fotografie do fronty. Súbory sa uložia ako {folder}/{namePrefix}{id}.jpg */
export async function queuePhotos(docPath: string, field: string[], folder: string, blobs: Blob[], namePrefix = '') {
  for (const blob of blobs) {
    const id = crypto.randomUUID();
    await put({
      id,
      docPath,
      field,
      storagePath: `${folder}/${namePrefix}${id}.${extensionOf(blob)}`,
      blob,
      createdAt: new Date().toISOString(),
      state: 'pending',
      attempts: 0,
    });
  }
  await notify();
  void processUploadQueue();
}

export async function retryFailedUploads() {
  for (const item of await all()) if (item.state === 'failed') await put({ ...item, state: 'pending', attempts: 0, error: undefined });
  await notify();
  void processUploadQueue();
}

/** Odstráni z fronty fotografie dokumentov, ktorých cesta je rovná prefixu alebo pod ním. */
export async function removeQueuedFor(docPathPrefix: string) {
  for (const item of await all().catch(() => [] as QueueItem[]))
    if (item.docPath === docPathPrefix || item.docPath.startsWith(`${docPathPrefix}/`)) await remove(item.id);
  await notify();
}

export async function removeQueuedItem(id: string) {
  await remove(id);
  await notify();
}

export function subscribeUploadQueue(listener: (s: QueueSummary) => void) {
  summaryListeners.add(listener);
  void notify();
  return () => {
    summaryListeners.delete(listener);
  };
}

export function subscribeQueueItems(listener: (items: QueueItem[]) => void) {
  itemListeners.add(listener);
  void notify();
  return () => {
    itemListeners.delete(listener);
  };
}

export async function startUploadQueue() {
  if (started) return;
  started = true;
  for (const item of await all().catch(() => [] as QueueItem[]))
    if (item.state === 'uploading') await put({ ...item, state: 'pending' });
  window.addEventListener('online', () => void processUploadQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void processUploadQueue();
  });
  window.setInterval(() => void processUploadQueue(), 15000);
  await notify();
  void processUploadQueue();
}
