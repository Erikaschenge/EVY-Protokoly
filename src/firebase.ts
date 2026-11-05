import{getApp,getApps,initializeApp}from'firebase/app';
import{getAuth,onAuthStateChanged,signInAnonymously}from'firebase/auth';
import{getFirestore,initializeFirestore}from'firebase/firestore';
import{getStorage}from'firebase/storage';

const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID
};

const required=[config.apiKey,config.authDomain,config.projectId,config.storageBucket,config.messagingSenderId,config.appId];
export const firebaseConfigured=required.every(Boolean);

const app=firebaseConfigured?(getApps().length?getApp():initializeApp(config)):undefined;
export const auth=app?getAuth(app):undefined;
export const db=app?(()=>{try{return initializeFirestore(app,{ignoreUndefinedProperties:true})}catch{return getFirestore(app)}})():undefined;
export const fileStorage=app?getStorage(app):undefined;

let authPromise:Promise<void>|undefined;
export function ensureFirebaseReady():Promise<void>{
  if(!firebaseConfigured||!auth||!db||!fileStorage){
    return Promise.reject(new Error('Firebase nie je nakonfigurovaný. Doplňte premenné VITE_FIREBASE_* v GitHub Actions alebo v súbore .env.'));
  }
  if(auth.currentUser)return Promise.resolve();
  if(authPromise)return authPromise;
  authPromise=new Promise<void>((resolve,reject)=>{
    const unsubscribe=onAuthStateChanged(auth,user=>{if(user){unsubscribe();resolve()}},reject);
    signInAnonymously(auth).catch(error=>{unsubscribe();reject(new Error('Prihlásenie do Firebase zlyhalo. V Firebase Authentication povoľte Anonymous provider. '+(error?.message||'')))});
  }).finally(()=>{authPromise=undefined});
  return authPromise;
}
