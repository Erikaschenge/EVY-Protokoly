import { errorMessage } from './errors';

export type SaveState = { pending: number; error?: string; online: boolean };
const listeners = new Set<(s: SaveState) => void>();
let pending = 0;
let lastError: string | undefined;

function emit() {
  const state: SaveState = { pending, error: lastError, online: navigator.onLine };
  listeners.forEach((l) => l(state));
}

window.addEventListener('online', emit);
window.addEventListener('offline', emit);

/** Sleduje zápis, aby používateľ vždy videl, či sa údaje uložili. */
export function trackSave<T>(promise: Promise<T>): Promise<T> {
  pending++;
  lastError = undefined;
  emit();
  return promise
    .catch((e: unknown) => {
      lastError = errorMessage(e);
      throw e;
    })
    .finally(() => {
      pending--;
      emit();
    });
}

/**
 * Zápis do Firestore. Online čaká na potvrdenie servera (chyby sa zobrazia priamo pri akcii).
 * Offline alebo pri veľmi pomalom spojení nečaká – zmena je uložená v zariadení
 * a odošle sa po pripojení; stav ukazuje indikátor v hlavičke.
 */
export function write(promise: Promise<unknown>, waitMs = 8000): Promise<void> {
  const tracked = trackSave(promise);
  if (!navigator.onLine) {
    tracked.catch(() => undefined);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, waitMs);
    tracked.then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function subscribeSaveState(listener: (s: SaveState) => void) {
  listeners.add(listener);
  listener({ pending, error: lastError, online: navigator.onLine });
  return () => {
    listeners.delete(listener);
  };
}

export function clearSaveError() {
  lastError = undefined;
  emit();
}
