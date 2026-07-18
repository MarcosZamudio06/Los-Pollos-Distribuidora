import { AgingStatus, CollectionStatus } from '@prisma/client';
import { AccountsReceivableAgingJob } from './accounts-receivable-aging.job';

describe('AccountsReceivableAgingJob', () => {
  const accountReceivable = { findMany: jest.fn(), update: jest.fn() };
  const prisma = {
    accountReceivable,
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    dueDate: new Date('2026-07-15T06:00:00Z'),
    outstandingAmount: 50,
    agingStatus: AgingStatus.CURRENT,
    daysOverdue: 0,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma));
  });

  it('skips reconciliation when another instance owns the batch lock', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: false }]);
    const job = new AccountsReceivableAgingJob(prisma as never);

    await expect(job.reconcile(new Date('2026-07-17T12:00:00Z'))).resolves.toEqual({
      skipped: true,
      partial: false,
      examined: 0,
      updated: 0,
    });
    expect(accountReceivable.findMany).not.toHaveBeenCalled();
  });

  it('reconciles a paid zero-balance row with stale aging', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ acquired: true }]);
    accountReceivable.findMany
      .mockResolvedValueOnce([row('paid-1', {
        outstandingAmount: 0,
        agingStatus: AgingStatus.OVERDUE,
        daysOverdue: 16,
      })])
      .mockResolvedValueOnce([]);
    const job = new AccountsReceivableAgingJob(prisma as never);

    await job.reconcile(new Date('2026-07-17T12:00:00Z'));

    expect(accountReceivable.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] }, outstandingAmount: { gt: 0 } },
          { agingStatus: { not: AgingStatus.CURRENT } },
          { daysOverdue: { gt: 0 } },
        ],
      },
    }));
    expect(accountReceivable.update).toHaveBeenCalledWith({
      where: { id: 'paid-1' },
      data: { agingStatus: AgingStatus.CURRENT, daysOverdue: 0 },
    });
  });

  it('processes more than 100 rows in independently committed transactions', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ acquired: true }]);
    accountReceivable.findMany
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => row(`ar-${String(index).padStart(3, '0')}`)))
      .mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => row(`ar-${String(index + 100).padStart(3, '0')}`)))
      .mockResolvedValueOnce([]);
    const job = new AccountsReceivableAgingJob(prisma as never);

    await expect(job.reconcile(new Date('2026-07-17T12:00:00Z'))).resolves.toEqual({
      skipped: false,
      examined: 125,
      updated: 125,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(accountReceivable.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: { gt: 'ar-099' } }),
      take: 100,
    }));
  });

  it('stops safely if the advisory lock is lost between committed batches', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ acquired: false }]);
    accountReceivable.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => row(`ar-${index}`)));
    const job = new AccountsReceivableAgingJob(prisma as never);

    await expect(job.reconcile(new Date('2026-07-17T12:00:00Z'))).resolves.toEqual({
      skipped: true,
      partial: true,
      examined: 100,
      updated: 100,
    });
    expect(accountReceivable.findMany).toHaveBeenCalledTimes(1);
  });

  it('logs only previously committed counters when a later batch fails', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ acquired: true }]);
    accountReceivable.findMany
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => row(`ar-${index}`)))
      .mockRejectedValueOnce(new Error('database unavailable'));
    const job = new AccountsReceivableAgingJob(prisma as never);
    const error = jest.spyOn((job as any).logger, 'error').mockImplementation();

    await expect(job.reconcile(new Date('2026-07-17T12:00:00Z'))).rejects.toThrow('database unavailable');
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ examined: 100, updated: 100 }));
  });
});
