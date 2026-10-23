import type {Inspection,Template} from './types';
import {seedTemplates} from './templates';
const IKEY='evy_inspections_v2',TKEY='evy_templates_v2';
const read=<T>(k:string,f:T):T=>{try{return JSON.parse(localStorage.getItem(k)||'') as T}catch{return f}};
export const uid=()=>crypto.randomUUID();
export const inspectionRepo={async list(){return read<Inspection[]>(IKEY,[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},async get(id:string){return read<Inspection[]>(IKEY,[]).find(x=>x.id===id)},async save(x:Inspection){const all=read<Inspection[]>(IKEY,[]).filter(y=>y.id!==x.id);localStorage.setItem(IKEY,JSON.stringify([...all,x]))}};
export const templateRepo={async list(){const saved=read<Template[]>(TKEY,[]);if(saved.length)return saved;localStorage.setItem(TKEY,JSON.stringify(seedTemplates));return seedTemplates},async save(x:Template){const all=(await this.list()).filter(y=>y.id!==x.id);localStorage.setItem(TKEY,JSON.stringify([...all,x]))},async remove(id:string){localStorage.setItem(TKEY,JSON.stringify((await this.list()).filter(x=>x.id!==id)))},async duplicate(x:Template){const n={...x,id:uid(),code:x.code+'-COPY',name:x.name+' – kópia',status:'draft' as const,version:'1',updatedAt:new Date().toISOString(),fields:x.fields.map(f=>({...f,id:uid(),referenceImages:f.referenceImages?.map(i=>({...i,id:uid()}))}))};await this.save(n);return n}};
