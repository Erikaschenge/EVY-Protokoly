export type Status='draft'|'in_progress'|'submitted'|'closed';
export type FieldType='ok_nok'|'boolean'|'number'|'text'|'single_choice'|'date'|'time'|'datetime'|'photo'|'ndt';
export type EvalRule={kind:'none'|'range'|'min'|'max'|'tolerance';min?:number;max?:number;target?:number;minus?:number;plus?:number};
export type FieldDef={id:string;section:string;group?:string;label:string;help?:string;type:FieldType;required?:boolean;allowNA?:boolean;unit?:string;options?:string[];rule?:EvalRule;photoOnFail?:boolean;repeatBy?:string[];quantity?:number;defaultMethod?:string};
export type Template={id:string;code:string;name:string;vehicleSeries:string;version:string;description:string;fields:FieldDef[]};
export type Answer={fieldId:string;repeatKey?:string;value?:string|number|boolean;result?:'OK'|'NOK'|'NA';note?:string;photos?:string[];updatedAt:string};
export type Inspection={id:string;templateId:string;protocolNo:string;vehicleId:string;uic?:string;orderNo?:string;status:Status;createdAt:string;updatedAt:string;answers:Answer[]};
