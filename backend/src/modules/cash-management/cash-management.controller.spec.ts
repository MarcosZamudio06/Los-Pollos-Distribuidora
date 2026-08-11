import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CashManagementController } from './cash-management.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('CashManagementController', () => {
  it('authorizes own cash-shift lifecycle with atomic permissions', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(CashManagementController.prototype, 'listTerminals'),
      ),
    ).toEqual([PERMISSIONS.CASH_SHIFT_OPEN_OWN]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(CashManagementController.prototype, 'currentShift'),
      ),
    ).toEqual([PERMISSIONS.CASH_SHIFT_OPEN_OWN]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(CashManagementController.prototype, 'openShift'),
      ),
    ).toEqual([PERMISSIONS.CASH_SHIFT_OPEN_OWN]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(CashManagementController.prototype, 'closeShift'),
      ),
    ).toEqual([PERMISSIONS.CASH_SHIFT_CLOSE_OWN]);
  });

  it('keeps administrative cash actions restricted to ADMIN and SELLER', () => {
    for (const method of [
      'requestTerminalActivation',
      'reopenShift',
      'recordMovement',
    ]) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          methodOf(CashManagementController.prototype, method),
        ),
      ).toEqual(['ADMIN', 'SELLER']);
    }
  });

  it('installs a local RolesGuard so legacy role metadata is enforced', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      CashManagementController,
    );
    expect(guards).toEqual(
      expect.arrayContaining([expect.any(Function), expect.any(Function)]),
    );
  });
});
