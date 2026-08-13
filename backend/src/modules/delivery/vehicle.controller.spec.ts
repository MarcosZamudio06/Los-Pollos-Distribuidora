import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { VehicleController } from './vehicle.controller';

describe('VehicleController permissions', () => {
  it('requires fleet.view for reads and fleet.manage for mutations', () => {
    const controllerPermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      VehicleController,
    );
    const createPermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      VehicleController.prototype.create,
    );
    const updatePermissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      VehicleController.prototype.update,
    );

    expect(controllerPermissions).toEqual([PERMISSIONS.FLEET_VIEW]);
    expect(createPermissions).toEqual([PERMISSIONS.FLEET_MANAGE]);
    expect(updatePermissions).toEqual([PERMISSIONS.FLEET_MANAGE]);
  });
});
