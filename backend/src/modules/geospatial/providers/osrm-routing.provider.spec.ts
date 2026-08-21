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
    expect(url.searchParams.get('steps')).toBe('false');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'OSRM',
        operation: 'route',
        outcome: 'success',
        result: 'route',
      }),
    );
  });

  it('requests and normalizes provider-agnostic navigation steps', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              distance: 800,
              duration: 120,
              geometry: { type: 'LineString', coordinates: [] },
              legs: [
                {
                  distance: 800,
                  duration: 120,
                  steps: [
                    {
                      distance: 100.4,
                      duration: 20.4,
                      name: 'Calle Derecha',
                      maneuver: {
                        type: 'turn',
                        modifier: 'right',
                        location: [-96.14, 19.18],
                        bearing_before: 0,
                        bearing_after: 90,
                      },
                    },
                    {
                      distance: 200,
                      duration: 30,
                      name: 'Calle Izquierda',
                      maneuver: {
                        type: 'turn',
                        modifier: 'left',
                        location: [-96.13, 19.17],
                        bearing_before: 180,
                        bearing_after: 90,
                      },
                    },
                    {
                      distance: 250,
                      duration: 35,
                      name: '',
                      maneuver: {
                        type: 'continue',
                        modifier: 'straight',
                        location: [-96.12, 19.16],
                        bearing_before: 90,
                        bearing_after: 90,
                      },
                    },
                    {
                      distance: 249.6,
                      duration: 34.6,
                      name: 'Glorieta Central',
                      maneuver: {
                        type: 'roundabout',
                        modifier: 'right',
                        location: [-96.11, 19.15],
                        bearing_before: 90,
                        bearing_after: 180,
                        exit: 2,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new OsrmRoutingProvider(
      config({ OSRM_URL: 'http://osrm:5000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    const result = await provider.buildRoute(
      [
        { latitude: 19.18, longitude: -96.14 },
        { latitude: 19.15, longitude: -96.11 },
      ],
      { includeSteps: true },
    );

    expect(
      new URL((fetch as jest.Mock).mock.calls[0][0]).searchParams.get('steps'),
    ).toBe('true');
    expect(result.steps).toEqual([
      {
        distanceMeters: 100,
        durationSeconds: 20,
        streetName: 'Calle Derecha',
        maneuver: {
          type: 'TURN',
          modifier: 'RIGHT',
          location: { latitude: 19.18, longitude: -96.14 },
          bearingBefore: 0,
          bearingAfter: 90,
          exit: null,
        },
      },
      expect.objectContaining({
        streetName: 'Calle Izquierda',
        maneuver: expect.objectContaining({ type: 'TURN', modifier: 'LEFT' }),
      }),
      expect.objectContaining({
        streetName: null,
        maneuver: expect.objectContaining({
          type: 'CONTINUE',
          modifier: 'STRAIGHT',
        }),
      }),
      expect.objectContaining({
        streetName: 'Glorieta Central',
        maneuver: expect.objectContaining({
          type: 'ROUNDABOUT',
          modifier: 'RIGHT',
          exit: 2,
        }),
      }),
    ]);
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
