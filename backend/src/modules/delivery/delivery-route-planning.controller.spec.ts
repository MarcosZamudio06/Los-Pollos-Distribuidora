import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DeliveryRoutePlanningController } from './delivery-route-planning.controller';
import { DeliveryRoutePlanningService } from './delivery-route-planning.service';

describe('DeliveryRoutePlanningController', () => {
  it('allows ADMIN and SELLER to use every planner endpoint', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, DeliveryRoutePlanningController),
    ).toEqual(['ADMIN', 'SELLER']);
  });

  it('returns dedicated read-only driver and vehicle catalogs', async () => {
    const planning = {
      findActiveDrivers: jest.fn().mockResolvedValue([{ id: 'driver-1' }]),
      findActiveVehicles: jest.fn().mockResolvedValue([{ id: 'vehicle-1' }]),
    } as unknown as DeliveryRoutePlanningService;
    const controller = new DeliveryRoutePlanningController(planning);

    await expect(controller.drivers()).resolves.toEqual(
      expect.objectContaining({ data: { items: [{ id: 'driver-1' }] } }),
    );
    await expect(controller.vehicles()).resolves.toEqual(
      expect.objectContaining({ data: { items: [{ id: 'vehicle-1' }] } }),
    );
  });
});
