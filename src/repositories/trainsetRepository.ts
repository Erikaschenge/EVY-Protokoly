import{ensureV4Migration}from'../services/migration';import type{Trainset}from'../models/domain';import{storage}from'./storage';
const KEY='evy_trainsets_v5';
export const trainsetRepository={list(){ensureV4Migration();return Promise.resolve(storage.read<Trainset[]>(KEY,[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))},async get(id:string){return(await this.list()).find(x=>x.id===id)},async save(item:Trainset){storage.write(KEY,[...(await this.list()).filter(x=>x.id!==item.id),item])}};
