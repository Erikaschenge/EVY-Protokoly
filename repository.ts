import type {Inspection} from './types';
const KEY='rail_protocols_pilot_v1';
export interface Repository{list():Promise<Inspection[]>;get(id:string):Promise<Inspection|undefined>;save(x:Inspection):Promise<void>;remove(id:string):Promise<void>}
class LocalRepository implements Repository{private load(){return JSON.parse(localStorage.getItem(KEY)||'[]') as Inspection[]}async list(){return this.load().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}async get(id:string){return this.load().find(x=>x.id===id)}async save(x:Inspection){const a=this.load().filter(y=>y.id!==x.id);a.push(x);localStorage.setItem(KEY,JSON.stringify(a))}async remove(id:string){localStorage.setItem(KEY,JSON.stringify(this.load().filter(x=>x.id!==id)))}}
export const repository:Repository=new LocalRepository();
export const uid=()=>crypto.randomUUID();
