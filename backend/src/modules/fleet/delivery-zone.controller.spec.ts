import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { DeliveryZoneController } from './delivery-zone.controller';
import { GeofenceService } from './geofence.service';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

function mockOf<T extends object>(target: T, key: keyof T): jest.Mock {
  return target[key] as jest.Mock;
}

describe('DeliveryZoneController', () => {
  it('protects reads with fleet.view and mutations with fleet.zones.manage', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(DeliveryZoneController.prototype, 'findAll'),
      ),
    ).toEqual([PERMISSIONS.FLEET_VIEW]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(DeliveryZoneController.prototype, 'create'),
      ),
    ).toEqual([PERMISSIONS.FLEET_ZONES_MANAGE]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(DeliveryZoneController.prototype, 'update'),
      ),
    ).toEqual([PERMISSIONS.FLEET_ZONES_MANAGE]);
  });

  it('forwards authenticated actors and does not accept actor identifiers from the body', async () => {
    const geofences = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id: 'zone-1' }),
      update: jest.fn().mockResolvedValue({ id: 'zone-1' }),
    } as unknown as jest.Mocked<GeofenceService>;
    const controller = new DeliveryZoneController(geofences);
    const user = { id: 'admin-1', role: 'ADMIN', permissions: [] } as never;
    const body = {
      name: 'Zona Norte',
      originLocationId: 'origin-1',
      geometry: { type: 'Polygon', coordinates: [] },
      createdByUserId: 'forged-user',
      updatedByUserId: 'forged-user',
    } as never;

    await controller.findAll({ active: true }, user);
    await controller.create(body, user);
    await controller.update('zone-1', body, user);

    expect(mockOf(geofences, 'findAll')).toHaveBeenCalledWith(
      { active: true },
      user,
    );
    expect(mockOf(geofences, 'create')).toHaveBeenCalledWith(body, user);
    expect(mockOf(geofences, 'update')).toHaveBeenCalledWith(
      'zone-1',
      body,
      user,
    );
  });
});
