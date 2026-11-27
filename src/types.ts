export type TemplateStatus = 'draft' | 'active' | 'archived';
export type ProtocolStatus = 'not_started' | 'in_progress' | 'review' | 'closed';
export type SubjectType = 'single_vehicle' | 'vehicle_unit';
export type MeasuringMode = 'hidden' | 'optional' | 'required';
export type FieldType =
  | 'ok_nok'
  | 'number'
  | 'text'
  | 'multiline'
  | 'single_choice'
  | 'date'
  | 'time'
  | 'datetime'
  | 'binary'
  | 'ndt';
export type PhotoMode = 'optional' | 'always' | 'on_fail';
export type FieldScope = 'inspection' | 'all_vehicles' | 'selected_vehicles';
export type RuleKind = 'none' | 'range' | 'min' | 'max' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'tolerance' | 'manual';
export type EvalRule = { kind: RuleKind; min?: number; max?: number; target?: number; minus?: number; plus?: number };
export type ResultValue = 'OK' | 'NOK' | 'NA';

export type ReferenceImage = { id: string; name: string; dataUrl: string; caption?: string };
export type VehicleSlot = {
  id: string;
  roleCode: string;
  label: string;
  vehicleType?: string;
  series?: string;
  serialRequired: boolean;
  uicRequired: boolean;
};
export type HeaderDefinition = {
  subjectType: SubjectType;
  measuringMode: MeasuringMode;
  vehicleSlots: VehicleSlot[];
  templateEffectiveDate: string;
  subtitle?: string;
};
export type FieldDef = {
  id: string;
  rowType?: 'check' | 'measure' | 'component' | 'two_phase' | 'info' | 'final';
  displayNumber?: string;
  componentId?: string;
  componentCode?: string;
  materialNumber?: string;
  technicalLocation?: string;
  testPoint?: string;
  expectedText?: string;
  manualResult?: boolean;
  expectedBinary?: 0 | 1;
  zeroMeaning?: string;
  oneMeaning?: string;
  section: string;
  label: string;
  help?: string;
  type: FieldType;
  required?: boolean;
  allowNA?: boolean;
  unit?: string;
  options?: string[];
  rule?: EvalRule;
  photoMode?: PhotoMode;
  minPhotos?: number;
  referenceImages?: ReferenceImage[];
  /** Počet opakovaní bodu. Pri NDT počet kontrolovaných kusov v jednom bode. */
  quantity?: number;
  defaultMethod?: string;
  scope?: FieldScope;
  vehicleSlotIds?: string[];
};
export type Template = {
  id: string;
  code: string;
  name: string;
  vehicleSeries: string;
  version: string;
  status: TemplateStatus;
  description: string;
  header: HeaderDefinition;
  fields: FieldDef[];
  sectionImages?: Record<string, ReferenceImage[]>;
  updatedAt: string;
};

export type VehicleIdentity = {
  id: string;
  roleCode: string;
  label: string;
  vehicleType: string;
  series: string;
  serialNumber: string;
  uic: string;
};
export type MeasuringDevice = { id: string; name: string; inventoryNumber: string };
export type NdtItem = { method: string; result?: 'OK' | 'NOK'; note?: string };
export type Answer = {
  fieldId: string;
  vehicleId?: string;
  value?: string | number | boolean;
  items?: NdtItem[];
  result?: ResultValue;
  note?: string;
  photos?: string[];
  updatedAt: string;
  updatedBy?: string;
};
export type ProtocolHistoryEntry = {
  id: string;
  action: 'created' | 'closed' | 'reopened';
  note?: string;
  createdAt: string;
  user?: string;
};
/** Protokol je uložený v podkolekcii trainsets/{trainsetId}/protocols/{id}. */
export type ProtocolInstance = {
  id: string;
  trainsetId: string;
  templateId: string;
  /** Kópia šablóny v čase vytvorenia protokolu – neskoršie úpravy šablóny ho neovplyvnia. */
  templateSnapshot: Template | null;
  subjectType: SubjectType;
  vehicleId?: string;
  order: number;
  status: ProtocolStatus;
  protocolNumber: string;
  reportNumber: string;
  protocolType: string;
  measuringDevices: MeasuringDevice[];
  answers: Record<string, Answer>;
  history: ProtocolHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
};
/** Ľahký prehľad protokolu uložený priamo v dokumente súpravy pre zoznamy a priebeh. */
export type ProtocolSummary = {
  id: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  templateMissing?: boolean;
  vehicleId?: string;
  order: number;
  status: ProtocolStatus;
  nok: number;
  protocolNumber: string;
  updatedAt: string;
};
export type Trainset = {
  id: string;
  name: string;
  customer: string;
  orderNumber: string;
  orderTypes: string[];
  orderScopes: string[];
  ecmF2: string;
  series: string;
  status: 'active' | 'review' | 'closed';
  vehicles: VehicleIdentity[];
  protocolIndex: Record<string, ProtocolSummary>;
  createdAt: string;
  updatedAt: string;
};
export type TrainsetMeta = Omit<Trainset, 'id' | 'protocolIndex' | 'createdAt' | 'updatedAt'>;

export type PackageTarget = 'HV5' | 'VV5' | 'VV6' | 'HV6' | 'UNIT';
export type ProtocolPackageItem = { id: string; templateId: string; target: PackageTarget; required: boolean; order: number };
export type ProtocolPackage = {
  id: string;
  code: string;
  name: string;
  series: string;
  status: 'draft' | 'active' | 'archived';
  items: ProtocolPackageItem[];
  updatedAt: string;
};

export type FindingPriority = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'new' | 'assigned' | 'fixed' | 'rejected' | 'verified' | 'closed';
export type FindingPhotoField = 'beforePhotos' | 'afterPhotos';
export type FindingHistoryEntry = {
  id: string;
  action: FindingStatus | 'created';
  note?: string;
  createdAt: string;
  user?: string;
};
export type Finding = {
  id: string;
  number: string;
  labelNumber: string;
  trainsetId: string;
  vehicleId?: string;
  location: string;
  category: string;
  description: string;
  priority: FindingPriority;
  status: FindingStatus;
  beforePhotos: string[];
  repairDescription: string;
  afterPhotos: string[];
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  history: FindingHistoryEntry[];
};
