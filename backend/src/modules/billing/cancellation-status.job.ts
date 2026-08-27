import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CancellationReconciliationState,
  InvoiceCancellationService,
} from './invoice-cancellation.service';

const LOCK_ID = 71823044;
const BATCH_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 30_000;
const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
const CANDIDATE_SELECT = {
  id: true,
  invoiceId: true,
  operation: true,
  status: true,
  attemptNumber: true,
  correlationId: true,
  idempotencyKey: true,
  requestHash: true,
  providerKey: true,
  providerReference: true,
  nextRetryAt: true,
  updatedAt: true,
  invoice: {
    select: {
      id: true,
      uuid: true,
      status: true,
      fiscalStatus: true,
      cancellationStatus: true,
      fiscalOperationAttempts: {
        where: { operation: FiscalOperationType.STATUS },
        orderBy: { attemptNumber: 'desc' as const },
        take: 1,
        select: { attemptNumber: true, status: true },
      },
    },
  },
} satisfies Prisma.FiscalOperationAttemptSelect;

type Candidate = Prisma.FiscalOperationAttemptGetPayload<{
  select: typeof CANDIDATE_SELECT;
}>;

type ClaimedCandidate = Candidate & {
  statusAttemptId: string;
  statusAttemptNumber: number;
};

export type CancellationStatusJobResult = {
  skipped: boolean;
  started: number;
  recovered: number;
  pending: number;
  rejected: number;
  failed: number;
};

@Injectable()
export class CancellationStatusJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(CancellationStatusJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cancellation: InvoiceCancellationService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reconcile().catch(() => undefined);
  }

  @Cron('*/5 * * * *', {
    timeZone: APP_TIMEZONE,
    waitForCompletion: true,
  })
  async reconcile(now = new Date()): Promise<CancellationStatusJobResult> {
    const result: CancellationStatusJobResult = {
      skipped: false,
      started: 0,
      recovered: 0,
      pending: 0,
      rejected: 0,
      failed: 0,
    };
    this.logger.log({
      event: 'cfdi.cancel.reconciliation.started',
      at: now.toISOString(),
    });

    const claimed = await this.claimBatch(now);
    if (!claimed.acquired) {
      result.skipped = true;
      this.logger.warn({
        event: 'cfdi.cancel.reconciliation.completed',
        reason: 'lock-unavailable',
        ...result,
      });
      return result;
    }

    for (const candidate of claimed.candidates) {
      result.started += 1;
      try {
        const outcome = await this.cancellation.reconcileCancellationStatus(
          candidate.invoiceId,
          candidate.id,
          candidate.statusAttemptId,
          now,
        );
        this.countOutcome(result, outcome.state);
        this.logger.log({
          event:
            outcome.state === 'CANCELLED'
              ? 'cfdi.cancel.reconciliation.completed'
              : outcome.state === 'PENDING'
                ? 'cfdi.cancel.reconciliation.completed'
                : outcome.state === 'REJECTED'
                  ? 'cfdi.cancel.reconciliation.failed'
                  : 'cfdi.cancel.reconciliation.unknown',
          invoiceId: candidate.invoiceId,
          cancellationAttemptId: candidate.id,
          statusAttemptId: candidate.statusAttemptId,
          state: outcome.state,
          nextRetryAt: outcome.nextRetryAt ?? null,
        });
      } catch {
        result.failed += 1;
        this.logger.error({
          event: 'cfdi.cancel.reconciliation.failed',
          invoiceId: candidate.invoiceId,
          cancellationAttemptId: candidate.id,
          statusAttemptId: candidate.statusAttemptId,
          code: 'CFDI_CANCELLATION_STATUS_FAILED',
        });
      }
    }

    this.logger.log({
      event: 'cfdi.cancel.reconciliation.completed',
      ...result,
    });
    return result;
  }

  private async claimBatch(
    now: Date,
  ): Promise<{ acquired: boolean; candidates: ClaimedCandidate[] }> {
    const timeoutMs = this.config.get<number>(
      'CFDI_REQUEST_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
    );
    const staleBefore = new Date(
      now.getTime() - Math.max(timeoutMs * 2, 60_000),
    );

    return this.prisma.$transaction(
      async (tx) => {
        const [{ acquired } = { acquired: false }] = await tx.$queryRawUnsafe<
          Array<{ acquired: boolean }>
        >('SELECT pg_try_advisory_xact_lock($1) AS acquired', LOCK_ID);
        if (!acquired) return { acquired: false, candidates: [] };

        const rows = await tx.fiscalOperationAttempt.findMany({
          where: {
            operation: FiscalOperationType.CANCEL,
            providerReference: { not: null },
            invoice: {
              status: InvoiceStatus.ACTIVE,
              fiscalStatus: InvoiceFiscalStatus.STAMPED,
              cancellationStatus: { in: ['PENDING', 'UNKNOWN'] },
              fiscalOperationAttempts: {
                none: {
                  operation: FiscalOperationType.STATUS,
                  status: FiscalOperationStatus.PROCESSING,
                  updatedAt: { gte: staleBefore },
                },
              },
            },
            OR: [
              {
                status: {
                  in: [
                    FiscalOperationStatus.SUCCEEDED,
                    FiscalOperationStatus.RETRYABLE_FAILURE,
                    FiscalOperationStatus.UNKNOWN,
                  ],
                },
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
              },
              {
                status: FiscalOperationStatus.PROCESSING,
                updatedAt: { lt: staleBefore },
              },
            ],
          },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: BATCH_SIZE,
          select: CANDIDATE_SELECT,
        });

        const candidates: ClaimedCandidate[] = [];
        const claimedInvoiceIds = new Set<string>();
        for (const row of rows) {
          if (claimedInvoiceIds.has(row.invoiceId)) continue;
          const latestStatusAttempt = row.invoice.fiscalOperationAttempts[0];
          if (
            latestStatusAttempt?.status ===
            FiscalOperationStatus.TERMINAL_FAILURE
          ) {
            continue;
          }
          const statusAttemptNumber =
            (row.invoice.fiscalOperationAttempts[0]?.attemptNumber ?? 0) + 1;
          const claimed = await tx.fiscalOperationAttempt.updateMany({
            where: { id: row.id, status: row.status },
            data: {
              status: FiscalOperationStatus.PROCESSING,
              nextRetryAt: null,
            },
          });
          if (claimed.count !== 1) continue;

          const statusAttempt = await tx.fiscalOperationAttempt.create({
            data: {
              invoiceId: row.invoiceId,
              operation: FiscalOperationType.STATUS,
              status: FiscalOperationStatus.PROCESSING,
              attemptNumber: statusAttemptNumber,
              correlationId: `${row.correlationId}:status:${statusAttemptNumber}`,
              idempotencyKey: `${row.idempotencyKey}:status:${statusAttemptNumber}`,
              requestHash: row.requestHash,
              providerKey: row.providerKey,
              providerReference: row.providerReference,
              startedAt: now,
            },
            select: { id: true },
          });
          candidates.push({
            ...row,
            statusAttemptId: statusAttempt.id,
            statusAttemptNumber,
          });
          claimedInvoiceIds.add(row.invoiceId);
        }
        return { acquired: true, candidates };
      },
      { timeout: 60_000 },
    );
  }

  private countOutcome(
    result: CancellationStatusJobResult,
    state: CancellationReconciliationState,
  ): void {
    if (state === 'CANCELLED') result.recovered += 1;
    else if (state === 'PENDING') result.pending += 1;
    else if (state === 'REJECTED') result.rejected += 1;
    else result.failed += 1;
  }
}
