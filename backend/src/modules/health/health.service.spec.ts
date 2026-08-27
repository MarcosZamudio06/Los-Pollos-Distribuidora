import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const $queryRawUnsafe = jest.fn();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'HEALTH_DEPENDENCY_TIMEOUT_MS') return 10;
      return (
        (
          {
            PHOTON_URL: 'http://photon:2322',
            OSRM_URL: 'http://osrm:5000',
            VROOM_URL: 'http://vroom:3000',
            MAP_TILES_URL: 'http://tileserver:8080',
            OBJECT_STORAGE_ENDPOINT: 'http://object-storage:8333',
          } as Record<string, string>
        )[key] ?? fallback
      );
    }),
  } as unknown as ConfigService;
  let service: HealthService;

  beforeEach(() => {
    $queryRawUnsafe.mockReset();
    service = new HealthService({ $queryRawUnsafe } as never, config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps liveness independent from database availability', () => {
    expect(service.getLiveness()).toEqual({
      success: true,
      message: 'Application is live',
      data: { status: 'live' },
    });
  });

  it('does not report startup until bootstrap completes', () => {
    expect(() => service.getStartup()).toThrow(ServiceUnavailableException);

    service.onApplicationBootstrap();

    expect(service.getStartup()).toEqual({
      success: true,
      message: 'Application startup completed',
      data: { status: 'started' },
    });
  });

  it('reports readiness only after bootstrap and a successful database query', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe.mockResolvedValue([{ result: 1 }]);

    await expect(service.getReadiness()).resolves.toEqual({
      success: true,
      message: 'Application is ready',
      data: { status: 'ready' },
    });
    expect($queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('rejects readiness while draining without querying the database', async () => {
    service.onApplicationBootstrap();
    service.onModuleDestroy();

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect($queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects readiness when the database query fails', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe.mockRejectedValue(new Error('database unavailable'));

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports core and GIS dependency health without exposing internal URLs', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe.mockResolvedValue([{ result: 1 }]);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await service.getDependencies();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        dependencies: expect.objectContaining({
          database: expect.objectContaining({ status: 'up' }),
          photon: expect.objectContaining({ status: 'up' }),
          osrm: expect.objectContaining({ status: 'up' }),
          vroom: expect.objectContaining({ status: 'up' }),
          tileserver: expect.objectContaining({ status: 'up' }),
          objectStorage: expect.objectContaining({ status: 'up' }),
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('http://');
    expect(JSON.stringify(result)).not.toContain('object-storage');
  });

  it('keeps core readiness independent from a failed GIS dependency', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe.mockResolvedValue([{ result: 1 }]);
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return Promise.resolve(
        new Response('{}', { status: url.includes('photon') ? 503 : 200 }),
      );
    });

    const result = await service.getDependencies();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.photon.status).toBe('down');
    await expect(service.getReadiness()).resolves.toEqual(
      expect.objectContaining({ data: { status: 'ready' } }),
    );
  });

  it('keeps readiness independent from fiscal dependency degradation', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe
      .mockResolvedValueOnce([{ result: 1 }])
      .mockRejectedValueOnce(new Error('fiscal metadata unavailable'))
      .mockResolvedValue([{ result: 1 }]);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await service.getDependencies();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.fiscal).toEqual(
      expect.objectContaining({ status: 'down' }),
    );
    await expect(service.getReadiness()).resolves.toEqual(
      expect.objectContaining({ data: { status: 'ready' } }),
    );
  });

  it('bounds a dependency probe that never returns', async () => {
    service.onApplicationBootstrap();
    $queryRawUnsafe.mockResolvedValue([{ result: 1 }]);
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes('photon')) {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const result = await service.getDependencies();

    expect(result.dependencies.photon).toEqual(
      expect.objectContaining({ status: 'down', reason: 'timeout' }),
    );
  });
});
