import {
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OsrmRoutingProvider } from './osrm-routing.provider';

describe('OsrmRoutingProvider', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    }) as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('builds a full GeoJSON route from object coordinates', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              distance: 8600.4,
              duration: 1440.2,
              geometry: { type: 'LineString', coordinates: [] },
              legs: [{ distance: 4300, duration: 720 }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = new OsrmRoutingProvider(
      config({ OSRM_URL: 'http://osrm:5000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.buildRoute([
        { latitude: 19.18, longitude: -96.14 },
        { latitude: 19.17, longitude: -96.13 },
      ]),
    ).resolves.toEqual({
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 8600,
      durationSeconds: 1440,
      legs: [{ distanceMeters: 4300, durationSeconds: 720 }],
    });

    const url = new URL((fetch as jest.Mock).mock.calls[0][0]);
    expect(url.pathname).toBe('/route/v1/driving/-96.14,19.18;-96.13,19.17');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'OSRM',
        operation: 'route',
        outcome: 'success',
        result: 'route',
      }),
    );
  });

  it('separates a valid response without a route from transport downtime', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), {
        status: 200,
      }),
    );
    const provider = new OsrmRoutingProvider(
      config({ OSRM_URL: 'http://osrm:5000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.buildRoute([{ latitude: 19.18, longitude: -96.14 }]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('maps network failures to an OSRM-specific 503', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const provider = new OsrmRoutingProvider(
      config({ OSRM_URL: 'http://osrm:5000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.buildRoute([{ latitude: 19.18, longitude: -96.14 }]),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      message: 'OSRM routing provider is unavailable',
    });
  });
});
