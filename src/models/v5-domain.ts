/** v0.5 target domain model. Existing v0.4 types remain active during Alpha 1. */
export type VehicleRole='HV5'|'VV5'|'VV6'|'HV6';
export type TemplateTarget=VehicleRole|'UNIT'|'ALL';
export type FindingPriority='critical'|'high'|'medium'|'low';
export type FindingStatus='new'|'assigned'|'fixed'|'rejected'|'verified'|'closed';
export interface PhotoAsset{id:string;fileName:string;mimeType:string;dataUrl:string;createdAt:string;createdBy?:string}
export interface FindingHistory{id:string;findingId:string;action:'created'|'assigned'|'fixed'|'rejected'|'verified'|'closed';note?:string;photoIds?:string[];createdAt:string;user?:string}
export interface Finding{id:string;number:string;trainsetId:string;vehicleId?:string;location:string;category:string;description:string;photoIds:string[];priority:FindingPriority;status:FindingStatus;createdAt:string;updatedAt:string;createdBy?:string;assignedTo?:string;history:FindingHistory[]}
export interface ProtocolPackageItem{templateId:string;target:VehicleRole|'UNIT';required:boolean;order:number}
export interface ProtocolPackage{id:string;code:string;name:string;series:string;status:'draft'|'active'|'archived';items:ProtocolPackageItem[];updatedAt:string}
