import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  CreditAdjustmentStatus,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  PaymentInvoiceApplicationStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalArtifactContent,
  type FiscalProviderPort,
  type FiscalStampResponse,
  type FiscalStatusResponse,
} from './domain/fiscal-provider.port';
import { FiscalArtifactService } from './fiscal-artifact.service';
import { containsUnsafeXmlDeclaration } from './xml-security';

const LOCK_ID = 71823043;
const BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
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
      legalEntityId: true,
      series: true,
      folio: true,
      issuedAt: true,
      stampedAt: true,
      fiscalStatus: true,
      certificateNumber: true,
      fiscalCertificate: { select: { serialNumber: true } },
      issuerSnapshot: true,
      fiscalOperationAttempts: {
        where: { operation: FiscalOperationType.RECOVERY },
        orderBy: { attemptNumber: 'desc' as const },
        take: 1,
        select: { attemptNumber: true },
      },
      createdByUserId: true,
      sourceCreditAdjustmentId: true,
    },
  },
} satisfies Prisma.FiscalOperationAttemptSelect;

type CandidateRecord = Prisma.FiscalOperationAttemptGetPayload<{
  select: typeof CANDIDATE_SELECT;
}>;

type ClaimedCandidate = CandidateRecord & {
  recoveryAttemptId: string;
  recoveryCorrelationId: string;
  recoveryAttemptNumber: number;
};

type ReconciliationOutcome =
  'recovered' | 'not-found' | 'still-unknown' | 'failed';

export type StampReconciliationResult = {
  skipped: boolean;
  started: number;
  recovered: number;
  notFound: number;
  stillUnknown: number;
  failed: number;
};

type TfdAttributes = {
  uuid: string;
  stampedAt: string;
  cfdiSeal: string;
  satSeal: string;
  satCertificateNumber: string;
  providerCertificateRfc: string;
};

type ReconciliationFailure = {
  code: string;
  retryable: boolean;
  remediation: boolean;
  providerStatus?: string;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function jsonField(
  source: Prisma.JsonValue | null,
  field: string,
): string | null {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return null;
  return asString((source as Record<string, unknown>)[field]);
}

function xmlAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, 'i').exec(
    tag,
  );
  return asString(match?.[1]);
}

function parseTfd(content: FiscalArtifactContent): TfdAttributes | null {
  if (content.artifactType !== 'XML') return null;
  const xml = Buffer.from(content.content).toString('utf8');
  if (containsUnsafeXmlDeclaration(xml)) return null;
  const tag = /<[^>]*TimbreFiscalDigital\b[^>]*>/i.exec(xml)?.[0];
  if (!tag) return null;
  const attributes = {
    uuid: xmlAttribute(tag, 'UUID'),
    stampedAt: xmlAttribute(tag, 'FechaTimbrado'),
    satCertificateNumber: xmlAttribute(tag, 'NoCertificadoSAT'),
    providerCertificateRfc: xmlAttribute(tag, 'RfcProvCertif'),
    cfdiSeal: xmlAttribute(tag, 'SelloCFD'),
    satSeal: xmlAttribute(tag, 'SelloSAT'),
  };
  if (Object.values(attributes).some((value) => !value)) return null;
  if (!Number.isFinite(Date.parse(attributes.stampedAt!))) return null;
  return attributes as TfdAttributes;
}

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function responseDigest(response: FiscalStampResponse): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: response.provider,
        providerDocumentId: response.providerDocumentId,
        uuid: response.uuid,
        stampedAt: response.stampedAt,
      }),
    )
    .digest('hex');
}

@Injectable()
export class StampReconciliationJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(StampReconciliationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider: FiscalProviderPort,
    private readonly artifacts: FiscalArtifactService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reconcile().catch(() => undefined);
  }

  @Cron('*/5 * * * *', {
    timeZone: APP_TIMEZONE,
    waitForCompletion: true,
  })
  async reconcile(now = new Date()): Promise<StampReconciliationResult> {
    const result: StampReconciliationResult = {
      skipped: false,
      started: 0,
      recovered: 0,
      notFound: 0,
      stillUnknown: 0,
      failed: 0,
    };
    this.logger.log({
      event: 'cfdi.reconciliation.started',
      at: now.toISOString(),
    });

    try {
      const claimed = await this.claimBatch(now);
      if (!claimed.acquired) {
        result.skipped = true;
        this.logger.warn({
          event: 'cfdi.reconciliation.skipped',
          reason: 'lock-unavailable',
          ...result,
        });
        return result;
      }

      for (const candidate of claimed.candidates) {
        result.started += 1;
        try {
          const outcome = await this.reconcileCandidate(candidate, now);
          result[
            outcome === 'not-found'
              ? 'notFound'
              : outcome === 'still-unknown'
                ? 'stillUnknown'
                : outcome
          ] += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.error({
            event: 'cfdi.reconciliation.failed',
            invoiceId: candidate.invoiceId,
            attemptId: candidate.id,
            correlationId: candidate.recoveryCorrelationId,
            code:
              error instanceof FiscalProviderError
                ? error.code
                : 'CFDI_RECONCILIATION_FAILED',
          });
          try {
            await this.finishUnknown(
              candidate,
              {
                code: 'CFDI_RECONCILIATION_FAILED',
                retryable: true,
                remediation: true,
              },
              now,
            );
          } catch {
            // Preserve the failed metric and leave the operation for a later
            // recovery pass if the compensating write is unavailable.
          }
        }
      }

      this.logger.log({
        event: 'cfdi.reconciliation.completed',
        ...result,
      });
      return result;
    } catch (error) {
      this.logger.error({
        event: 'cfdi.reconciliation.failed',
        code: 'CFDI_RECONCILIATION_FAILED',
        ...result,
      });
      throw error;
    }
  }

  private async claimBatch(
    now: Date,
  ): Promise<{ acquired: boolean; candidates: ClaimedCandidate[] }> {
    const timeoutMs = this.config.get<number>(
      'CFDI_REQUEST_TIMEOUT_MS',
      30_000,
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
            operation: FiscalOperationType.STAMP,
            invoice: {
              fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
              fiscalOperationAttempts: {
                none: {
                  operation: FiscalOperationType.RECOVERY,
                  status: FiscalOperationStatus.PROCESSING,
                  updatedAt: { gte: staleBefore },
                },
              },
            },
            OR: [
              {
                status: FiscalOperationStatus.UNKNOWN,
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
              },
              {
                status: FiscalOperationStatus.PROCESSING,
                updatedAt: { lt: staleBefore },
              },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: BATCH_SIZE,
          select: CANDIDATE_SELECT,
        });
        const candidates: ClaimedCandidate[] = [];
        const claimedInvoiceIds = new Set<string>();
        for (const row of rows) {
          if (claimedInvoiceIds.has(row.invoiceId)) continue;
          const claimed = await tx.fiscalOperationAttempt.updateMany({
            where: { id: row.id, status: row.status },
            data: {
              status: FiscalOperationStatus.PROCESSING,
              startedAt: now,
              completedAt: null,
              nextRetryAt: null,
            },
          });
          if (claimed.count !== 1) continue;
          const recoveryAttemptNumber =
            (row.invoice.fiscalOperationAttempts[0]?.attemptNumber ?? 0) + 1;
          const recovery = await tx.fiscalOperationAttempt.create({
            data: {
              invoiceId: row.invoiceId,
              operation: FiscalOperationType.RECOVERY,
              status: FiscalOperationStatus.PROCESSING,
              attemptNumber: recoveryAttemptNumber,
              correlationId: `${row.correlationId}:recovery:${recoveryAttemptNumber}`,
              idempotencyKey: `${row.idempotencyKey}:recovery:${recoveryAttemptNumber}`,
              requestHash: row.requestHash,
              providerKey: row.providerKey,
              providerReference: row.providerReference,
              startedAt: now,
            },
            select: { id: true, correlationId: true },
          });
          candidates.push({
            ...row,
            recoveryAttemptId: recovery.id,
            recoveryCorrelationId: recovery.correlationId,
            recoveryAttemptNumber,
          });
          claimedInvoiceIds.add(row.invoiceId);
        }
        return { acquired: true, candidates };
      },
      { timeout: 60_000 },
    );
  }

  private async reconcileCandidate(
    candidate: ClaimedCandidate,
    now: Date,
  ): Promise<ReconciliationOutcome> {
    if (!candidate.providerReference) {
      await this.finishUnknown(
        candidate,
        {
          code: 'CFDI_RECONCILIATION_PROVIDER_REFERENCE_MISSING',
          retryable: false,
          remediation: true,
        },
        now,
      );
      return 'still-unknown';
    }

    let status: FiscalStatusResponse;
    try {
      status = await this.provider.getStatus({
        correlationId: candidate.recoveryCorrelationId,
        providerKey: candidate.providerKey,
        providerDocumentId: candidate.providerReference,
        uuid: candidate.invoice.uuid ?? undefined,
      });
    } catch (error) {
      if (
        error instanceof FiscalProviderError &&
        error.code === 'FISCAL_PROVIDER_NOT_FOUND'
      ) {
        await this.finishUnknown(
          candidate,
          {
            code: error.code,
            retryable: true,
            remediation: false,
          },
          now,
        );
        return 'not-found';
      }
      await this.finishUnknown(
        candidate,
        {
          code:
            error instanceof FiscalProviderError
              ? error.code
              : 'CFDI_RECONCILIATION_STATUS_UNAVAILABLE',
          retryable:
            error instanceof FiscalProviderError ? error.retryable : true,
          remediation:
            error instanceof FiscalProviderError ? !error.retryable : false,
        },
        now,
      );
      return 'still-unknown';
    }

    const statusUuid = asString(status.uuid);
    if (!statusUuid || status.status === 'UNKNOWN') {
      await this.finishUnknown(
        candidate,
        {
          code: 'CFDI_RECONCILIATION_STATUS_INDETERMINATE',
          retryable: true,
          remediation: false,
          providerStatus: status.status,
        },
        now,
      );
      return 'still-unknown';
    }

    let xml: FiscalArtifactContent;
    try {
      xml = await this.provider.getXml({
        correlationId: candidate.recoveryCorrelationId,
        providerKey: candidate.providerKey,
        providerDocumentId: candidate.providerReference,
      });
    } catch (error) {
      await this.finishUnknown(
        candidate,
        {
          code:
            error instanceof FiscalProviderError
              ? error.code
              : 'CFDI_RECONCILIATION_XML_UNAVAILABLE',
          retryable:
            error instanceof FiscalProviderError ? error.retryable : true,
          remediation:
            error instanceof FiscalProviderError ? !error.retryable : false,
          providerStatus: status.status,
        },
        now,
      );
      return 'still-unknown';
    }

    const tfd = parseTfd(xml);
    if (!tfd || normalized(tfd.uuid) !== normalized(statusUuid)) {
      await this.finishUnknown(
        candidate,
        {
          code: !tfd
            ? 'CFDI_RECONCILIATION_TFD_INCOMPLETE'
            : 'CFDI_RECONCILIATION_UUID_MISMATCH',
          retryable: false,
          remediation: true,
          providerStatus: status.status,
        },
        now,
      );
      return 'still-unknown';
    }

    let pdf: FiscalArtifactContent | null = null;
    try {
      pdf = await this.provider.getPdf({
        correlationId: candidate.recoveryCorrelationId,
        providerKey: candidate.providerKey,
        providerDocumentId: candidate.providerReference,
      });
    } catch {
      // A missing PDF is an artifact inconsistency, not a reason to lose a
      // confirmed CFDI. FiscalArtifactService records it as recoverable.
      pdf = null;
    }

    const stampedAt = tfd.stampedAt;
    const response: FiscalStampResponse = {
      correlationId: candidate.recoveryCorrelationId,
      provider: status.provider,
      providerDocumentId: candidate.providerReference,
      outcome: 'STAMPED',
      uuid: normalized(tfd.uuid),
      issuedAt:
        status.issuedAt ??
        candidate.invoice.issuedAt?.toISOString() ??
        stampedAt,
      stampedAt,
      tfd,
      xmlReference: {
        artifactType: 'XML',
        providerDocumentId: candidate.providerReference,
      },
      pdfReference: {
        artifactType: 'PDF',
        providerDocumentId: candidate.providerReference,
      },
    };

    try {
      await this.persistRecoveredStamp(candidate, response, now);
    } catch (error) {
      await this.finishUnknown(
        candidate,
        {
          code:
            error instanceof Error && error.message.startsWith('CFDI_')
              ? error.message
              : 'CFDI_RECONCILIATION_PERSISTENCE_FAILED',
          retryable: false,
          remediation: true,
          providerStatus: status.status,
        },
        now,
      );
      return 'still-unknown';
    }

    try {
      await this.artifacts.persistStampedArtifacts(
        candidate.invoiceId,
        response,
        {
          XML: xml,
          PDF: pdf,
        },
      );
    } catch {
      // Invoice identity is already committed. Artifact recovery is separate
      // and must not downgrade a confirmed STAMPED invoice.
    }
    this.logger.log({
      event: 'cfdi.reconciliation.recovered',
      invoiceId: candidate.invoiceId,
      attemptId: candidate.id,
      recoveryAttemptId: candidate.recoveryAttemptId,
      correlationId: candidate.recoveryCorrelationId,
      uuid: response.uuid,
    });
    return 'recovered';
  }

  private async persistRecoveredStamp(
    candidate: ClaimedCandidate,
    response: FiscalStampResponse,
    completedAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${candidate.invoiceId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({
        where: { id: candidate.invoiceId },
        select: {
          id: true,
          uuid: true,
          fiscalStatus: true,
          certificateNumber: true,
          fiscalCertificate: { select: { serialNumber: true } },
          issuerSnapshot: true,
          createdByUserId: true,
          sourceCreditAdjustmentId: true,
        },
      });
      if (!invoice) throw new Error('CFDI_INVOICE_NOT_FOUND');
      if (
        invoice.uuid &&
        normalized(invoice.uuid) !== normalized(response.uuid)
      )
        throw new Error('CFDI_RECONCILIATION_UUID_MISMATCH');
      if (
        invoice.fiscalStatus === InvoiceFiscalStatus.STAMPED &&
        invoice.uuid
      ) {
        await tx.fiscalOperationAttempt.updateMany({
          where: { id: candidate.id, status: FiscalOperationStatus.PROCESSING },
          data: {
            status: FiscalOperationStatus.SUCCEEDED,
            providerReference: response.providerDocumentId,
            completedAt,
            responseDigest: responseDigest(response),
            errorCode: null,
            errorMessage: null,
            nextRetryAt: null,
          },
        });
        await tx.fiscalOperationAttempt.update({
          where: { id: candidate.recoveryAttemptId },
          data: {
            status: FiscalOperationStatus.SUCCEEDED,
            providerReference: response.providerDocumentId,
            completedAt,
            responseDigest: responseDigest(response),
            errorCode: null,
            errorMessage: null,
            nextRetryAt: null,
          },
        });
        return {
          fiscalStatus: InvoiceFiscalStatus.STAMPED,
          operationStatus: FiscalOperationStatus.SUCCEEDED,
          uuid: invoice.uuid,
        };
      }
      if (invoice.fiscalStatus !== InvoiceFiscalStatus.UNKNOWN)
        throw new Error('CFDI_RECONCILIATION_STATE_CONFLICT');

      const certificateNumber =
        invoice.certificateNumber ??
        invoice.fiscalCertificate?.serialNumber ??
        jsonField(invoice.issuerSnapshot, 'certificateSerialNumber');
      if (!certificateNumber)
        throw new Error('CFDI_RECONCILIATION_CERTIFICATE_MISSING');

      await tx.invoice.update({
        where: { id: candidate.invoiceId },
        data: {
          uuid: response.uuid,
          stampedAt: new Date(response.stampedAt),
          tfdVersion: '1.1',
          certificateNumber,
          satCertificateNumber: response.tfd.satCertificateNumber,
          certificationProviderTaxId: response.tfd.providerCertificateRfc,
          cfdiSeal: response.tfd.cfdiSeal,
          satSeal: response.tfd.satSeal,
          fiscalStatus: InvoiceFiscalStatus.STAMPED,
          lastFiscalErrorCode: null,
          lastFiscalErrorMessage: null,
          version: { increment: 1 },
        },
      });
      const original = await tx.fiscalOperationAttempt.updateMany({
        where: { id: candidate.id, status: FiscalOperationStatus.PROCESSING },
        data: {
          status: FiscalOperationStatus.SUCCEEDED,
          providerReference: response.providerDocumentId,
          completedAt,
          responseDigest: responseDigest(response),
          errorCode: null,
          errorMessage: null,
          nextRetryAt: null,
        },
      });
      if (original.count !== 1)
        throw new Error('CFDI_RECONCILIATION_STATE_CONFLICT');
      await tx.paymentInvoiceApplication.updateMany({
        where: {
          paymentReceiptDetail: {
            paymentReceipt: { invoiceId: candidate.invoiceId },
          },
          status: PaymentInvoiceApplicationStatus.UNKNOWN,
        },
        data: { status: PaymentInvoiceApplicationStatus.EFFECTIVE },
      });
      if (invoice.sourceCreditAdjustmentId) {
        await tx.creditAdjustment.updateMany({
          where: {
            id: invoice.sourceCreditAdjustmentId,
            status: CreditAdjustmentStatus.UNKNOWN,
          },
          data: {
            status: CreditAdjustmentStatus.ISSUED,
            version: { increment: 1 },
          },
        });
      }
      await tx.fiscalOperationAttempt.update({
        where: { id: candidate.recoveryAttemptId },
        data: {
          status: FiscalOperationStatus.SUCCEEDED,
          providerReference: response.providerDocumentId,
          completedAt,
          responseDigest: responseDigest(response),
          errorCode: null,
          errorMessage: null,
          nextRetryAt: null,
        },
      });
      await tx.billingAuditLog.create({
        data: {
          actorUserId: invoice.createdByUserId,
          action: 'CFDI_STAMP_RECONCILED',
          entityType: 'Invoice',
          entityId: candidate.invoiceId,
          correlationId: candidate.recoveryCorrelationId,
          reason: 'CFDI_PROVIDER_CONFIRMED',
          after: this.toJson({
            attemptId: candidate.id,
            recoveryAttemptId: candidate.recoveryAttemptId,
            uuid: response.uuid,
            provider: response.provider,
          }),
        },
      });
      return {
        fiscalStatus: InvoiceFiscalStatus.STAMPED,
        operationStatus: FiscalOperationStatus.SUCCEEDED,
        uuid: response.uuid,
      };
    });
  }

  private async finishUnknown(
    candidate: ClaimedCandidate,
    failure: ReconciliationFailure,
    now: Date,
  ): Promise<void> {
    const maxRetries = this.config.get<number>(
      'CFDI_MAX_RETRIES',
      DEFAULT_MAX_RETRIES,
    );
    const canRetryStatus =
      failure.retryable && candidate.recoveryAttemptNumber <= maxRetries;
    const nextRetryAt = canRetryStatus
      ? new Date(
          now.getTime() +
            Math.min(
              MAX_RETRY_DELAY_MS,
              DEFAULT_RETRY_DELAY_MS *
                2 ** Math.max(0, candidate.recoveryAttemptNumber - 1),
            ),
        )
      : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${candidate.invoiceId} FOR UPDATE`;
      await tx.fiscalOperationAttempt.updateMany({
        where: { id: candidate.id, status: FiscalOperationStatus.PROCESSING },
        data: {
          status: FiscalOperationStatus.UNKNOWN,
          completedAt: now,
          nextRetryAt,
          errorCode: failure.code,
          errorMessage: failure.code,
        },
      });
      await tx.fiscalOperationAttempt.update({
        where: { id: candidate.recoveryAttemptId },
        data: {
          status: canRetryStatus
            ? FiscalOperationStatus.UNKNOWN
            : failure.code === 'FISCAL_PROVIDER_NOT_FOUND'
              ? FiscalOperationStatus.SUCCEEDED
              : FiscalOperationStatus.TERMINAL_FAILURE,
          completedAt: now,
          nextRetryAt,
          errorCode: failure.code,
          errorMessage: failure.code,
        },
      });
      await tx.invoice.update({
        where: { id: candidate.invoiceId },
        data: {
          fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
          lastFiscalAttemptAt: now,
          lastFiscalErrorCode: failure.code,
          lastFiscalErrorMessage: failure.code,
          version: { increment: 1 },
        },
      });
      if (failure.remediation || (!canRetryStatus && failure.retryable)) {
        await this.upsertRemediation(tx, candidate, failure, now);
      }
      await tx.billingAuditLog.create({
        data: {
          actorUserId: candidate.invoice.createdByUserId,
          action: 'CFDI_STAMP_RECONCILIATION_PENDING',
          entityType: 'Invoice',
          entityId: candidate.invoiceId,
          correlationId: candidate.recoveryCorrelationId,
          reason: failure.code,
          after: this.toJson({
            attemptId: candidate.id,
            recoveryAttemptId: candidate.recoveryAttemptId,
            nextRetryAt,
            providerStatus: failure.providerStatus,
          }),
        },
      });
    });
    if (failure.code === 'FISCAL_PROVIDER_NOT_FOUND') {
      this.logger.warn({
        event: 'cfdi.reconciliation.not-found',
        invoiceId: candidate.invoiceId,
        attemptId: candidate.id,
        recoveryAttemptId: candidate.recoveryAttemptId,
        retryScheduled: Boolean(nextRetryAt),
      });
    } else {
      this.logger.warn({
        event: 'cfdi.reconciliation.unknown',
        invoiceId: candidate.invoiceId,
        attemptId: candidate.id,
        recoveryAttemptId: candidate.recoveryAttemptId,
        code: failure.code,
        retryScheduled: Boolean(nextRetryAt),
      });
    }
  }

  private async upsertRemediation(
    tx: Prisma.TransactionClient,
    candidate: ClaimedCandidate,
    failure: ReconciliationFailure,
    detectedAt: Date,
  ) {
    const code = failure.code.startsWith('CFDI_')
      ? failure.code
      : 'CFDI_STAMP_RECONCILIATION_INCONSISTENT';
    await tx.billingDataRemediation.upsert({
      where: {
        code_entityType_entityId: {
          code,
          entityType: 'Invoice',
          entityId: candidate.invoiceId,
        },
      },
      create: {
        code,
        entityType: 'Invoice',
        entityId: candidate.invoiceId,
        details: this.toJson({
          invoiceId: candidate.invoiceId,
          stampAttemptId: candidate.id,
          recoveryAttemptId: candidate.recoveryAttemptId,
          correlationId: candidate.recoveryCorrelationId,
          providerReference: candidate.providerReference,
          detectedAt: detectedAt.toISOString(),
          providerStatus: failure.providerStatus,
          errorCode: failure.code,
        }),
      },
      update: {
        details: this.toJson({
          invoiceId: candidate.invoiceId,
          stampAttemptId: candidate.id,
          recoveryAttemptId: candidate.recoveryAttemptId,
          correlationId: candidate.recoveryCorrelationId,
          providerReference: candidate.providerReference,
          detectedAt: detectedAt.toISOString(),
          providerStatus: failure.providerStatus,
          errorCode: failure.code,
        }),
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNotes: null,
      },
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
