import { plainToInstance } from 'class-transformer';
import 'reflect-metadata';

import { validate } from 'class-validator';
import { PublishFleetPositionDto } from './fleet.dto';

describe('PublishFleetPositionDto', () => {
  it('does not expose client-controlled route, vehicle, or driver identifiers', async () => {
    const dto = plainToInstance(PublishFleetPositionDto, {
      clientEventId: 'event-1',
      routeId: 'route-1',
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      latitude: 19.1738,
      longitude: -96.1342,
      recordedAt: '2026-08-12T16:00:00.000Z',
    });

    await validate(dto, { whitelist: true });

    expect(dto).not.toHaveProperty('routeId');
    expect(dto).not.toHaveProperty('vehicleId');
    expect(dto).not.toHaveProperty('driverId');
  });
});
