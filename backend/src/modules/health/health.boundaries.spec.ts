import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('SEC-005 bounded public health work', () => {
  const query = jest.fn();
  const config = new ConfigService({ HEALTH_DEPENDENCY_TIMEOUT_MS: 10 });
  let service: HealthService;

  beforeEach(() => {
    jest.useFakeTimers();
    query.mockReset().mockResolvedValue([{ invalidCount: 0 }]);
    service = new HealthService({ $queryRawUnsafe: query } as never, config);
    service.onApplicationBootstrap();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('coalesces concurrent diagnostic requests and caches failures for 30 seconds', async () => {
    const result = await Promise.all(
      Array.from({ length: 20 }, () => service.getDependencies()),
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.every((r) => r.status === 'degraded')).toBe(true);
    await jest.advanceTimersByTimeAsync(29999);
    await service.getDependencies();
    expect(query).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2);
    await service.getDependencies();
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('caches readiness successes for one second but immediately honors draining', async () => {
    await Promise.all(Array.from({ length: 20 }, () => service.getReadiness()));
    expect(query).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1001);
    await service.getReadiness();
    expect(query).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await expect(service.getReadiness()).rejects.toThrow(
      'Application is not ready',
    );
  });

  it('caches a failed readiness result instead of multiplying rejected queries', async () => {
    query.mockRejectedValue(new Error('private database URL'));
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.getReadiness()),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    await expect(service.getReadiness()).rejects.toThrow(
      'Application is not ready',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not launch more SQL after timeouts while underlying queries are still pending', async () => {
    const finish: Array<(value: unknown) => void> = [];
    query.mockImplementation(
      () => new Promise((resolve) => finish.push(resolve)),
    );
    const first = service.getDependencies();
    await jest.advanceTimersByTimeAsync(11);
    expect((await first).status).toBe('error');
    expect(query).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(30001);
    const second = service.getDependencies();
    const ready = service.getReadiness().catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(11);
    expect((await second).status).toBe('error');
    expect(await ready).toBeInstanceOf(Error);
    expect(query).toHaveBeenCalledTimes(2);
    finish.forEach((resolve) => resolve([{ invalidCount: 0 }]));
    await jest.advanceTimersByTimeAsync(30001);
    query.mockResolvedValue([{ invalidCount: 0 }]);
    expect((await service.getDependencies()).dependencies.database.status).toBe(
      'up',
    );
    expect(query).toHaveBeenCalledTimes(4);
  });
});
