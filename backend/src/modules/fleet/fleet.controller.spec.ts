import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { GeofenceService } from './geofence.service';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

function mockOf<T extends object>(target: T, key: keyof T): jest.Mock {
  return target[key] as jest.Mock;
}

describe('FleetController', () => {
  it('declares the required role and permissions for the three contracts', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(FleetController.prototype, 'publishPosition'),
      ),
    ).toEqual(['DRIVER']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(FleetController.prototype, 'publishPosition'),
      ),
    ).toEqual([PERMISSIONS.FLEET_POSITION_PUBLISH]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(FleetController.prototype, 'live'),
      ),
    ).toEqual([PERMISSIONS.FLEET_VIEW]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(FleetController.prototype, 'routePositions'),
      ),
    ).toEqual([PERMISSIONS.FLEET_VIEW]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        methodOf(FleetController.prototype, 'heatmap'),
      ),
    ).toEqual([PERMISSIONS.FLEET_VIEW]);
  });

  it('forwards the authenticated user to publish, live, and history services', async () => {
    const service = {
      publishPosition: jest.fn().mockResolvedValue({ id: 'position-1' }),
      getLive: jest.fn().mockResolvedValue({ serverTime: 'now', items: [] }),
      getRoutePositions: jest.fn().mockResolvedValue({ items: [] }),
      getHeatmap: jest.fn().mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      }),
    } as unknown as jest.Mocked<FleetService>;
    const geofenceService = {
      findEvents: jest.fn().mockResolvedValue({ items: [] }),
    } as unknown as jest.Mocked<GeofenceService>;
    const controller = new FleetController(service, geofenceService);
    const user = {
      id: 'driver-1',
      email: 'driver@example.com',
      name: 'Driver',
      role: 'DRIVER',
      permissions: [PERMISSIONS.FLEET_POSITION_PUBLISH],
      mustChangePassword: false,
    };

    await expect(
      controller.publishPosition(
        {
          clientEventId: 'event-1',
          latitude: 19.1738,
          longitude: -96.1342,
          recordedAt: '2026-08-12T16:00:00.000Z',
        },
        user,
      ),
    ).resolves.toEqual({
      success: true,
      message: 'Fleet position recorded successfully',
      data: { id: 'position-1' },
    });
    await expect(controller.live({}, user)).resolves.toEqual({
      success: true,
      message: 'Fleet live snapshot retrieved successfully',
      data: { serverTime: 'now', items: [] },
    });
    await expect(
      controller.routePositions('route-1', { limit: 10 }, user),
    ).resolves.toEqual({
      success: true,
      message: 'Fleet route positions retrieved successfully',
      data: { items: [] },
    });
    await expect(
      controller.heatmap(
        {
          metric: 'DELIVERIES',
          from: '2026-08-12T00:00:00.000Z',
          to: '2026-08-12T23:59:59.999Z',
        },
        user,
      ),
    ).resolves.toEqual({
      success: true,
      message: 'Fleet heatmap retrieved successfully',
      data: { type: 'FeatureCollection', features: [] },
    });

    expect(mockOf(service, 'publishPosition')).toHaveBeenCalledWith(
      expect.objectContaining({ clientEventId: 'event-1' }),
      user,
    );
    expect(mockOf(service, 'getLive')).toHaveBeenCalledWith({}, user);
    expect(mockOf(service, 'getRoutePositions')).toHaveBeenCalledWith(
      'route-1',
      { limit: 10 },
      user,
    );
    expect(mockOf(service, 'getHeatmap')).toHaveBeenCalledWith(
      {
        metric: 'DELIVERIES',
        from: '2026-08-12T00:00:00.000Z',
        to: '2026-08-12T23:59:59.999Z',
      },
      user,
    );
  });

  it('declares fleet.view for geofence event reads and forwards filters', async () => {
    const service = {
      publishPosition: jest.fn(),
      getLive: jest.fn(),
      getRoutePositions: jest.fn(),
    } as unknown as jest.Mocked<FleetService>;
    const geofenceService = {
      findEvents: jest.fn().mockResolvedValue({ items: [] }),
    } as unknown as jest.Mocked<GeofenceService>;
    const controller = new FleetController(service, geofenceService);
    const method = methodOf(FleetController.prototype, 'geofenceEvents');

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, method)).toEqual([
      PERMISSIONS.FLEET_VIEW,
    ]);

    const query = { vehicleId: 'vehicle-1', limit: 10 };
    const user = { id: 'admin-1', role: 'ADMIN', permissions: [] } as never;
    await expect(controller.geofenceEvents(query, user)).resolves.toEqual({
      success: true,
      message: 'Fleet geofence events retrieved successfully',
      data: { items: [] },
    });
    expect(mockOf(geofenceService, 'findEvents')).toHaveBeenCalledWith(
      query,
      user,
    );
  });
});
