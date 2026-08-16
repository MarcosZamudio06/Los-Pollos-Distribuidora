import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DeliveryRoutePlanningController } from './delivery-route-planning.controller';
import { DeliveryRoutePlanningService } from './delivery-route-planning.service';

describe('DeliveryRoutePlanningController', () => {
  it('keeps route planning restricted while exposing catalog access to warehouse users', () => {
    const driversHandler = Object.getOwnPropertyDescriptor(
      DeliveryRoutePlanningController.prototype,
      'drivers',
    )?.value;
    const vehiclesHandler = Object.getOwnPropertyDescriptor(
      DeliveryRoutePlanningController.prototype,
      'vehicles',
    )?.value;

    expect(
      Reflect.getMetadata(ROLES_KEY, DeliveryRoutePlanningController),
    ).toEqual(['ADMIN', 'SELLER']);
    expect(Reflect.getMetadata(ROLES_KEY, driversHandler)).toEqual([
      'ADMIN',
      'SELLER',
      'WAREHOUSE',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, vehiclesHandler)).toEqual([
      'ADMIN',
      'SELLER',
      'WAREHOUSE',
    ]);
  });

  it('returns dedicated read-only driver and vehicle catalogs', async () => {
    const planning = {
      findActiveDrivers: jest.fn().mockResolvedValue([{ id: 'driver-1' }]),
      findActiveVehicles: jest.fn().mockResolvedValue([{ id: 'vehicle-1' }]),
    } as unknown as DeliveryRoutePlanningService;
    const controller = new DeliveryRoutePlanningController(planning);
    const user = { id: 'admin-1', role: 'ADMIN', permissions: [] } as never;

    await expect(controller.drivers(user)).resolves.toEqual(
      expect.objectContaining({ data: { items: [{ id: 'driver-1' }] } }),
    );
    await expect(controller.vehicles(user)).resolves.toEqual(
      expect.objectContaining({ data: { items: [{ id: 'vehicle-1' }] } }),
    );
  });
});
