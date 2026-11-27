import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);

const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : undefined;

function createDb(): Firestore | undefined {
  if (!app) return undefined;
  try {
    // Offline cache: údaje a neodoslané zmeny prežijú výpadok signálu aj zatvorenie karty.
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    try {
      return initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      return getFirestore(app);
    }
  }
}

export const auth = app ? getAuth(app) : undefined;
export const db = createDb();
export const fileStorage = app ? getStorage(app) : undefined;

let pendingAuth: Promise<void> | undefined;

export function ensureFirebaseReady(): Promise<void> {
  if (!firebaseConfigured || !auth || !db || !fileStorage) {
    return Promise.reject(
      new Error('Firebase nie je nakonfigurovaný. Doplňte premenné VITE_FIREBASE_* v GitHub Actions alebo v súbore .env.'),
    );
  }
  if (auth.currentUser) return Promise.resolve();
  if (!pendingAuth) {
    const a = auth;
    pendingAuth = (async () => {
      // Najprv počkáme na uložené prihlásenie – funguje aj offline.
      await a.authStateReady();
      if (a.currentUser) return;
      try {
        await signInAnonymously(a);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        throw new Error(
          `Prihlásenie do Firebase zlyhalo. Skontrolujte pripojenie a či je v Firebase Authentication povolený Anonymous provider. ${detail}`,
        );
      }
    })().finally(() => {
      pendingAuth = undefined;
    });
  }
  return pendingAuth;
}
