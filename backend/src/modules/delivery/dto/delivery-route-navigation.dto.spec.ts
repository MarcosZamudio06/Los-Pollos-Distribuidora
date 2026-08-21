import { plainToInstance } from 'class-transformer';
import 'reflect-metadata';

import { validate } from 'class-validator';
import { DeliveryRouteNavigationDto } from './delivery-route-navigation.dto';

describe('DeliveryRouteNavigationDto', () => {
  async function validateBody(body: Record<string, unknown>) {
    const dto = plainToInstance(DeliveryRouteNavigationDto, body);
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors };
  }

  it.each([
    [{ latitude: 91, longitude: -96.14 }],
    [{ latitude: -91, longitude: -96.14 }],
    [{ latitude: 19.18, longitude: 181 }],
    [{ latitude: 19.18, longitude: Number.NaN }],
    [{ latitude: 19.18, longitude: Number.POSITIVE_INFINITY }],
    [{ latitude: '', longitude: -96.14 }],
    [{ latitude: null, longitude: -96.14 }],
    [{ longitude: -96.14 }],
    [{ latitude: 19.18, longitude: -96.14, accuracyMeters: -1 }],
    [{ latitude: 19.18, longitude: -96.14, headingDegrees: 360 }],
  ])(
    'rejects invalid navigation coordinates or GPS metadata: %j',
    async (body) => {
      const { errors } = await validateBody(body);

      expect(errors).not.toHaveLength(0);
    },
  );

  it('accepts valid GPS input and strips client-controlled destinations', async () => {
    const { dto, errors } = await validateBody({
      latitude: 19.18,
      longitude: -96.14,
      accuracyMeters: 8.5,
      headingDegrees: 180,
      destination: { latitude: 0, longitude: 0 },
      orderId: 'attacker-order',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toEqual({
      latitude: 19.18,
      longitude: -96.14,
      accuracyMeters: 8.5,
      headingDegrees: 180,
    });
  });
});
