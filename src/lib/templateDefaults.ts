import type { VehicleSlot } from '../types';

export const UNIT_ROLES = ['HV5', 'VV5', 'VV6', 'HV6'] as const;

export const defaultUnitSlots = (): VehicleSlot[] =>
  UNIT_ROLES.map((role) => ({
    id: role.toLowerCase(),
    roleCode: role,
    label: role,
    vehicleType: role.startsWith('HV') ? 'Hnací vozeň' : 'Vložený vozeň',
    series: role,
    serialRequired: true,
    uicRequired: true,
  }));

export const singleVehicleSlot = (role: string): VehicleSlot => ({
  id: 'vehicle',
  roleCode: role || 'Vozidlo',
  label: role || 'Vozidlo',
  serialRequired: true,
  uicRequired: true,
});
