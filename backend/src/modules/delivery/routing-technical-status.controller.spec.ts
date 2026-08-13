import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RoutingTechnicalStatusController } from './routing-technical-status.controller';
import { RoutingTechnicalStatusService } from './routing-technical-status.service';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('RoutingTechnicalStatusController', () => {
  it('restricts the endpoint to ADMIN', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(
          RoutingTechnicalStatusController.prototype,
          'getTechnicalStatus',
        ),
      ),
    ).toEqual(['ADMIN']);
  });

  it('returns the aggregated status without exposing provider URLs', async () => {
    const service = {
      getStatus: jest.fn().mockResolvedValue({
        status: 'operational',
        routingDataVersion: 'mx-2026-08',
        fleetPersistence: { status: 'up' },
        latestVehiclePositionAgeSeconds: 12,
        traffic: { available: false, provider: null },
        services: [
          { name: 'PostGIS', status: 'up', latencyMs: 2 },
          { name: 'Photon', status: 'up', latencyMs: 3 },
          { name: 'VROOM', status: 'up', latencyMs: 4 },
          { name: 'OSRM', status: 'up', latencyMs: 5 },
        ],
      }),
    } as unknown as RoutingTechnicalStatusService;
    const controller = new RoutingTechnicalStatusController(service);

    await expect(controller.getTechnicalStatus()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          routingDataVersion: 'mx-2026-08',
          fleetPersistence: { status: 'up' },
          latestVehiclePositionAgeSeconds: 12,
          traffic: { available: false, provider: null },
        }),
      }),
    );
    expect(JSON.stringify(await service.getStatus())).not.toContain('http');
  });
});
