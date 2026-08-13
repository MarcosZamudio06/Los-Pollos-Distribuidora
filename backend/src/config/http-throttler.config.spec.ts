import { ConfigService } from '@nestjs/config';
import { PERMISSIONS } from '../common/authorization/permissions';
import { FleetController } from '../modules/fleet/fleet.controller';
import { createHttpThrottlerOptions } from './http-throttler.config';

describe('fleet tracking rate limit', () => {
  it('uses a per-driver bounded window without changing the global limit', async () => {
    const options = createHttpThrottlerOptions(
      new ConfigService({
        RATE_LIMIT_GLOBAL_MAX: 600,
        RATE_LIMIT_FLEET_POSITION_MAX: 60,
      }),
    );
    const fleetPosition = options.find(
      (option) => option.name === 'fleetPosition',
    );

    expect(fleetPosition).toEqual(
      expect.objectContaining({ ttl: 60_000, limit: 60 }),
    );
    const tracker = await fleetPosition?.getTracker?.({
      ip: '10.0.0.5',
      user: { id: 'driver-1' },
    } as never);
    expect(tracker).toBe('user:driver-1');
  });

  it('is attached only to the GPS publication endpoint', () => {
    const handler = Object.getOwnPropertyDescriptor(
      FleetController.prototype,
      'publishPosition',
    )?.value;
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata('http-rate-limit-policy', handler)).toBe(
      'fleet-position',
    );
    expect(PERMISSIONS.FLEET_POSITION_PUBLISH).toBe('fleet.position.publish');
  });
});
