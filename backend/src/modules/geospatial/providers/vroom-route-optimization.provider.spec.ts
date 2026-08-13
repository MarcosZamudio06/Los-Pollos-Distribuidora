import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VroomRouteOptimizationProvider } from './vroom-route-optimization.provider';

describe('VroomRouteOptimizationProvider', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    }) as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('sends a closed single-vehicle problem and returns ordered stop ids', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            {
              steps: [
                { id: 1, type: 'start' },
                { id: 1, type: 'job' },
                { id: 1, type: 'end' },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new VroomRouteOptimizationProvider(
      config({ VROOM_URL: 'http://vroom:3000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.optimize({
        origin: { latitude: 19.18, longitude: -96.14 },
        stops: [
          {
            id: 'sale-1',
            coordinates: { latitude: 19.17, longitude: -96.13 },
          },
        ],
      }),
    ).resolves.toEqual([{ id: 'sale-1', sequence: 1 }]);

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.vehicles[0]).toEqual({
      id: 1,
      profile: 'car',
      start: [-96.14, 19.18],
      end: [-96.14, 19.18],
    });
    expect(body.jobs[0]).toEqual({
      id: 1,
      location: [-96.13, 19.17],
    });
  });

  it('reports unassigned stops as an optimization validation error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ unassigned: [{ id: 1 }], routes: [] }), {
        status: 200,
      }),
    );
    const provider = new VroomRouteOptimizationProvider(
      config({ VROOM_URL: 'http://vroom:3000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.optimize({
        origin: { latitude: 19.18, longitude: -96.14 },
        stops: [
          {
            id: 'sale-1',
            coordinates: { latitude: 19.17, longitude: -96.13 },
          },
        ],
      }),
    ).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: expect.objectContaining({ saleIds: ['sale-1'] }),
    });
  });

  it('maps transport failures to an optimization-specific 503', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const provider = new VroomRouteOptimizationProvider(
      config({ VROOM_URL: 'http://vroom:3000', ROUTING_TIMEOUT_MS: 10000 }),
    );

    await expect(
      provider.optimize({
        origin: { latitude: 19.18, longitude: -96.14 },
        stops: [],
      }),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      message: 'VROOM route optimization provider is unavailable',
    });
  });
});
