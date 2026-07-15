import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RoutingTechnicalStatusService } from './routing-technical-status.service';

describe('RoutingTechnicalStatusService', () => {
  const config = { get: jest.fn((key: string, fallback?: unknown) => ({
    PHOTON_URL: 'http://photon:2322', VROOM_URL: 'http://vroom:3000', OSRM_URL: 'http://osrm:5000',
    MAP_DATA_VERSION: 'mx-2026-07', MAP_DATA_PREPARED_AT: '2026-07-01T00:00:00.000Z', ROUTING_TIMEOUT_MS: 5000,
  }[key] ?? fallback)) } as unknown as ConfigService;
  const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ version: '3.5' }]) } as unknown as PrismaService;

  afterEach(() => jest.restoreAllMocks());

  it('aggregates PostGIS and routing provider readiness with dataset age', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new RoutingTechnicalStatusService(config, prisma);

    await expect(service.getStatus()).resolves.toEqual(expect.objectContaining({
      status: 'operational',
      dataset: expect.objectContaining({ version: 'mx-2026-07', ageDays: expect.any(Number) }),
      services: expect.arrayContaining([
        expect.objectContaining({ name: 'PostGIS', status: 'up' }),
        expect.objectContaining({ name: 'Photon', status: 'up' }),
        expect.objectContaining({ name: 'VROOM', status: 'up' }),
        expect.objectContaining({ name: 'OSRM', status: 'up' }),
      ]),
    }));
  });

  it('reports degraded status instead of failing the whole endpoint', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unavailable'));
    const service = new RoutingTechnicalStatusService(config, prisma);
    const result = await service.getStatus();
    expect(result.status).toBe('degraded');
    expect(result.services.filter((item) => item.name !== 'PostGIS').every((item) => item.status === 'down')).toBe(true);
  });
});
