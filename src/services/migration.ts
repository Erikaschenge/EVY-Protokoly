import type{ProtocolTemplate,Trainset}from'../models/domain';
import{storage}from'../repositories/storage';

const MARKER='evy_migration_v4_to_v5_completed';
const REPORT='evy_migration_v4_to_v5_report';
const V4_TEMPLATES='evy_templates_v4';
const V4_TRAINSETS='evy_trainsets_v4';
const V5_TEMPLATES='evy_templates_v5';
const V5_TRAINSETS='evy_trainsets_v5';

export interface MigrationReport{
  completedAt:string;
  templatesFound:number;
  templatesImported:number;
  trainsetsFound:number;
  trainsetsImported:number;
  protocolsImported:number;
  skippedDuplicates:number;
  backupKeys:string[];
}

const raw=(key:string)=>localStorage.getItem(key);
const safeArray=(value:string|null):any[]=>{try{const parsed=value?JSON.parse(value):[];return Array.isArray(parsed)?parsed:[]}catch{return[]}};

function normalizeTemplate(source:any):ProtocolTemplate{
  const subject=source?.header?.subjectType==='vehicle_unit'||source?.vehicleSeries==='UNIT'?'vehicle_unit':'single_vehicle';
  const fields=Array.isArray(source?.fields)?source.fields.map((f:any)=>({
    ...f,
    id:String(f.id||crypto.randomUUID()),
    section:String(f.section||'Bez kapitoly'),
    label:String(f.label||'Kontrolný bod'),
    type:f.type||'ok_nok',
    scope:f.scope||'inspection',
    photoMode:f.photoMode||'optional',
    minPhotos:Number.isFinite(Number(f.minPhotos))?Number(f.minPhotos):0,
    referenceImages:Array.isArray(f.referenceImages)?f.referenceImages:[]
  })):[];
  return{
    ...source,
    id:String(source?.id||crypto.randomUUID()),
    code:String(source?.code||''),
    name:String(source?.name||'Migrovaná šablóna'),
    vehicleSeries:String(source?.vehicleSeries||(subject==='vehicle_unit'?'UNIT':'')),
    version:String(source?.version||'1'),
    status:['draft','active','archived'].includes(source?.status)?source.status:'draft',
    updatedAt:String(source?.updatedAt||new Date().toISOString()),
    header:{
      ...source?.header,
      subjectType:subject,
      measuringMode:['hidden','optional','required'].includes(source?.header?.measuringMode)?source.header.measuringMode:'hidden',
      templateEffectiveDate:String(source?.header?.templateEffectiveDate||new Date().toISOString().slice(0,10))
    },
    fields,
    sectionImages:source?.sectionImages&&typeof source.sectionImages==='object'?source.sectionImages:{}
  };
}

function normalizeTrainset(source:any):Trainset{
  const vehicles=Array.isArray(source?.vehicles)?source.vehicles.map((v:any)=>({
    id:String(v.id||crypto.randomUUID()),
    roleCode:String(v.roleCode||v.label||''),
    vehicleType:String(v.vehicleType||''),
    series:String(v.series||v.roleCode||''),
    serialNumber:String(v.serialNumber||''),
    uic:String(v.uic||'')
  })):[];
  const protocols=Array.isArray(source?.protocols)?source.protocols.map((p:any)=>({
    id:String(p.id||crypto.randomUUID()),
    templateId:String(p.templateId||''),
    vehicleId:p.vehicleId?String(p.vehicleId):undefined,
    status:['not_started','in_progress','review','closed'].includes(p.status)?p.status:'not_started',
    protocolNumber:String(p.protocolNumber||''),
    reportNumber:String(p.reportNumber||''),
    protocolType:String(p.protocolType||'Vstupný'),
    measuringDevices:Array.isArray(p.measuringDevices)?p.measuringDevices:[],
    answers:Array.isArray(p.answers)?p.answers.map((a:any)=>({
      ...a,
      fieldId:String(a.fieldId||''),
      updatedAt:String(a.updatedAt||new Date().toISOString()),
      photos:Array.isArray(a.photos)?a.photos:[]
    })):[],
    createdAt:String(p.createdAt||new Date().toISOString()),
    updatedAt:String(p.updatedAt||new Date().toISOString())
  })):[];
  return{
    id:String(source?.id||crypto.randomUUID()),
    name:String(source?.name||'Migrovaná súprava'),
    customer:String(source?.customer||''),
    orderNumber:String(source?.orderNumber||''),
    orderTypes:Array.isArray(source?.orderTypes)?source.orderTypes:[],
    orderScopes:Array.isArray(source?.orderScopes)?source.orderScopes:[],
    ecmF2:String(source?.ecmF2||''),
    series:String(source?.series||''),
    status:['active','review','closed'].includes(source?.status)?source.status:'active',
    vehicles,
    protocols,
    createdAt:String(source?.createdAt||new Date().toISOString()),
    updatedAt:String(source?.updatedAt||new Date().toISOString())
  };
}

export function ensureV4Migration():MigrationReport|undefined{
  const existingReport=storage.read<MigrationReport|undefined>(REPORT,undefined);
  if(localStorage.getItem(MARKER)==='1')return existingReport;

  const oldTemplateRaw=raw(V4_TEMPLATES);
  const oldTrainsetRaw=raw(V4_TRAINSETS);
  const oldTemplates=safeArray(oldTemplateRaw);
  const oldTrainsets=safeArray(oldTrainsetRaw);
  const backupKeys:string[]=[];
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');

  if(oldTemplateRaw){const key=`backup_${V4_TEMPLATES}_${stamp}`;localStorage.setItem(key,oldTemplateRaw);backupKeys.push(key)}
  if(oldTrainsetRaw){const key=`backup_${V4_TRAINSETS}_${stamp}`;localStorage.setItem(key,oldTrainsetRaw);backupKeys.push(key)}

  const currentTemplates=storage.read<ProtocolTemplate[]>(V5_TEMPLATES,[]);
  const currentTrainsets=storage.read<Trainset[]>(V5_TRAINSETS,[]);
  const templateIds=new Set(currentTemplates.map(x=>x.id));
  const trainsetIds=new Set(currentTrainsets.map(x=>x.id));
  const importedTemplates=oldTemplates.map(normalizeTemplate).filter(x=>!templateIds.has(x.id));
  const importedTrainsets=oldTrainsets.map(normalizeTrainset).filter(x=>!trainsetIds.has(x.id));

  if(importedTemplates.length)storage.write(V5_TEMPLATES,[...currentTemplates,...importedTemplates]);
  if(importedTrainsets.length)storage.write(V5_TRAINSETS,[...currentTrainsets,...importedTrainsets]);

  const report:MigrationReport={
    completedAt:new Date().toISOString(),
    templatesFound:oldTemplates.length,
    templatesImported:importedTemplates.length,
    trainsetsFound:oldTrainsets.length,
    trainsetsImported:importedTrainsets.length,
    protocolsImported:importedTrainsets.reduce((sum,x)=>sum+x.protocols.length,0),
    skippedDuplicates:(oldTemplates.length-importedTemplates.length)+(oldTrainsets.length-importedTrainsets.length),
    backupKeys
  };
  storage.write(REPORT,report);
  localStorage.setItem(MARKER,'1');
  return report;
}

export const getMigrationReport=()=>storage.read<MigrationReport|undefined>(REPORT,undefined);
