import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const LOCK_ID = 71823042;
const BATCH_SIZE = 100;
const DEFAULT_RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';

type RetentionBatch = {
  acquired: boolean;
  candidateCount: number;
  deletedCount: number;
};

export type FleetPositionRetentionResult = {
  skipped: boolean;
  partial: boolean;
  examined: number;
  deleted: number;
};

@Injectable()
export class FleetPositionRetentionJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(FleetPositionRetentionJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reconcile().catch(() => undefined);
  }

  @Cron('15 0 0 * * *', {
    timeZone: APP_TIMEZONE,
    waitForCompletion: true,
  })
  async reconcile(asOf = new Date()): Promise<FleetPositionRetentionResult> {
    const retentionDays = this.config.get<number>(
      'FLEET_POSITION_RETENTION_DAYS',
      DEFAULT_RETENTION_DAYS,
    );
    const cutoff = new Date(asOf.getTime() - retentionDays * DAY_MS);
    let examined = 0;
    let deleted = 0;

    this.logger.log({
      event: 'fleet-position-retention.started',
      asOf: asOf.toISOString(),
      cutoff: cutoff.toISOString(),
      retentionDays,
    });

    try {
      while (true) {
        const batch = await this.prisma.$transaction(async (tx) =>
          this.reconcileBatch(tx, cutoff),
        );

        if (!batch.acquired) {
          const result = {
            skipped: true,
            partial: examined > 0,
            examined,
            deleted,
          } satisfies FleetPositionRetentionResult;
          this.logger.warn({
            event: 'fleet-position-retention.skipped',
            ...result,
          });
          return result;
        }

        examined += batch.candidateCount;
        deleted += batch.deletedCount;

        if (batch.candidateCount < BATCH_SIZE) break;
      }

      const result = {
        skipped: false,
        partial: false,
        examined,
        deleted,
      } satisfies FleetPositionRetentionResult;
      this.logger.log({
        event: 'fleet-position-retention.completed',
        ...result,
      });
      return result;
    } catch (error) {
      this.logger.error(
        {
          event: 'fleet-position-retention.failed',
          examined,
          deleted,
        },
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async reconcileBatch(
    tx: Prisma.TransactionClient,
    cutoff: Date,
  ): Promise<RetentionBatch> {
    const [{ acquired } = { acquired: false }] = await tx.$queryRawUnsafe<
      Array<{ acquired: boolean }>
    >('SELECT pg_try_advisory_xact_lock($1) AS acquired', LOCK_ID);

    if (!acquired) {
      return { acquired: false, candidateCount: 0, deletedCount: 0 };
    }

    const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT vp."id"
      FROM "VehiclePosition" vp
      WHERE vp."recordedAt" < ${cutoff}
        AND vp."receivedAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM "GeofenceEvent" ge
          WHERE ge."positionId" = vp."id"
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "DeliveryIncident" di
          WHERE di."positionId" = vp."id"
        )
      ORDER BY vp."recordedAt" ASC, vp."id" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `);

    if (candidates.length === 0) {
      return { acquired: true, candidateCount: 0, deletedCount: 0 };
    }

    const candidateIds = Prisma.join(
      candidates.map(({ id }) => Prisma.sql`${id}`),
    );

    // VehicleGeofenceState is a mutable pointer, not an immutable event.
    // Clear only pointers still targeting the candidates before deleting them.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "VehicleGeofenceState"
      SET "lastPositionId" = NULL
      WHERE "lastPositionId" IN (${candidateIds})
    `);

    const deletedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM "VehiclePosition"
      WHERE "id" IN (${candidateIds})
      RETURNING "id"
    `);

    return {
      acquired: true,
      candidateCount: candidates.length,
      deletedCount: deletedRows.length,
    };
  }
}
