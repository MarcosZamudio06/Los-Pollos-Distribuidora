export const EMPLOYEE_LOCATION_TYPES = [
  'BRANCH',
  'WAREHOUSE',
  'DISTRIBUTION_CENTER',
  'MIXED',
  'EXTERNAL_POINT_OF_SALE',
] as const;

const WAREHOUSE_LOCATION_TYPES = [
  'BRANCH',
  'WAREHOUSE',
  'DISTRIBUTION_CENTER',
  'MIXED',
] as const;

const SELLER_LOCATION_TYPES = [
  'BRANCH',
  'DISTRIBUTION_CENTER',
  'MIXED',
  'EXTERNAL_POINT_OF_SALE',
] as const;

export function employeeLocationTypesForRole(
  roleName: string,
): readonly string[] {
  if (roleName === 'ADMIN') return EMPLOYEE_LOCATION_TYPES;
  if (roleName === 'WAREHOUSE') return WAREHOUSE_LOCATION_TYPES;
  return SELLER_LOCATION_TYPES;
}

export function isEmployeeLocationAllowed(
  roleName: string,
  locationType: string,
): boolean {
  return employeeLocationTypesForRole(roleName).includes(locationType);
}
