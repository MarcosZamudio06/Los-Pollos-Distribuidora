import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgingStatus, CollectionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { calculateReceivableAging } from './receivable-aging';

const LOCK_ID = 71823041;
const BATCH_SIZE = 100;
const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';

@Injectable()
export class AccountsReceivableAgingJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountsReceivableAgingJob.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void this.reconcile().catch(() => undefined);
  }

  @Cron('5 0 0 * * *', { timeZone: APP_TIMEZONE, waitForCompletion: true })
  async reconcile(asOf = new Date()): Promise<{ skipped: boolean; examined?: number; updated?: number; partial?: boolean }> {
    const startedAt = Date.now();
    let examined = 0;
    let updated = 0;
    let cursor: string | undefined;
    this.logger.log({ event: 'receivable-aging.started', asOf: asOf.toISOString() });
    try {
      while (true) {
        const batch = await this.prisma.$transaction(async (tx) => {
          const [{ acquired } = { acquired: false }] = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
            'SELECT pg_try_advisory_xact_lock($1) AS acquired',
            LOCK_ID,
          );
          if (!acquired) return { acquired: false as const, examined: 0, updated: 0 };

          const batch = await tx.accountReceivable.findMany({
            where: {
              OR: [
                {
                  status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
                  outstandingAmount: { gt: 0 },
                },
                { agingStatus: { not: AgingStatus.CURRENT } },
                { daysOverdue: { gt: 0 } },
              ],
              ...(cursor ? { id: { gt: cursor } } : {}),
            },
            select: { id: true, dueDate: true, outstandingAmount: true, agingStatus: true, daysOverdue: true },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
          });
          let batchUpdated = 0;

          for (const receivable of batch) {
            const aging = calculateReceivableAging(receivable.dueDate, Number(receivable.outstandingAmount.toString()), asOf);
            if (aging.agingStatus !== receivable.agingStatus || aging.daysOverdue !== receivable.daysOverdue) {
              await tx.accountReceivable.update({ where: { id: receivable.id }, data: aging });
              batchUpdated += 1;
            }
          }
          return {
            acquired: true as const,
            examined: batch.length,
            updated: batchUpdated,
            lastId: batch.at(-1)?.id,
          };
        }, { timeout: 60_000 });

        if (!batch.acquired) {
          const result = { skipped: true, partial: examined > 0, examined, updated };
          this.logger.log({ event: 'receivable-aging.skipped', reason: 'lock-unavailable', ...result });
          return result;
        }
        examined += batch.examined;
        updated += batch.updated;
        if (batch.examined === 0) break;
        cursor = batch.lastId;
      }
      this.logger.log({
        event: 'receivable-aging.completed',
        examined,
        updated,
        durationMs: Date.now() - startedAt,
      });
      return { skipped: false, examined, updated };
    } catch (error) {
      this.logger.error({ event: 'receivable-aging.failed', examined, updated, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }
}
