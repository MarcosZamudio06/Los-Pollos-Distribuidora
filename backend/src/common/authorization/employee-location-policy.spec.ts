import {
  employeeLocationTypesForRole,
  isEmployeeLocationAllowed,
} from './employee-location-policy';

describe('employee location policy', () => {
  it.each(['ADMIN', 'BILLING', 'COLLECTIONS', 'DRIVER', 'SELLER', 'WAREHOUSE'])(
    'allows %s employees to use an active CEDIS',
    (roleName) => {
      expect(isEmployeeLocationAllowed(roleName, 'DISTRIBUTION_CENTER')).toBe(
        true,
      );
    },
  );

  it('keeps the existing warehouse-only location restriction', () => {
    expect(employeeLocationTypesForRole('WAREHOUSE')).not.toContain(
      'EXTERNAL_POINT_OF_SALE',
    );
    expect(employeeLocationTypesForRole('SELLER')).toContain(
      'EXTERNAL_POINT_OF_SALE',
    );
  });
});
