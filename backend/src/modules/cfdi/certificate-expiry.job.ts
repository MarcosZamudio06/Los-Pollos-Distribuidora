import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FiscalEventLogger } from './fiscal-event.logger';

const LOCK_ID = 71823045;
const WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;
const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City';

export type CertificateExpiryResult = {
  skipped: boolean;
  checked: number;
  expiring: number;
  expired: number;
};

@Injectable()
export class CertificateExpiryJob implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FiscalEventLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.check().catch(() => undefined);
  }

  @Cron('0 8 * * *', { timeZone: APP_TIMEZONE, waitForCompletion: true })
  async check(now = new Date()): Promise<CertificateExpiryResult> {
    this.events.emit('cfdi.certificate.expiry.started', {
      at: now.toISOString(),
    });
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const [{ acquired } = { acquired: false }] = await tx.$queryRawUnsafe<
            Array<{ acquired: boolean }>
          >('SELECT pg_try_advisory_xact_lock($1) AS acquired', LOCK_ID);
          if (!acquired) {
            return { skipped: true, checked: 0, expiring: 0, expired: 0 };
          }

          const issuers = await tx.legalEntity.findMany({
            where: {
              isActive: true,
              cfdiEnabled: true,
              certificateValidTo: { not: null },
            },
            select: { id: true, certificateValidTo: true },
            orderBy: { id: 'asc' },
          });
          const result: CertificateExpiryResult = {
            skipped: false,
            checked: issuers.length,
            expiring: 0,
            expired: 0,
          };
          for (const issuer of issuers) {
            if (!issuer.certificateValidTo) continue;
            const daysRemaining = Math.ceil(
              (issuer.certificateValidTo.getTime() - now.getTime()) / DAY_MS,
            );
            if (daysRemaining <= 0) {
              result.expired += 1;
              this.events.emit('cfdi.certificate.expiry.expired', {
                legalEntityId: issuer.id,
                daysRemaining,
              });
            } else if (daysRemaining <= WARNING_DAYS) {
              result.expiring += 1;
              this.events.emit('cfdi.certificate.expiry.expiring', {
                legalEntityId: issuer.id,
                daysRemaining,
              });
            }
          }
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      this.events.emit('cfdi.certificate.expiry.completed', result);
      return result;
    } catch (error) {
      this.events.emit('cfdi.certificate.expiry.failed', {
        code: 'CFDI_CERTIFICATE_EXPIRY_CHECK_FAILED',
      });
      throw error;
    }
  }
}
