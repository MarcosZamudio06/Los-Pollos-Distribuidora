import {
  PERMISSION_DEFINITIONS,
  PERMISSION_METADATA,
  PERMISSIONS,
  ROLE_PERMISSION_KEYS,
} from './permissions';

describe('CEDIS permission contract', () => {
  const cedisPermissions = [
    PERMISSIONS.CEDIS_VIEW,
    PERMISSIONS.CEDIS_MANAGE,
    PERMISSIONS.CEDIS_DISPATCH,
    PERMISSIONS.CEDIS_RECEIVE_RETURNS,
    PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
    PERMISSIONS.CEDIS_RECONCILE,
    PERMISSIONS.CEDIS_CLOSE,
    PERMISSIONS.CEDIS_VIEW_COSTS,
  ];

  it('defines exactly the approved CEDIS permission keys with metadata', () => {
    expect(cedisPermissions).toEqual([
      'cedis.view',
      'cedis.manage',
      'cedis.dispatch',
      'cedis.receive_returns',
      'cedis.receive_supplies',
      'cedis.reconcile',
      'cedis.close',
      'cedis.view_costs',
    ]);
    expect(PERMISSION_DEFINITIONS.map(({ key }) => key)).toEqual(
      expect.arrayContaining(cedisPermissions),
    );
    cedisPermissions.forEach((permission) => {
      expect(PERMISSION_METADATA[permission]).toEqual(
        expect.objectContaining({ group: 'CEDIS' }),
      );
    });
  });

  it('grants all CEDIS permissions to ADMIN and receipt access to operational roles', () => {
    expect(
      ROLE_PERMISSION_KEYS.ADMIN.filter((permission) =>
        cedisPermissions.includes(permission),
      ),
    ).toEqual([...cedisPermissions].sort());
    expect(
      ROLE_PERMISSION_KEYS.WAREHOUSE.filter((permission) =>
        cedisPermissions.includes(permission),
      ),
    ).toEqual([
      PERMISSIONS.CEDIS_VIEW,
      PERMISSIONS.CEDIS_DISPATCH,
      PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
      PERMISSIONS.CEDIS_RECEIVE_RETURNS,
    ]);
    expect(ROLE_PERMISSION_KEYS.SELLER).toEqual([
      PERMISSIONS.CEDIS_VIEW,
      PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
    ]);
    expect(ROLE_PERMISSION_KEYS.SELLER).not.toContain(PERMISSIONS.COSTS_READ);
  });
});
