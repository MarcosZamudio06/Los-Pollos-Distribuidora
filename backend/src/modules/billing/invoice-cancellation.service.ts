import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditAdjustmentStatus,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceStatus,
  PaymentInvoiceApplicationStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalCancellationMotive,
  type FiscalCancellationResponse,
  type FiscalProviderPort,
} from '../cfdi/domain/fiscal-provider.port';
import { FiscalArtifactService } from '../cfdi/fiscal-artifact.service';
import { FiscalEventLogger } from '../cfdi/fiscal-event.logger';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const cancellationInclude = {
  documents: { include: { itemApplications: true } },
  substitutes: { select: { id: true } },
  replacementInvoice: { select: { id: true, uuid: true } },
  paymentReceipt: {
    select: {
      id: true,
      details: {
        select: {
          id: true,
          applications: {
            where: {
              status: {
                in: [
                  PaymentInvoiceApplicationStatus.RESERVED,
                  PaymentInvoiceApplicationStatus.UNKNOWN,
                  PaymentInvoiceApplicationStatus.EFFECTIVE,
                ],
              },
            },
            select: { id: true, status: true },
          },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

type CancellationInvoice = Prisma.InvoiceGetPayload<{
  include: typeof cancellationInclude;
}>;

type NormalizedCancellation = {
  expectedVersion: number;
  cancellationMotiveCode: FiscalCancellationMotive;
  internalReason: string;
  replacementInvoiceId: string | null;
};

type PreparedCancellation = {
  replayed: boolean;
  invoice: CancellationInvoice;
  invoiceId: string;
  attemptId: string | null;
  correlationId: string | null;
  providerDocumentId: string | null;
  providerKey: string | null;
  uuid: string | null;
  cancellationMotiveCode: FiscalCancellationMotive;
  internalReason: string;
  replacementInvoiceId: string | null;
  replacementUuid: string | null;
  actorUserId: string;
  idempotencyKey: string;
  payloadHash: string;
};

type CancellationResult = CancellationInvoice & { replayed: boolean };

export type CancellationReconciliationState =
  'CANCELLED' | 'PENDING' | 'REJECTED' | 'ERROR';

export type CancellationReconciliationResult = {
  state: CancellationReconciliationState;
  invoiceId: string;
  acknowledgmentPersisted?: boolean;
  nextRetryAt?: Date | null;
};

const MOTIVES = ['01', '02', '03', '04'] as const;
const TERMINAL_PROVIDER_ERRORS = new Set([
  'FISCAL_PROVIDER_CONFIGURATION',
  'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
  'FISCAL_PROVIDER_AUTHENTICATION',
  'FISCAL_PROVIDER_VALIDATION',
  'FISCAL_PROVIDER_RESPONSE_INVALID',
  'FISCAL_PROVIDER_CANCEL_REJECTED',
]);

@Injectable()
export class InvoiceCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider?: FiscalProviderPort,
    @Optional() private readonly artifacts?: FiscalArtifactService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly events?: FiscalEventLogger,
  ) {}

  /**
   * Reserves a fiscal cancellation in a short transaction, calls the PAC
   * outside the transaction, and only reverses billable applications after a
   * confirmed `CANCELLED` response.
   */
  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: Actor,
    idempotencyKey: string,
  ): Promise<CancellationResult> {
    const normalized = this.normalize(dto);
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    if (!this.provider)
      throw new ServiceUnavailableException('FISCAL_PROVIDER_UNAVAILABLE');

    const payload = {
      invoiceId: id,
      expectedVersion: normalized.expectedVersion,
      cancellationMotiveCode: normalized.cancellationMotiveCode,
      internalReason: normalized.internalReason,
      replacementInvoiceId: normalized.replacementInvoiceId,
      actorUserId: actor.id,
    };
    const payloadHash = this.hashPayload(payload);
    const prepared = await this.prepareCancellation(
      id,
      normalized,
      actor,
      key,
      payloadHash,
    );
    this.events?.emit('cfdi.cancel.started', {
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      correlationId: prepared.correlationId,
      providerKey: prepared.providerKey,
    });
    if (prepared.replayed) {
      const replay = this.toResult(prepared.invoice, true);
      this.events?.emit('cfdi.cancel.completed', {
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        state: prepared.invoice.cancellationStatus,
        replayed: true,
      });
      return replay;
    }

    let response: FiscalCancellationResponse;
    try {
      response = await this.provider.cancel({
        correlationId: prepared.correlationId!,
        providerKey: prepared.providerKey ?? undefined,
        providerDocumentId: prepared.providerDocumentId!,
        uuid: prepared.uuid!,
        motive: prepared.cancellationMotiveCode,
        ...(prepared.replacementUuid
          ? { replacementUuid: prepared.replacementUuid }
          : {}),
      });
    } catch (error) {
      const code = this.providerErrorCode(error);
      const result = await this.finalizeProviderError(prepared, error);
      this.events?.emit(
        TERMINAL_PROVIDER_ERRORS.has(code)
          ? 'cfdi.cancel.failed'
          : 'cfdi.cancel.unknown',
        {
          invoiceId: prepared.invoiceId,
          attemptId: prepared.attemptId,
          correlationId: prepared.correlationId,
          code,
        },
      );
      return result;
    }

    let result: CancellationResult;
    try {
      result = await this.finalizeProviderResponse(prepared, response);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw error;
      const unknown = await this.finalizeProviderError(prepared, {
        code: 'CFDI_CANCELLATION_RESULT_PERSISTENCE_FAILED',
      });
      this.events?.emit('cfdi.cancel.unknown', {
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        correlationId: prepared.correlationId,
        code: 'CFDI_CANCELLATION_RESULT_PERSISTENCE_FAILED',
      });
      return unknown;
    }
    if (response.status === 'CANCELLED' && this.artifacts) {
      try {
        await this.artifacts.persistCancellationAcknowledgment(
          prepared.invoiceId,
          response,
        );
      } catch {
        // A cancellation is already confirmed; an ack-storage issue is
        // recoverable and must not downgrade the fiscal state.
      }
    }
    this.events?.emit(
      response.status === 'UNKNOWN'
        ? 'cfdi.cancel.unknown'
        : response.status === 'REJECTED'
          ? 'cfdi.cancel.failed'
          : 'cfdi.cancel.completed',
      {
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        correlationId: prepared.correlationId,
        state: response.status,
        ...(response.status === 'REJECTED'
          ? { code: 'FISCAL_PROVIDER_CANCEL_REJECTED' }
          : response.status === 'UNKNOWN'
            ? { code: 'CFDI_CANCELLATION_STATUS_INDETERMINATE' }
            : {}),
      },
    );
    return result;
  }

  /**
   * Reconciles an already submitted cancellation. This method is intentionally
   * status-only: it never calls `cancel` again, so a timeout or a scheduled
   * retry cannot create a second fiscal cancellation request.
   */
  async reconcileCancellationStatus(
    invoiceId: string,
    cancellationAttemptId: string,
    statusAttemptId: string,
    now = new Date(),
  ): Promise<CancellationReconciliationResult> {
    if (!this.provider)
      throw new ServiceUnavailableException('FISCAL_PROVIDER_UNAVAILABLE');

    const [invoice, cancellationAttempt, statusAttempt] = await Promise.all([
      this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: cancellationInclude,
      }),
      this.prisma.fiscalOperationAttempt.findUnique({
        where: { id: cancellationAttemptId },
        select: {
          id: true,
          operation: true,
          providerReference: true,
          correlationId: true,
          idempotencyKey: true,
          requestHash: true,
          providerKey: true,
        },
      }),
      this.prisma.fiscalOperationAttempt.findUnique({
        where: { id: statusAttemptId },
        select: { id: true, attemptNumber: true, status: true },
      }),
    ]);

    if (!invoice || invoice.id !== invoiceId)
      throw new NotFoundException('INVOICE_NOT_FOUND');
    if (invoice.cancellationStatus === 'ACCEPTED') {
      await this.completeStatusAttempt(statusAttemptId, now, null);
      return { state: 'CANCELLED', invoiceId };
    }
    if (
      !cancellationAttempt ||
      cancellationAttempt.operation !== FiscalOperationType.CANCEL ||
      !cancellationAttempt.providerReference ||
      !cancellationAttempt.correlationId
    ) {
      return this.recordCancellationStatusFailure(
        this.reconciliationPrepared(invoice, cancellationAttempt),
        statusAttemptId,
        statusAttempt?.attemptNumber ?? 1,
        'CANCELLATION_PROVIDER_REFERENCE_MISSING',
        false,
        now,
      );
    }

    const prepared = this.reconciliationPrepared(invoice, cancellationAttempt);
    let response: FiscalCancellationResponse;
    try {
      response = await this.provider.getCancellationStatus({
        correlationId: cancellationAttempt.correlationId,
        providerKey: cancellationAttempt.providerKey ?? undefined,
        providerDocumentId: cancellationAttempt.providerReference,
        uuid: invoice.uuid ?? undefined,
      });
    } catch (error) {
      return this.recordCancellationStatusFailure(
        prepared,
        statusAttemptId,
        statusAttempt?.attemptNumber ?? 1,
        this.providerErrorCode(error),
        error instanceof FiscalProviderError ? error.retryable : true,
        now,
      );
    }

    if (
      response.correlationId !== cancellationAttempt.correlationId ||
      response.providerDocumentId !== cancellationAttempt.providerReference ||
      response.uuid.trim().toUpperCase() !== invoice.uuid?.trim().toUpperCase()
    ) {
      return this.recordCancellationStatusFailure(
        prepared,
        statusAttemptId,
        statusAttempt?.attemptNumber ?? 1,
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        false,
        now,
      );
    }

    let result: CancellationResult;
    try {
      result = await this.finalizeProviderResponse(prepared, response);
    } catch {
      return this.recordCancellationStatusFailure(
        prepared,
        statusAttemptId,
        statusAttempt?.attemptNumber ?? 1,
        'CFDI_CANCELLATION_RESULT_PERSISTENCE_FAILED',
        true,
        now,
      );
    }

    const state =
      response.status === 'CANCELLED'
        ? 'CANCELLED'
        : response.status === 'PENDING'
          ? 'PENDING'
          : response.status === 'REJECTED'
            ? 'REJECTED'
            : 'ERROR';
    const nextRetryAt =
      state === 'PENDING'
        ? this.cancellationNextRetryAt(statusAttempt?.attemptNumber ?? 1, now)
        : null;
    await this.completeStatusAttempt(statusAttemptId, now, {
      errorCode:
        state === 'ERROR' ? 'CFDI_CANCELLATION_STATUS_INDETERMINATE' : null,
      nextRetryAt,
      status:
        state === 'ERROR'
          ? FiscalOperationStatus.TERMINAL_FAILURE
          : FiscalOperationStatus.SUCCEEDED,
    });
    await this.prisma.fiscalOperationAttempt.update({
      where: { id: cancellationAttemptId },
      data: { nextRetryAt },
    });

    let acknowledgmentPersisted: boolean | undefined;
    if (state === 'CANCELLED' && this.artifacts) {
      try {
        const artifactStatus =
          await this.artifacts.persistCancellationAcknowledgment(
            invoiceId,
            response,
          );
        acknowledgmentPersisted = artifactStatus === 'AVAILABLE';
      } catch {
        // Fiscal confirmation is authoritative; missing ack storage remains
        // recoverable through the artifact remediation path.
        acknowledgmentPersisted = false;
      }
    }
    void result;
    return { state, invoiceId, nextRetryAt, acknowledgmentPersisted };
  }

  private reconciliationPrepared(
    invoice: CancellationInvoice,
    cancellationAttempt: {
      id: string;
      providerReference?: string | null;
      correlationId?: string | null;
      idempotencyKey?: string | null;
      requestHash?: string | null;
      providerKey?: string | null;
    } | null,
  ): PreparedCancellation {
    return {
      replayed: false,
      invoice,
      invoiceId: invoice.id,
      attemptId: cancellationAttempt?.id ?? null,
      correlationId: cancellationAttempt?.correlationId ?? null,
      providerDocumentId: cancellationAttempt?.providerReference ?? null,
      providerKey: cancellationAttempt?.providerKey ?? null,
      uuid: invoice.uuid,
      cancellationMotiveCode:
        (invoice.cancellationMotiveCode as FiscalCancellationMotive) ?? '02',
      internalReason:
        invoice.internalReason ??
        invoice.cancellationReason ??
        'Fiscal cancellation',
      replacementInvoiceId: invoice.replacementInvoiceId,
      replacementUuid: invoice.replacementUuid,
      actorUserId: invoice.createdByUserId,
      idempotencyKey:
        invoice.cancellationIdempotencyKey ?? `reconcile:${invoice.id}`,
      payloadHash: invoice.cancellationPayloadHash ?? '0'.repeat(64),
    };
  }

  private cancellationNextRetryAt(attemptNumber: number, now: Date): Date {
    const baseDelayMs = 60_000;
    const maxDelayMs = 15 * 60_000;
    const delay = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** Math.max(0, attemptNumber - 1),
    );
    return new Date(now.getTime() + delay);
  }

  private async completeStatusAttempt(
    statusAttemptId: string,
    completedAt: Date,
    options: {
      status?: FiscalOperationStatus;
      errorCode?: string | null;
      nextRetryAt?: Date | null;
    } | null,
  ): Promise<void> {
    await this.prisma.fiscalOperationAttempt.updateMany({
      where: {
        id: statusAttemptId,
        status: FiscalOperationStatus.PROCESSING,
      },
      data: {
        status: options?.status ?? FiscalOperationStatus.SUCCEEDED,
        completedAt,
        nextRetryAt: options?.nextRetryAt ?? null,
        errorCode: options?.errorCode ?? null,
        errorMessage: options?.errorCode ?? null,
      },
    });
  }

  private async recordCancellationStatusFailure(
    prepared: PreparedCancellation,
    statusAttemptId: string,
    statusAttemptNumber: number,
    code: string,
    retryable: boolean,
    now: Date,
  ): Promise<CancellationReconciliationResult> {
    const maxRetries = this.config?.get<number>('CFDI_MAX_RETRIES', 3) ?? 3;
    const canRetry = retryable && statusAttemptNumber < maxRetries;
    const nextRetryAt = canRetry
      ? this.cancellationNextRetryAt(statusAttemptNumber, now)
      : null;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
        const current = await tx.invoice.findUnique({
          where: { id: prepared.invoiceId },
          select: {
            id: true,
            status: true,
            cancellationStatus: true,
            version: true,
          },
        });
        if (!current || current.cancellationStatus === 'ACCEPTED') return;

        await tx.fiscalOperationAttempt.updateMany({
          where: {
            id: prepared.attemptId ?? '',
            status: {
              in: [
                FiscalOperationStatus.SUCCEEDED,
                FiscalOperationStatus.PROCESSING,
                FiscalOperationStatus.UNKNOWN,
                FiscalOperationStatus.RETRYABLE_FAILURE,
              ],
            },
          },
          data: {
            status: canRetry
              ? FiscalOperationStatus.RETRYABLE_FAILURE
              : FiscalOperationStatus.TERMINAL_FAILURE,
            nextRetryAt,
            errorCode: code,
            errorMessage: code,
          },
        });
        await tx.fiscalOperationAttempt.updateMany({
          where: {
            id: statusAttemptId,
            status: FiscalOperationStatus.PROCESSING,
          },
          data: {
            status: canRetry
              ? FiscalOperationStatus.RETRYABLE_FAILURE
              : FiscalOperationStatus.TERMINAL_FAILURE,
            completedAt: now,
            nextRetryAt,
            errorCode: code,
            errorMessage: code,
          },
        });
        await tx.invoice.update({
          where: { id: prepared.invoiceId, version: current.version },
          data: {
            status: 'ACTIVE',
            cancellationStatus: canRetry ? 'PENDING' : 'UNKNOWN',
            lastFiscalAttemptAt: now,
            lastFiscalErrorCode: code,
            lastFiscalErrorMessage: code,
            version: { increment: 1 },
          },
        });
        if (!canRetry) {
          await tx.billingDataRemediation.upsert({
            where: {
              code_entityType_entityId: {
                code: 'CFDI_CANCELLATION_STATUS_UNRESOLVED',
                entityType: 'Invoice',
                entityId: prepared.invoiceId,
              },
            },
            create: {
              code: 'CFDI_CANCELLATION_STATUS_UNRESOLVED',
              entityType: 'Invoice',
              entityId: prepared.invoiceId,
              details: this.toJson({
                invoiceId: prepared.invoiceId,
                cancellationAttemptId: prepared.attemptId,
                statusAttemptId,
                correlationId: prepared.correlationId,
                errorCode: code,
              }),
            },
            update: {
              details: this.toJson({
                invoiceId: prepared.invoiceId,
                cancellationAttemptId: prepared.attemptId,
                statusAttemptId,
                correlationId: prepared.correlationId,
                errorCode: code,
              }),
              resolvedAt: null,
              resolvedByUserId: null,
              resolutionNotes: null,
            },
          });
        }
        await tx.billingAuditLog.create({
          data: {
            actorUserId: prepared.actorUserId,
            action: canRetry
              ? 'CFDI_CANCELLATION_PENDING'
              : 'CFDI_CANCELLATION_ERROR',
            entityType: 'Invoice',
            entityId: prepared.invoiceId,
            reason: code,
            correlationId: prepared.correlationId,
            after: this.toJson({
              cancellationStatus: canRetry ? 'PENDING' : 'UNKNOWN',
              nextRetryAt,
              releasedBillingBalance: false,
              applicationsReversed: false,
            }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      state: canRetry ? 'PENDING' : 'ERROR',
      invoiceId: prepared.invoiceId,
      nextRetryAt,
    };
  }

  private async prepareCancellation(
    id: string,
    dto: NormalizedCancellation,
    actor: Actor,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<PreparedCancellation> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await tx.invoice.findFirst({
            where: { cancellationIdempotencyKey: idempotencyKey },
            include: cancellationInclude,
          });
          if (replay) {
            if (replay.cancellationPayloadHash !== payloadHash)
              throw new ConflictException('IDEMPOTENCY_CONFLICT');
            return this.replay(replay, actor.id, idempotencyKey, payloadHash);
          }

          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
          const invoice = await tx.invoice.findUnique({
            where: { id },
            include: cancellationInclude,
          });
          if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
          if (invoice.version !== dto.expectedVersion)
            throw new ConflictException('VERSION_CONFLICT');
          if (invoice.status !== InvoiceStatus.ACTIVE)
            throw new BadRequestException('INVOICE_NOT_ACTIVE');
          if (
            invoice.fiscalStatus !== InvoiceFiscalStatus.STAMPED ||
            !invoice.uuid
          ) {
            throw new BadRequestException('INVOICE_NOT_FISCALLY_STAMPED');
          }
          if (invoice.cancellationStatus === 'PENDING')
            throw new ConflictException('CANCELLATION_IN_PROGRESS');
          if (invoice.cancellationStatus === 'ACCEPTED')
            throw new BadRequestException('INVOICE_ALREADY_CANCELLED');

          const stampAttempt = await tx.fiscalOperationAttempt.findFirst({
            where: {
              invoiceId: id,
              operation: FiscalOperationType.STAMP,
              status: FiscalOperationStatus.SUCCEEDED,
              providerReference: { not: null },
            },
            orderBy: { attemptNumber: 'desc' },
            select: { providerReference: true, providerKey: true },
          });
          if (!stampAttempt?.providerReference)
            throw new BadRequestException(
              'CANCELLATION_PROVIDER_REFERENCE_MISSING',
            );

          const replacement = await this.resolveReplacement(tx, invoice, dto);
          const previousCancel = await tx.fiscalOperationAttempt.findFirst({
            where: { invoiceId: id, operation: FiscalOperationType.CANCEL },
            orderBy: { attemptNumber: 'desc' },
            select: { attemptNumber: true },
          });
          const attemptNumber = (previousCancel?.attemptNumber ?? 0) + 1;
          const correlationId = randomUUID();
          const attempt = await tx.fiscalOperationAttempt.create({
            data: {
              invoiceId: id,
              operation: FiscalOperationType.CANCEL,
              status: FiscalOperationStatus.PROCESSING,
              attemptNumber,
              correlationId,
              idempotencyKey: `cancel:${idempotencyKey}`,
              requestHash: payloadHash,
              providerKey: stampAttempt.providerKey,
              providerReference: stampAttempt.providerReference,
            },
            select: { id: true, correlationId: true },
          });
          const updated = await tx.invoice.update({
            where: { id, version: dto.expectedVersion },
            data: {
              cancellationStatus: 'PENDING',
              cancellationMotiveCode: dto.cancellationMotiveCode,
              internalReason: dto.internalReason,
              // Keep the legacy report field as a compatibility mirror.
              cancellationReason: dto.internalReason,
              replacementInvoiceId: replacement?.id ?? null,
              replacementUuid: replacement?.uuid ?? null,
              substitutionUuid: replacement?.uuid ?? null,
              cancellationIdempotencyKey: idempotencyKey,
              cancellationPayloadHash: payloadHash,
              fiscalAttemptCount: { increment: 1 },
              lastFiscalAttemptAt: new Date(),
              lastFiscalErrorCode: null,
              lastFiscalErrorMessage: null,
              version: { increment: 1 },
            },
            include: cancellationInclude,
          });
          await tx.billingAuditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'CFDI_CANCELLATION_REQUESTED',
              entityType: 'Invoice',
              entityId: id,
              before: this.toJson({
                status: invoice.status,
                cancellationStatus: invoice.cancellationStatus,
                version: invoice.version,
              }),
              after: this.toJson({
                status: updated.status,
                cancellationStatus: updated.cancellationStatus,
                cancellationMotiveCode: dto.cancellationMotiveCode,
                replacementInvoiceId: replacement?.id ?? null,
              }),
              reason: dto.internalReason,
              correlationId,
              context: this.toJson({
                releasedBillingBalance: false,
                applicationsReversed: false,
              }),
            },
          });

          return {
            replayed: false,
            invoice: updated,
            invoiceId: id,
            attemptId: attempt.id,
            correlationId: attempt.correlationId,
            providerDocumentId: stampAttempt.providerReference,
            providerKey: stampAttempt.providerKey,
            uuid: invoice.uuid,
            cancellationMotiveCode: dto.cancellationMotiveCode,
            internalReason: dto.internalReason,
            replacementInvoiceId: replacement?.id ?? null,
            replacementUuid: replacement?.uuid ?? null,
            actorUserId: actor.id,
            idempotencyKey,
            payloadHash,
          } satisfies PreparedCancellation;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        const replay = await this.prisma.invoice.findFirst({
          where: { cancellationIdempotencyKey: idempotencyKey },
          include: cancellationInclude,
        });
        if (replay) {
          if (replay.cancellationPayloadHash !== payloadHash)
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return this.replay(replay, actor.id, idempotencyKey, payloadHash);
        }
        throw new ConflictException('CONCURRENT_INVOICE_CANCELLATION');
      }
      throw error;
    }
  }

  private async resolveReplacement(
    tx: Prisma.TransactionClient,
    invoice: CancellationInvoice,
    dto: NormalizedCancellation,
  ) {
    if (dto.cancellationMotiveCode !== '01') {
      if (dto.replacementInvoiceId)
        throw new BadRequestException('REPLACEMENT_ONLY_FOR_MOTIVE_01');
      return null;
    }
    if (!dto.replacementInvoiceId)
      throw new BadRequestException('CANCELLATION_REPLACEMENT_REQUIRED');
    if (dto.replacementInvoiceId === invoice.id)
      throw new BadRequestException('INVALID_REPLACEMENT_INVOICE');

    const ids = [invoice.id, dto.replacementInvoiceId].sort();
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    const replacement = await tx.invoice.findUnique({
      where: { id: dto.replacementInvoiceId },
      select: {
        id: true,
        legalEntityId: true,
        status: true,
        fiscalStatus: true,
        uuid: true,
        issuedAt: true,
        stampedAt: true,
      },
    });
    if (
      !replacement ||
      replacement.legalEntityId !== invoice.legalEntityId ||
      replacement.status !== InvoiceStatus.ACTIVE ||
      replacement.fiscalStatus !== InvoiceFiscalStatus.STAMPED ||
      !replacement.uuid
    ) {
      throw new BadRequestException('INVALID_REPLACEMENT_INVOICE');
    }
    if (
      invoice.stampedAt &&
      replacement.stampedAt &&
      replacement.stampedAt <= invoice.stampedAt
    ) {
      throw new BadRequestException('INVALID_REPLACEMENT_ORDER');
    }
    return replacement;
  }

  private async finalizeProviderResponse(
    prepared: PreparedCancellation,
    response: FiscalCancellationResponse,
  ): Promise<CancellationResult> {
    if (
      response.correlationId !== prepared.correlationId ||
      response.providerDocumentId !== prepared.providerDocumentId ||
      response.uuid.trim().toUpperCase() !== prepared.uuid?.trim().toUpperCase()
    ) {
      return this.finalizeProviderError(
        prepared,
        new FiscalProviderError(
          'FISCAL_PROVIDER_RESPONSE_INVALID',
          'CANCEL',
          prepared.correlationId!,
        ),
      );
    }
    const cancellationStatus =
      response.status === 'CANCELLED'
        ? 'ACCEPTED'
        : response.status === 'PENDING'
          ? 'PENDING'
          : response.status === 'REJECTED'
            ? 'REJECTED'
            : 'UNKNOWN';
    const operationStatus =
      response.status === 'REJECTED'
        ? FiscalOperationStatus.TERMINAL_FAILURE
        : cancellationStatus === 'UNKNOWN'
          ? FiscalOperationStatus.UNKNOWN
          : FiscalOperationStatus.SUCCEEDED;
    const responseErrorCode =
      response.status === 'REJECTED'
        ? 'FISCAL_PROVIDER_CANCEL_REJECTED'
        : cancellationStatus === 'UNKNOWN'
          ? 'CFDI_CANCELLATION_STATUS_INDETERMINATE'
          : null;
    const cancellationAt = response.cancelledAt
      ? new Date(response.cancelledAt)
      : new Date();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
        if (prepared.attemptId) {
          await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${prepared.attemptId} FOR UPDATE`;
        }
        const current = await tx.invoice.findUnique({
          where: { id: prepared.invoiceId },
          include: cancellationInclude,
        });
        if (!current) throw new NotFoundException('INVOICE_NOT_FOUND');
        if (
          current.status === InvoiceStatus.CANCELLED &&
          current.cancellationStatus === 'ACCEPTED'
        ) {
          return this.toResult(current, false);
        }
        if (current.cancellationIdempotencyKey !== prepared.idempotencyKey)
          throw new ConflictException('CANCELLATION_STATE_CONFLICT');

        const activeApplicationIds = current.documents
          .filter((document) => !document.reversedAt)
          .map((document) => document.id)
          .sort();
        const paymentApplicationIds =
          cancellationStatus === 'ACCEPTED'
            ? (current.paymentReceipt?.details ?? [])
                .flatMap((detail) =>
                  detail.applications.map((application) => application.id),
                )
                .sort()
            : [];
        if (cancellationStatus === 'ACCEPTED' && paymentApplicationIds.length) {
          await tx.$queryRaw`SELECT "id" FROM "PaymentInvoiceApplication" WHERE "id" IN (${Prisma.join(paymentApplicationIds)}) ORDER BY "id" FOR UPDATE`;
          await tx.paymentInvoiceApplication.updateMany({
            where: {
              id: { in: paymentApplicationIds },
              status: {
                in: [
                  PaymentInvoiceApplicationStatus.RESERVED,
                  PaymentInvoiceApplicationStatus.UNKNOWN,
                  PaymentInvoiceApplicationStatus.EFFECTIVE,
                ],
              },
            },
            data: {
              status: PaymentInvoiceApplicationStatus.REVERSED,
              reversedAt: cancellationAt,
            },
          });
        }
        if (cancellationStatus === 'ACCEPTED' && activeApplicationIds.length) {
          await tx.$queryRaw`SELECT "id" FROM "InvoiceSaleDocument" WHERE "id" IN (${Prisma.join(activeApplicationIds)}) ORDER BY "id" FOR UPDATE`;
          await tx.invoiceSaleItemApplication.updateMany({
            where: {
              invoiceSaleDocumentId: { in: activeApplicationIds },
              reversedAt: null,
            },
            data: {
              reversedAt: cancellationAt,
              reversedByUserId: prepared.actorUserId,
              reversalReason: prepared.internalReason,
            },
          });
          await tx.invoiceSaleDocument.updateMany({
            where: { invoiceId: prepared.invoiceId, reversedAt: null },
            data: {
              reversedAt: cancellationAt,
              reversedByUserId: prepared.actorUserId,
              reversalReason: prepared.internalReason,
            },
          });
        }
        if (
          cancellationStatus === 'ACCEPTED' &&
          current.sourceCreditAdjustmentId
        ) {
          await tx.creditAdjustment.updateMany({
            where: {
              id: current.sourceCreditAdjustmentId,
              status: CreditAdjustmentStatus.ISSUED,
            },
            data: {
              status: CreditAdjustmentStatus.CANCELLED,
              version: { increment: 1 },
            },
          });
        }

        const updated = await tx.invoice.update({
          where: { id: prepared.invoiceId, version: current.version },
          data: {
            status:
              cancellationStatus === 'ACCEPTED'
                ? InvoiceStatus.CANCELLED
                : InvoiceStatus.ACTIVE,
            cancellationStatus,
            cancelledAt:
              cancellationStatus === 'ACCEPTED' ? cancellationAt : null,
            cancelledByUserId:
              cancellationStatus === 'ACCEPTED' ? prepared.actorUserId : null,
            cancellationReason: prepared.internalReason,
            internalReason: prepared.internalReason,
            lastFiscalErrorCode: responseErrorCode,
            lastFiscalErrorMessage: responseErrorCode,
            version: { increment: 1 },
          },
          include: cancellationInclude,
        });
        if (prepared.attemptId) {
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: operationStatus,
              providerReference: response.providerDocumentId,
              completedAt: new Date(),
              errorCode: responseErrorCode,
              errorMessage: responseErrorCode,
              responseDigest: this.responseDigest(response),
            },
          });
        }
        await tx.billingAuditLog.create({
          data: {
            actorUserId: prepared.actorUserId,
            action:
              cancellationStatus === 'ACCEPTED'
                ? 'CFDI_CANCELLED'
                : cancellationStatus === 'PENDING'
                  ? 'CFDI_CANCELLATION_PENDING'
                  : cancellationStatus === 'REJECTED'
                    ? 'CFDI_CANCELLATION_REJECTED'
                    : 'CFDI_CANCELLATION_ERROR',
            entityType: 'Invoice',
            entityId: prepared.invoiceId,
            reason: prepared.internalReason,
            correlationId: prepared.correlationId,
            after: this.toJson({
              uuid: prepared.uuid,
              cancellationStatus,
              replacementUuid: prepared.replacementUuid,
              releasedBillingBalance: cancellationStatus === 'ACCEPTED',
              applicationsReversed:
                cancellationStatus === 'ACCEPTED' &&
                (activeApplicationIds.length > 0 ||
                  paymentApplicationIds.length > 0),
              paymentApplicationsReversed: paymentApplicationIds.length > 0,
            }),
          },
        });
        return this.toResult(updated, false);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async finalizeProviderError(
    prepared: PreparedCancellation,
    error: unknown,
  ): Promise<CancellationResult> {
    const code = this.providerErrorCode(error);
    const terminal = TERMINAL_PROVIDER_ERRORS.has(code);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
        const current = await tx.invoice.findUnique({
          where: { id: prepared.invoiceId },
          include: cancellationInclude,
        });
        if (!current) throw new NotFoundException('INVOICE_NOT_FOUND');
        if (
          current.status === InvoiceStatus.CANCELLED &&
          current.cancellationStatus === 'ACCEPTED'
        ) {
          return this.toResult(current, false);
        }
        const updated = await tx.invoice.update({
          where: { id: prepared.invoiceId, version: current.version },
          data: {
            status: InvoiceStatus.ACTIVE,
            cancellationStatus: 'UNKNOWN',
            cancelledAt: null,
            cancelledByUserId: null,
            lastFiscalErrorCode: code,
            lastFiscalErrorMessage: code,
            version: { increment: 1 },
          },
          include: cancellationInclude,
        });
        if (prepared.attemptId) {
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: terminal
                ? FiscalOperationStatus.TERMINAL_FAILURE
                : FiscalOperationStatus.UNKNOWN,
              completedAt: new Date(),
              errorCode: code,
              errorMessage: code,
            },
          });
        }
        await tx.billingAuditLog.create({
          data: {
            actorUserId: prepared.actorUserId,
            action: 'CFDI_CANCELLATION_ERROR',
            entityType: 'Invoice',
            entityId: prepared.invoiceId,
            reason: prepared.internalReason,
            correlationId: prepared.correlationId,
            after: this.toJson({
              cancellationStatus: 'UNKNOWN',
              errorCode: code,
              retryable: !terminal,
              releasedBillingBalance: false,
              applicationsReversed: false,
            }),
          },
        });
        return this.toResult(updated, false);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private normalize(dto: CancelInvoiceDto): NormalizedCancellation {
    const motive = dto.cancellationMotiveCode?.trim().toUpperCase();
    if (!MOTIVES.includes(motive as FiscalCancellationMotive))
      throw new BadRequestException('INVALID_CANCELLATION_MOTIVE');
    const internalReason = dto.internalReason?.trim();
    if (!internalReason)
      throw new BadRequestException('internalReason is required');
    if (internalReason.length > 500)
      throw new BadRequestException(
        'internalReason must be at most 500 characters',
      );
    return {
      expectedVersion: dto.expectedVersion,
      cancellationMotiveCode: motive as FiscalCancellationMotive,
      internalReason,
      replacementInvoiceId: dto.replacementInvoiceId?.trim() || null,
    };
  }

  private replay(
    invoice: CancellationInvoice,
    actorUserId: string,
    idempotencyKey: string,
    payloadHash: string,
  ): PreparedCancellation {
    return {
      replayed: true,
      invoice,
      invoiceId: invoice.id,
      attemptId: null,
      correlationId: null,
      providerDocumentId: null,
      providerKey: null,
      uuid: invoice.uuid,
      cancellationMotiveCode:
        (invoice.cancellationMotiveCode as FiscalCancellationMotive) ?? '02',
      internalReason:
        invoice.internalReason ?? invoice.cancellationReason ?? '',
      replacementInvoiceId: invoice.replacementInvoiceId,
      replacementUuid: invoice.replacementUuid,
      actorUserId,
      idempotencyKey,
      payloadHash,
    };
  }

  private toResult(
    invoice: CancellationInvoice,
    replayed: boolean,
  ): CancellationResult {
    return { ...invoice, replayed };
  }

  private providerErrorCode(error: unknown): string {
    if (error instanceof FiscalProviderError) return error.code;
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    ) {
      const code = (error as { code: string }).code;
      return code.startsWith('FISCAL_PROVIDER_') ||
        code.startsWith('CFDI_CANCELLATION_')
        ? code
        : 'FISCAL_PROVIDER_UNKNOWN';
    }
    return 'FISCAL_PROVIDER_UNKNOWN';
  }

  private responseDigest(response: FiscalCancellationResponse): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          provider: response.provider,
          providerDocumentId: response.providerDocumentId,
          status: response.status,
          uuid: response.uuid,
          cancelledAt: response.cancelledAt,
        }),
      )
      .digest('hex');
  }

  private hashPayload(payload: object) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
