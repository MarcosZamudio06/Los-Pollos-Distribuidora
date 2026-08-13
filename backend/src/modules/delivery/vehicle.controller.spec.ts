import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { VehicleController } from './vehicle.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('VehicleController permissions', () => {
  it('requires fleet.view for reads and fleet.manage for mutations', () => {
    const controllerPermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      VehicleController,
    );
    const createPermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      methodOf(VehicleController.prototype, 'create'),
    );
    const updatePermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      methodOf(VehicleController.prototype, 'update'),
    );

    expect(controllerPermissions).toEqual([PERMISSIONS.FLEET_VIEW]);
    expect(createPermissions).toEqual([PERMISSIONS.FLEET_MANAGE]);
    expect(updatePermissions).toEqual([PERMISSIONS.FLEET_MANAGE]);
  });
});
