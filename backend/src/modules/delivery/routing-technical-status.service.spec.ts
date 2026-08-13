import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NullTrafficProvider } from '../fleet/traffic/null-traffic.provider';
import { RoutingTechnicalStatusService } from './routing-technical-status.service';

describe('RoutingTechnicalStatusService', () => {
  const config = {
    get: jest.fn(
      (key: string, fallback?: unknown) =>
        ({
          PHOTON_URL: 'http://photon:2322',
          VROOM_URL: 'http://vroom:3000',
          OSRM_URL: 'http://osrm:5000',
          MAP_DATA_VERSION: 'mx-2026-07',
          MAP_DATA_PREPARED_AT: '2026-07-01T00:00:00.000Z',
          ROUTING_TIMEOUT_MS: 5000,
        })[key] ?? fallback,
    ),
  } as unknown as ConfigService;
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ version: '3.5' }]),
    $queryRaw: jest.fn().mockResolvedValue([{ latestRecordedAt: null }]),
  } as unknown as PrismaService;
  const nullTrafficProvider = new NullTrafficProvider();

  afterEach(() => jest.restoreAllMocks());

  it('aggregates PostGIS and routing provider readiness with dataset age', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new RoutingTechnicalStatusService(
      config,
      prisma,
      nullTrafficProvider,
    );

    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        status: 'operational',
        dataset: expect.objectContaining({
          version: 'mx-2026-07',
          ageDays: expect.any(Number),
        }),
        services: expect.arrayContaining([
          expect.objectContaining({ name: 'PostGIS', status: 'up' }),
          expect.objectContaining({ name: 'Photon', status: 'up' }),
          expect.objectContaining({ name: 'VROOM', status: 'up' }),
          expect.objectContaining({ name: 'OSRM', status: 'up' }),
        ]),
        routingDataVersion: 'mx-2026-07',
        fleetPersistence: { status: 'up' },
        latestVehiclePositionAgeSeconds: null,
        traffic: { available: false, provider: null },
      }),
    );
  });

  it('reports degraded status instead of failing the whole endpoint', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unavailable'));
    const service = new RoutingTechnicalStatusService(
      config,
      prisma,
      nullTrafficProvider,
    );
    const result = await service.getStatus();
    expect(result.status).toBe('degraded');
    expect(
      result.services
        .filter((item) => item.name !== 'PostGIS')
        .every((item) => item.status === 'down'),
    ).toBe(true);
    expect(result.fleetPersistence.status).toBe('up');
  });

  it('returns the age of the newest persisted GPS position without personal data', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const latestRecordedAt = new Date(Date.now() - 45_000);
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { latestRecordedAt },
    ]);

    const result = await new RoutingTechnicalStatusService(
      config,
      prisma,
      nullTrafficProvider,
    ).getStatus();

    expect(result.fleetPersistence).toEqual({ status: 'up' });
    expect(result.latestVehiclePositionAgeSeconds).toBeGreaterThanOrEqual(44);
    expect(result.latestVehiclePositionAgeSeconds).toBeLessThanOrEqual(46);
    expect(result.traffic).toEqual({ available: false, provider: null });
    expect(JSON.stringify(result)).not.toContain('vehicle-');
    expect(JSON.stringify(result)).not.toContain('driver-');
  });

  it('accepts a future provider without changing routing provider flow', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const provider = {
      getTrafficSnapshot: jest.fn().mockResolvedValue([]),
      getCapabilities: jest.fn().mockResolvedValue({
        available: true,
        provider: 'approved-provider',
      }),
      healthCheck: jest.fn(),
    };

    const result = await new RoutingTechnicalStatusService(
      config,
      prisma,
      provider,
    ).getStatus();

    expect(result.traffic).toEqual({
      available: true,
      provider: 'approved-provider',
    });
    expect(provider.getTrafficSnapshot).not.toHaveBeenCalled();
  });
});
