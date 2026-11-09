import{doc,arrayUnion,updateDoc}from'firebase/firestore';
import{getDownloadURL,ref,uploadBytes}from'firebase/storage';
import{db,fileStorage,ensureFirebaseReady}from'../firebase';

export type UploadState='pending'|'uploading'|'failed';
type QueueItem={id:string;documentId:string;field:'beforePhotos'|'afterPhotos';blob:Blob;createdAt:string;state:UploadState;attempts:number;error?:string};
export type QueueSummary={pending:number;uploading:number;failed:number};
const DB_NAME='evy_upload_queue_v1',STORE='uploads';
const listeners=new Set<(s:QueueSummary)=>void>();
let running=false;

function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function all():Promise<QueueItem[]>{const database=await openDb();return new Promise((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function put(item:QueueItem){const database=await openDb();await new Promise<void>((resolve,reject)=>{const request=database.transaction(STORE,'readwrite').objectStore(STORE).put(item);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error)})}
async function remove(id:string){const database=await openDb();await new Promise<void>((resolve,reject)=>{const request=database.transaction(STORE,'readwrite').objectStore(STORE).delete(id);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error)})}
async function notify(){const items=await all();const summary={pending:items.filter(x=>x.state==='pending').length,uploading:items.filter(x=>x.state==='uploading').length,failed:items.filter(x=>x.state==='failed').length};listeners.forEach(x=>x(summary))}
export function subscribeUploadQueue(listener:(s:QueueSummary)=>void){listeners.add(listener);void notify();return()=>{listeners.delete(listener)}}
export async function queueFindingPhotos(documentId:string,field:'beforePhotos'|'afterPhotos',values:string[]){for(const value of values){if(!value.startsWith('data:'))continue;const blob=await(await fetch(value)).blob();await put({id:crypto.randomUUID(),documentId,field,blob,createdAt:new Date().toISOString(),state:'pending',attempts:0})}await notify();void processUploadQueue()}
export async function retryFailedUploads(){for(const item of await all())if(item.state==='failed')await put({...item,state:'pending',error:undefined});await notify();void processUploadQueue()}
export async function processUploadQueue(){if(running||!navigator.onLine)return;running=true;try{await ensureFirebaseReady();for(const original of await all()){if(original.state==='failed')continue;const item={...original,state:'uploading' as const,attempts:original.attempts+1};await put(item);await notify();try{if(!fileStorage||!db)throw new Error('Firebase nie je dostupný.');const ext=item.blob.type==='image/png'?'png':item.blob.type==='image/webp'?'webp':'jpg';const objectRef=ref(fileStorage,`findings/${item.documentId}/${item.id}.${ext}`);await uploadBytes(objectRef,item.blob,{contentType:item.blob.type,customMetadata:{documentId:item.documentId,collection:'findings'}});const url=await getDownloadURL(objectRef);await updateDoc(doc(db,'findings',item.documentId),{[item.field]:arrayUnion(url),updatedAt:new Date().toISOString()});await remove(item.id)}catch(error){await put({...item,state:item.attempts>=3?'failed':'pending',error:error instanceof Error?error.message:String(error)})}await notify()}}catch{}finally{running=false;const remaining=await all().catch(()=>[]);if(remaining.some(x=>x.state==='pending'))window.setTimeout(processUploadQueue,1500)}}
export function startUploadQueue(){window.addEventListener('online',processUploadQueue);void processUploadQueue()}
