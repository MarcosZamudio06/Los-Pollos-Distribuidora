import { ConfigService } from '@nestjs/config';
import { FleetPositionRetentionJob } from './fleet-position-retention.job';

describe('FleetPositionRetentionJob', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  };
  const config = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    config.get.mockImplementation(
      (_key: string, fallback?: unknown) => fallback,
    );
  });

  it('skips when another instance owns the advisory lock', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: false }]);
    const job = new FleetPositionRetentionJob(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(
      job.reconcile(new Date('2026-08-15T12:00:00.000Z')),
    ).resolves.toEqual({
      skipped: true,
      partial: false,
      examined: 0,
      deleted: 0,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('protects referenced positions and removes old geofence state pointers before deletion', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'position-1' }])
      .mockResolvedValueOnce([{ id: 'position-1' }]);
    prisma.$executeRaw.mockResolvedValueOnce(1);
    const job = new FleetPositionRetentionJob(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(
      job.reconcile(new Date('2026-08-15T12:00:00.000Z')),
    ).resolves.toEqual({
      skipped: false,
      partial: false,
      examined: 1,
      deleted: 1,
    });

    expect(prisma.$queryRaw.mock.calls[0][0].sql).toEqual(
      expect.stringContaining('NOT EXISTS'),
    );
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toEqual(
      expect.stringContaining('"GeofenceEvent"'),
    );
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toEqual(
      expect.stringContaining('"DeliveryIncident"'),
    );
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toEqual(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('processes old positions in bounded transactions', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ acquired: true }]);
    prisma.$queryRaw
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `position-${index}`,
        })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `position-${index}`,
        })),
      )
      .mockResolvedValueOnce([{ id: 'position-100' }])
      .mockResolvedValueOnce([{ id: 'position-100' }]);
    prisma.$executeRaw.mockResolvedValue(1);
    const job = new FleetPositionRetentionJob(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(
      job.reconcile(new Date('2026-08-15T12:00:00.000Z')),
    ).resolves.toEqual({
      skipped: false,
      partial: false,
      examined: 101,
      deleted: 101,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('reports a partial run when the lock is lost after a committed batch', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ acquired: false }]);
    prisma.$queryRaw
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `position-${index}`,
        })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `position-${index}`,
        })),
      );
    prisma.$executeRaw.mockResolvedValueOnce(1);
    const job = new FleetPositionRetentionJob(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(
      job.reconcile(new Date('2026-08-15T12:00:00.000Z')),
    ).resolves.toEqual({
      skipped: true,
      partial: true,
      examined: 100,
      deleted: 100,
    });
  });
});
