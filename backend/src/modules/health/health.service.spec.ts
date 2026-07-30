import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const $queryRawUnsafe = jest.fn();
  let service: HealthService;

  beforeEach(() => {
    $queryRawUnsafe.mockReset();
    service = new HealthService({ $queryRawUnsafe } as never);
  });

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
});
