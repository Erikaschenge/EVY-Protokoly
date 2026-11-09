import type{Finding,ProtocolPackage,Template,Trainset}from'./types';
import{seedTemplates}from'./templates';
import{db,fileStorage,ensureFirebaseReady}from'./firebase';
import{collection,deleteDoc,doc,getDoc,getDocs,setDoc}from'firebase/firestore';
import{getDownloadURL,ref,uploadBytes}from'firebase/storage';
import{queueFindingPhotos}from'./services/uploadQueue';

const TEMPLATE_COLLECTION='templates';
const TRAINSET_COLLECTION='trainsets';
const PACKAGE_COLLECTION='protocolPackages';
const FINDING_COLLECTION='findings';

export const uid=()=>crypto.randomUUID();

function dataUrlToBlob(value:string):Blob{
  const [meta,data]=value.split(',',2);
  const mime=/data:([^;]+)/.exec(meta)?.[1]||'application/octet-stream';
  const binary=atob(data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}

async function uploadDataUrl(value:string,collectionName:string,documentId:string):Promise<string>{
  if(!fileStorage)throw new Error('Firebase Storage nie je dostupný.');
  const blob=dataUrlToBlob(value);
  const extension=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
  const path=`${collectionName}/${documentId}/${uid()}.${extension}`;
  const objectRef=ref(fileStorage,path);
  await uploadBytes(objectRef,blob,{contentType:blob.type,customMetadata:{documentId,collection:collectionName}});
  return getDownloadURL(objectRef);
}

async function externalizeFiles(value:unknown,collectionName:string,documentId:string):Promise<unknown>{
  if(typeof value==='string'&&value.startsWith('data:'))return uploadDataUrl(value,collectionName,documentId);
  if(Array.isArray(value))return Promise.all(value.map(item=>externalizeFiles(item,collectionName,documentId)));
  if(value&&typeof value==='object'){
    const result:Record<string,unknown>={};
    for(const[key,item]of Object.entries(value))result[key]=await externalizeFiles(item,collectionName,documentId);
    return result;
  }
  return value;
}

async function listDocuments<T>(collectionName:string):Promise<T[]>{
  await ensureFirebaseReady();
  const snapshot=await getDocs(collection(db!,collectionName));
  return snapshot.docs.map(item=>item.data()as T);
}

async function getDocument<T>(collectionName:string,id:string):Promise<T|undefined>{
  await ensureFirebaseReady();
  const snapshot=await getDoc(doc(db!,collectionName,id));
  return snapshot.exists()?snapshot.data()as T:undefined;
}

async function saveDocument<T extends{id:string}>(collectionName:string,item:T):Promise<void>{
  await ensureFirebaseReady();
  const prepared=await externalizeFiles(item,collectionName,item.id)as T;
  await setDoc(doc(db!,collectionName,item.id),prepared,{merge:false});
}

async function removeDocument(collectionName:string,id:string):Promise<void>{
  await ensureFirebaseReady();
  await deleteDoc(doc(db!,collectionName,id));
}

export const templateRepo={
  async list(){
    const items=(await listDocuments<Template>(TEMPLATE_COLLECTION)).sort((a,b)=>a.name.localeCompare(b.name));
    if(items.length)return items;
    for(const item of seedTemplates)await saveDocument(TEMPLATE_COLLECTION,item);
    return seedTemplates;
  },
  async get(id:string){return getDocument<Template>(TEMPLATE_COLLECTION,id)},
  async save(item:Template){await saveDocument(TEMPLATE_COLLECTION,item)},
  async remove(id:string){await removeDocument(TEMPLATE_COLLECTION,id)},
  async duplicate(item:Template){
    const copy={...item,id:uid(),code:item.code+'-COPY',name:item.name+' – kópia',status:'draft'as const,version:'1',updatedAt:new Date().toISOString(),fields:item.fields.map(field=>({...field,id:uid()}))};
    await this.save(copy);
    return copy;
  }
};

export const trainsetRepo={
  async list(){return(await listDocuments<Trainset>(TRAINSET_COLLECTION)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},
  async get(id:string){return getDocument<Trainset>(TRAINSET_COLLECTION,id)},
  async save(item:Trainset){await saveDocument(TRAINSET_COLLECTION,item)},
  async remove(id:string){await removeDocument(TRAINSET_COLLECTION,id)}
};

export const packageRepo={
  async list(){return(await listDocuments<ProtocolPackage>(PACKAGE_COLLECTION)).sort((a,b)=>a.name.localeCompare(b.name))},
  async get(id:string){return getDocument<ProtocolPackage>(PACKAGE_COLLECTION,id)},
  async save(item:ProtocolPackage){await saveDocument(PACKAGE_COLLECTION,item)},
  async remove(id:string){await removeDocument(PACKAGE_COLLECTION,id)}
};

export const findingRepo={
  async list(){return(await listDocuments<Finding>(FINDING_COLLECTION)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},
  async get(id:string){return getDocument<Finding>(FINDING_COLLECTION,id)},
  async save(item:Finding){
    await ensureFirebaseReady();
    const current=await getDocument<Finding>(FINDING_COLLECTION,item.id);
    const beforeNew=item.beforePhotos.filter(x=>x.startsWith('data:'));
    const afterNew=item.afterPhotos.filter(x=>x.startsWith('data:'));
    const unique=(values:string[])=>[...new Set(values.filter(x=>!x.startsWith('data:')))];
    const prepared={...item,beforePhotos:unique([...(current?.beforePhotos||[]),...item.beforePhotos]),afterPhotos:unique([...(current?.afterPhotos||[]),...item.afterPhotos])};
    await setDoc(doc(db!,FINDING_COLLECTION,item.id),prepared,{merge:false});
    await Promise.all([queueFindingPhotos(item.id,'beforePhotos',beforeNew),queueFindingPhotos(item.id,'afterPhotos',afterNew)]);
  },
  async remove(id:string){await removeDocument(FINDING_COLLECTION,id)},
  async nextNumber(){
    const year=String(new Date().getFullYear()).slice(-2),prefix=`TK-${year}-`;
    const numbers=(await this.list()).filter(item=>item.number.startsWith(prefix)).map(item=>Number(item.number.slice(prefix.length))).filter(Number.isFinite);
    return`${prefix}${String((numbers.length?Math.max(...numbers):0)+1).padStart(4,'0')}`;
  }
};
