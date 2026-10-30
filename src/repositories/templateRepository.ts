import type{ProtocolTemplate}from'../models/domain';import{seedTemplates}from'../models/seeds';import{storage}from'./storage';
const KEY='evy_templates_v5';
export const templateRepository={list(){let x=storage.read<ProtocolTemplate[]>(KEY,[]);if(!x.length){x=seedTemplates;storage.write(KEY,x)}return Promise.resolve(x)},async get(id:string){return(await this.list()).find(x=>x.id===id)},async save(item:ProtocolTemplate){storage.write(KEY,[...(await this.list()).filter(x=>x.id!==item.id),item])},async remove(id:string){storage.write(KEY,(await this.list()).filter(x=>x.id!==id))}};
