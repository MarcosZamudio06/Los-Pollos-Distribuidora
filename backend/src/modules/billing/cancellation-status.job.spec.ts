import { Logger } from '@nestjs/common';
import { CancellationStatusJob } from './cancellation-status.job';

type Candidate = {
  id: string;
  invoiceId: string;
  operation: 'CANCEL';
  status: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'UNKNOWN';
  attemptNumber: number;
  correlationId: string;
  idempotencyKey: string;
  requestHash: string;
  providerKey: 'FACTURAMA';
  providerReference: string;
  nextRetryAt: Date | null;
  updatedAt: Date;
  invoice: {
    id: string;
    uuid: string;
    status: 'ACTIVE';
    fiscalStatus: 'STAMPED';
    cancellationStatus: 'PENDING' | 'UNKNOWN';
    fiscalOperationAttempts: Array<{
      attemptNumber: number;
      status: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE';
    }>;
  };
};

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    invoiceId: `invoice-${id}`,
    operation: 'CANCEL',
    status: 'SUCCEEDED',
    attemptNumber: 1,
    correlationId: `cancel-correlation-${id}`,
    idempotencyKey: `cancel:idempotency-${id}`,
    requestHash: 'a'.repeat(64),
    providerKey: 'FACTURAMA',
    providerReference: `provider-${id}`,
    nextRetryAt: null,
    updatedAt: new Date('2026-08-23T18:00:00.000Z'),
    invoice: {
      id: `invoice-${id}`,
      status: 'ACTIVE',
      fiscalStatus: 'STAMPED',
      cancellationStatus: 'PENDING',
      uuid: `UUID-${id}`,
      fiscalOperationAttempts: [],
    },
    ...overrides,
  };
}

function harness() {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
    fiscalOperationAttempt: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'status-attempt-1',
        correlationId: 'cancel-correlation-1:status:1',
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = {
    reconcileCancellationStatus: jest.fn(),
  };
  const config = {
    get: jest
      .fn()
      .mockImplementation((_key: string, fallback?: unknown) => fallback),
  };
  const job = new CancellationStatusJob(
    prisma as never,
    service as never,
    config as never,
  );
  return { job, prisma, tx, service, config };
}

describe('CancellationStatusJob', () => {
  beforeEach(() => jest.resetAllMocks());

  it('skips when another instance owns the PostgreSQL advisory lock', async () => {
    const { job, tx, service } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: false }]);

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ skipped: true, started: 0, recovered: 0 });
    expect(tx.fiscalOperationAttempt.findMany).not.toHaveBeenCalled();
    expect(service.reconcileCancellationStatus).not.toHaveBeenCalled();
  });

  it('claims at most one recent pending cancellation per invoice and processes a bounded batch', async () => {
    const { job, tx, service } = harness();
    const rows = Array.from({ length: 51 }, (_, index) =>
      candidate(`candidate-${index}`),
    );
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce(rows.slice(0, 50));
    service.reconcileCancellationStatus.mockResolvedValue({ state: 'PENDING' });

    const result = await job.reconcile(new Date('2026-08-23T19:00:00.000Z'));

    expect(result).toMatchObject({
      skipped: false,
      started: 50,
      recovered: 0,
      pending: 50,
      failed: 0,
    });
    expect(service.reconcileCancellationStatus).toHaveBeenCalledTimes(50);
    expect(tx.fiscalOperationAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('records recovered, rejected and failed outcomes without exposing provider payloads', async () => {
    const { job, tx, service } = harness();
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      candidate('cancelled'),
      candidate('rejected'),
      candidate('error'),
    ]);
    service.reconcileCancellationStatus
      .mockResolvedValueOnce({ state: 'CANCELLED' })
      .mockResolvedValueOnce({ state: 'REJECTED' })
      .mockResolvedValueOnce({ state: 'ERROR' });

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      started: 3,
      recovered: 1,
      rejected: 1,
      failed: 1,
    });
    for (const call of service.reconcileCancellationStatus.mock.calls) {
      expect(call[0]).toMatch(/^invoice-(cancelled|rejected|error)$/);
      expect(call[2]).toMatch(/^status-attempt-/);
      expect(call).not.toContainEqual(
        expect.objectContaining({ body: expect.anything() }),
      );
    }
  });

  it('never logs an arbitrary provider error code containing credentials', async () => {
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { job, tx, service } = harness();
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      candidate('secret-error'),
    ]);
    service.reconcileCancellationStatus.mockRejectedValueOnce({
      code: 'Authorization Bearer jwt-secret PAC-password',
    });

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ failed: 1 });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain('jwt-secret');
    expect(logged).not.toContain('PAC-password');
    expect(logged).not.toContain('Authorization');
  });

  it('does not claim a candidate that has a recent status query in progress', async () => {
    const { job, tx } = harness();
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([]);

    await job.reconcile(new Date('2026-08-23T19:00:00.000Z'));

    expect(tx.fiscalOperationAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: expect.objectContaining({
            cancellationStatus: { in: ['PENDING', 'UNKNOWN'] },
          }),
        }),
      }),
    );
  });

  it('claims UNKNOWN cancellations without an existing status attempt so a timeout can be reconciled', async () => {
    const { job, tx, service } = harness();
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      candidate('unknown', {
        invoice: {
          ...candidate('unknown').invoice,
          cancellationStatus: 'UNKNOWN',
        },
      }),
    ]);
    service.reconcileCancellationStatus.mockResolvedValueOnce({
      state: 'PENDING',
    });

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ started: 1, pending: 1 });
    expect(service.reconcileCancellationStatus).toHaveBeenCalledWith(
      'invoice-unknown',
      'unknown',
      'status-attempt-1',
      expect.any(Date),
    );
  });

  it('does not requeue an UNKNOWN cancellation after a terminal status result', async () => {
    const { job, tx, service } = harness();
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      candidate('terminal', {
        invoice: {
          ...candidate('terminal').invoice,
          cancellationStatus: 'UNKNOWN',
          fiscalOperationAttempts: [
            { attemptNumber: 1, status: 'TERMINAL_FAILURE' },
          ],
        },
      }),
    ]);

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ started: 0, failed: 0 });
    expect(service.reconcileCancellationStatus).not.toHaveBeenCalled();
    expect(tx.fiscalOperationAttempt.create).not.toHaveBeenCalled();
  });
});
