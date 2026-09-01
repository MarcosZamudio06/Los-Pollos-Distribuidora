import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BillingRequestStatus,
  CfdiDocumentType,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { IssueCfdiDto } from '../billing-requests/dto';
import { CfdiValidationService } from './cfdi-validation.service';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import type {
  FiscalProviderKey,
  FiscalStampResponse,
} from './domain/fiscal-provider.port';
import type {
  CfdiIssuanceResult,
  FiscalIssuanceFailure,
  FiscalIssuanceFailureOutcome,
  PreparedCfdiIssuance,
} from './cfdi-issuance.types';
import type { CfdiSubstitutionBuildInput } from './domain/cfdi-document.types';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const existingInvoiceSelect = {
  id: true,
  sourceBillingRequestId: true,
  fiscalIdempotencyKey: true,
  fiscalRequestHash: true,
  fiscalStatus: true,
  uuid: true,
  series: true,
  folio: true,
  version: true,
  createdByUserId: true,
  fiscalOperationAttempts: {
    where: { operation: FiscalOperationType.STAMP },
    orderBy: { attemptNumber: 'desc' as const },
    take: 1,
    select: {
      id: true,
      correlationId: true,
      idempotencyKey: true,
      status: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolvedCfdiSubstitution = CfdiSubstitutionBuildInput & {
  readonly originalLegalEntityId: string;
};

@Injectable()
export class CfdiIssuanceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CfdiValidationService,
  ) {}

  static requestHash(billingRequestId: string, dto: IssueCfdiDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          billingRequestId,
          expectedVersion: dto.expectedVersion,
          cfdiUse: dto.cfdiUse.trim().toUpperCase(),
          paymentMethod: dto.paymentMethod.trim().toUpperCase(),
          paymentForm: dto.paymentForm.trim().toUpperCase(),
          exportCode: dto.exportCode.trim().toUpperCase(),
          tipoCambio: dto.tipoCambio?.trim() ?? null,
          globalInformation: dto.globalInformation
            ? {
                periodicity: dto.globalInformation.periodicity,
                months: dto.globalInformation.months,
                year: dto.globalInformation.year,
              }
            : null,
          substitutesInvoiceId: dto.substitutesInvoiceId?.trim() || null,
        }),
      )
      .digest('hex');
  }

  async prepare(
    billingRequestId: string,
    dto: IssueCfdiDto,
    actor: Actor,
    idempotencyKey: string,
    providerKey: FiscalProviderKey,
  ): Promise<PreparedCfdiIssuance> {
    const requestHash = CfdiIssuanceRepository.requestHash(
      billingRequestId,
      dto,
    );
    const issuedAt = new Date();

    try {
      return await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "BillingRequest" WHERE "id" = ${billingRequestId} FOR UPDATE`;

            const keyedInvoice = await tx.invoice.findUnique({
              where: { fiscalIdempotencyKey: idempotencyKey },
              select: existingInvoiceSelect,
            });
            if (keyedInvoice) {
              if (
                keyedInvoice.sourceBillingRequestId !== billingRequestId ||
                keyedInvoice.fiscalRequestHash !== requestHash
              ) {
                throw new ConflictException('IDEMPOTENCY_CONFLICT');
              }
              return this.toReplay(keyedInvoice, billingRequestId);
            }

            const request = await tx.billingRequest.findUnique({
              where: { id: billingRequestId },
              select: {
                id: true,
                status: true,
                version: true,
                nativeInvoice: { select: { id: true } },
              },
            });
            if (!request)
              throw new NotFoundException('BILLING_REQUEST_NOT_FOUND');
            if (request.nativeInvoice)
              throw new ConflictException('CFDI_OPERATION_ALREADY_EXISTS');
            if (request.status !== BillingRequestStatus.APPROVED)
              throw new BadRequestException('BILLING_REQUEST_NOT_APPROVED');
            if (request.version !== dto.expectedVersion)
              throw new ConflictException('VERSION_CONFLICT');

            const sourceDocuments =
              await tx.billingRequestSaleDocument.findMany({
                where: { billingRequestId, reversedAt: null },
                orderBy: { saleDocumentId: 'asc' },
                include: {
                  requestedItems: {
                    where: { reversedAt: null },
                    orderBy: { saleItemId: 'asc' },
                  },
                },
              });
            if (!sourceDocuments.length)
              throw new UnprocessableEntityException('EMPTY_BILLING_REQUEST');

            const documentIds = sourceDocuments.map(
              (source) => source.saleDocumentId,
            );
            await tx.$queryRaw`SELECT "id" FROM "SaleDocument" WHERE "id" IN (${Prisma.join(documentIds)}) ORDER BY "id" FOR UPDATE`;

            const substitution = await this.resolveSubstitution(
              tx,
              billingRequestId,
              dto.substitutesInvoiceId,
            );

            const snapshot =
              await this.validation.buildApprovedRequestWithClient(
                tx,
                billingRequestId,
                {
                  issuedAt,
                  cfdiUse: dto.cfdiUse,
                  payment: {
                    exportCode: dto.exportCode,
                    paymentFormCode: dto.paymentForm,
                    paymentMethodCode: dto.paymentMethod,
                    exchangeRate: new Prisma.Decimal(dto.tipoCambio ?? 1),
                  },
                  ...(dto.globalInformation
                    ? { globalInformation: dto.globalInformation }
                    : {}),
                  ...(substitution
                    ? {
                        substitution: {
                          originalInvoiceId: substitution.originalInvoiceId,
                          originalUuid: substitution.originalUuid,
                        },
                      }
                    : {}),
                },
              );
            if (substitution) {
              this.validateSubstitutionSnapshot(snapshot, substitution);
            }
            if (snapshot.currencyCode !== 'MXN' && !dto.tipoCambio) {
              throw new UnprocessableEntityException(
                'INVALID_PAYMENT_CONFIGURATION',
              );
            }

            const certificateMetadata = await tx.legalEntity.findUnique({
              where: { id: snapshot.issuer.legalEntityId },
              select: {
                certificateSubject: true,
                certificateValidFrom: true,
                certificateValidTo: true,
              },
            });
            if (
              !certificateMetadata?.certificateValidFrom ||
              !certificateMetadata.certificateValidTo
            ) {
              throw new UnprocessableEntityException('MISSING_FISCAL_PROFILE');
            }

            const certificate = await tx.fiscalCertificate.upsert({
              where: {
                legalEntityId_serialNumber: {
                  legalEntityId: snapshot.issuer.legalEntityId,
                  serialNumber: snapshot.issuer.certificateSerialNumber,
                },
              },
              update: {},
              create: {
                legalEntityId: snapshot.issuer.legalEntityId,
                serialNumber: snapshot.issuer.certificateSerialNumber,
                fingerprintSha256: snapshot.issuer.certificateFingerprint,
                subject: certificateMetadata.certificateSubject,
                validFrom: certificateMetadata.certificateValidFrom,
                validTo: certificateMetadata.certificateValidTo,
              },
              select: { id: true },
            });

            const sequence = await tx.fiscalFolioSequence.upsert({
              where: {
                legalEntityId_cfdiType_series: {
                  legalEntityId: snapshot.issuer.legalEntityId,
                  cfdiType: CfdiDocumentType.INCOME,
                  series: snapshot.issuer.series,
                },
              },
              update: { nextValue: { increment: 1 } },
              create: {
                legalEntityId: snapshot.issuer.legalEntityId,
                cfdiType: CfdiDocumentType.INCOME,
                series: snapshot.issuer.series,
                nextValue: 2,
              },
              select: { nextValue: true },
            });
            const folio = (sequence.nextValue - 1n).toString();

            const invoice = await tx.invoice.create({
              data: {
                legalEntityId: snapshot.issuer.legalEntityId,
                sourceBillingRequestId: billingRequestId,
                fiscalCertificateId: certificate.id,
                fiscalIdempotencyKey: idempotencyKey,
                fiscalRequestHash: requestHash,
                currencyCode: snapshot.currencyCode,
                exchangeRate: new Prisma.Decimal(snapshot.exchangeRate),
                series: snapshot.issuer.series,
                folio,
                origin: InvoiceOrigin.NATIVE_CFDI,
                cfdiVersion: snapshot.cfdiVersion,
                cfdiType: CfdiDocumentType.INCOME,
                issuedAt: new Date(snapshot.issuedAt),
                issuerSnapshot: this.toJson(snapshot.issuer),
                receiverSnapshot: this.toJson(snapshot.receiver),
                ...(snapshot.globalInformation
                  ? {
                      globalInformationSnapshot: this.toJson(
                        snapshot.globalInformation,
                      ),
                    }
                  : {}),
                fiscalSnapshotHash: snapshot.snapshotHash,
                fiscalUseCode: snapshot.receiver.fiscalUseCode,
                exportCode: snapshot.exportCode,
                paymentFormCode: snapshot.paymentFormCode,
                paymentMethodCode: snapshot.paymentMethodCode,
                fiscalStatus: InvoiceFiscalStatus.READY,
                cancellationStatus: 'NOT_REQUESTED',
                subtotal: new Prisma.Decimal(snapshot.totals.subtotal),
                discount: new Prisma.Decimal(snapshot.totals.discount),
                tax: new Prisma.Decimal(snapshot.totals.tax),
                total: new Prisma.Decimal(snapshot.totals.total),
                createdByUserId: actor.id,
                ...(substitution
                  ? {
                      substitutionOfInvoiceId: substitution.originalInvoiceId,
                      fiscalRelationships: this.toJson(snapshot.relationships!),
                    }
                  : {}),
              },
              select: { id: true, version: true },
            });

            await tx.invoiceConcept.createMany({
              data: snapshot.concepts.map((item) => ({
                invoiceId: invoice.id,
                lineNumber: item.lineNumber,
                sourceSaleItemId: item.sourceSaleItemId,
                productServiceCode: item.productServiceCode,
                identificationNumber: item.identificationNumber,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unitCode: item.unitCode,
                unitValue: new Prisma.Decimal(item.unitValue),
                amount: new Prisma.Decimal(item.amount),
                discount: new Prisma.Decimal(item.discount),
                taxObjectCode: item.taxObjectCode,
                taxCode: item.taxCode,
                factorType: item.factorType,
                rateOrQuota: new Prisma.Decimal(item.rateOrQuota),
                taxBase: new Prisma.Decimal(item.taxableBase),
                taxAmount: new Prisma.Decimal(item.taxAmount),
                total: new Prisma.Decimal(item.total),
                taxesSnapshot: this.toJson({
                  taxCode: item.taxCode,
                  factorType: item.factorType,
                  rateOrQuota: item.rateOrQuota,
                  base: item.taxableBase,
                  amount: item.taxAmount,
                }),
                snapshotHash: item.snapshotHash,
              })),
            });

            const conceptsByRequestItem = new Map(
              snapshot.concepts.map((item) => [
                item.sourceBillingRequestItemId,
                item,
              ]),
            );
            for (const source of sourceDocuments) {
              const application = await tx.invoiceSaleDocument.create({
                data: {
                  invoiceId: invoice.id,
                  saleDocumentId: source.saleDocumentId,
                  billingRequestSaleDocumentId: source.id,
                  subtotalApplied: source.requestedSubtotal,
                  taxApplied: source.requestedTax,
                  totalApplied: source.requestedTotal,
                  createdByUserId: actor.id,
                },
                select: { id: true },
              });
              await tx.invoiceSaleItemApplication.createMany({
                data: source.requestedItems.map((item) => {
                  const fiscalConcept = conceptsByRequestItem.get(item.id);
                  if (!fiscalConcept)
                    throw new UnprocessableEntityException('TOTAL_MISMATCH');
                  return {
                    invoiceSaleDocumentId: application.id,
                    saleItemId: item.saleItemId,
                    subtotalApplied: new Prisma.Decimal(
                      fiscalConcept.taxableBase,
                    ),
                    taxApplied: new Prisma.Decimal(fiscalConcept.taxAmount),
                    totalApplied: new Prisma.Decimal(fiscalConcept.total),
                    createdByUserId: actor.id,
                  };
                }),
              });
            }

            const attempt = await tx.fiscalOperationAttempt.create({
              data: {
                invoiceId: invoice.id,
                operation: FiscalOperationType.STAMP,
                status: FiscalOperationStatus.PENDING,
                attemptNumber: 1,
                correlationId: randomUUID(),
                idempotencyKey,
                requestHash,
                providerKey,
              },
              select: { id: true, correlationId: true },
            });
            await tx.fiscalOperationAttempt.update({
              where: { id: attempt.id },
              data: { status: FiscalOperationStatus.PROCESSING },
            });
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                fiscalStatus: InvoiceFiscalStatus.STAMPING,
                fiscalAttemptCount: 1,
                lastFiscalAttemptAt: issuedAt,
              },
            });
            await tx.billingRequest.update({
              where: { id: billingRequestId, version: dto.expectedVersion },
              data: { version: { increment: 1 } },
            });
            await tx.billingAuditLog.createMany({
              data: [
                {
                  actorUserId: actor.id,
                  action: 'CFDI_ISSUANCE_RESERVED',
                  entityType: 'Invoice',
                  entityId: invoice.id,
                  correlationId: attempt.correlationId,
                  after: this.toJson({
                    billingRequestId,
                    attemptId: attempt.id,
                    fiscalStatus: 'STAMPING',
                    series: snapshot.issuer.series,
                    folio,
                    snapshotHash: snapshot.snapshotHash,
                  }),
                },
              ],
            });

            return {
              replayed: false,
              billingRequestId,
              invoiceId: invoice.id,
              attemptId: attempt.id,
              correlationId: attempt.correlationId,
              idempotencyKey,
              actorUserId: actor.id,
              series: snapshot.issuer.series,
              folio,
              version: invoice.version,
              fiscalStatus: InvoiceFiscalStatus.STAMPING,
              operationStatus: FiscalOperationStatus.PROCESSING,
              snapshot,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (error instanceof CfdiDomainError) {
        if (error.code === 'CFDI_USE_REGIME_INCOMPATIBLE') {
          throw new UnprocessableEntityException({
            code: error.code,
            message:
              'The selected CFDI use is incompatible with the receiver fiscal regime and person type',
            fields: ['fiscalRegime', 'fiscalUseCode'],
            cfdiUse: error.details?.cfdiUse,
            fiscalRegime: error.details?.fiscalRegime,
            receiverPersonType: error.details?.receiverPersonType,
          });
        }
        throw new UnprocessableEntityException(error.code);
      }
      throw error;
    }
  }

  async finalizeStamped(
    prepared: PreparedCfdiIssuance,
    response: FiscalStampResponse,
  ): Promise<CfdiIssuanceResult> {
    if (
      !prepared.snapshot ||
      response.correlationId !== prepared.correlationId ||
      response.uuid !== response.tfd.uuid ||
      response.stampedAt !== response.tfd.stampedAt
    ) {
      throw new Error('FISCAL_PROVIDER_RESPONSE_INVALID');
    }
    const completedAt = new Date();
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          provider: response.provider,
          providerDocumentId: response.providerDocumentId,
          uuid: response.uuid,
          stampedAt: response.stampedAt,
        }),
      )
      .digest('hex');

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${prepared.attemptId} FOR UPDATE`;
          await tx.invoice.update({
            where: { id: prepared.invoiceId },
            data: {
              uuid: response.uuid,
              stampedAt: new Date(response.stampedAt),
              tfdVersion: '1.1',
              certificateNumber:
                prepared.snapshot!.issuer.certificateSerialNumber,
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
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: FiscalOperationStatus.SUCCEEDED,
              providerReference: response.providerDocumentId,
              completedAt,
              responseDigest: digest,
              errorCode: null,
              errorMessage: null,
            },
          });
          await tx.fiscalArtifact.createMany({
            data: [
              {
                invoiceId: prepared.invoiceId,
                operationAttemptId: prepared.attemptId,
                type: 'XML',
                status: 'PENDING',
                storageKey: `fiscal/${prepared.invoiceId}/xml/v1.xml`,
                mimeType: 'application/xml',
                metadata: this.toJson({
                  providerDocumentId: response.xmlReference.providerDocumentId,
                }),
              },
              {
                invoiceId: prepared.invoiceId,
                operationAttemptId: prepared.attemptId,
                type: 'PDF',
                status: 'PENDING',
                storageKey: `fiscal/${prepared.invoiceId}/pdf/v1.pdf`,
                mimeType: 'application/pdf',
                metadata: this.toJson({
                  providerDocumentId: response.pdfReference.providerDocumentId,
                }),
              },
            ],
          });
          await tx.billingAuditLog.createMany({
            data: [
              {
                actorUserId: prepared.actorUserId,
                action: 'CFDI_STAMPED',
                entityType: 'Invoice',
                entityId: prepared.invoiceId,
                correlationId: prepared.correlationId,
                after: this.toJson({
                  attemptId: prepared.attemptId,
                  uuid: response.uuid,
                  provider: response.provider,
                }),
              },
            ],
          });
          return this.result(prepared, 'STAMPED', 'SUCCEEDED', response.uuid);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async finalizeFailure(
    prepared: PreparedCfdiIssuance,
    outcome: FiscalIssuanceFailureOutcome,
    failure: FiscalIssuanceFailure,
  ): Promise<CfdiIssuanceResult> {
    const unknown = outcome === 'UNKNOWN';
    const completedAt = new Date();
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${prepared.attemptId} FOR UPDATE`;
          if (!unknown) {
            await tx.invoiceSaleItemApplication.updateMany({
              where: {
                invoiceSaleDocument: { invoiceId: prepared.invoiceId },
                reversedAt: null,
              },
              data: {
                reversedAt: completedAt,
                reversedByUserId: prepared.actorUserId,
                reversalReason: failure.code,
              },
            });
            await tx.invoiceSaleDocument.updateMany({
              where: { invoiceId: prepared.invoiceId, reversedAt: null },
              data: {
                reversedAt: completedAt,
                reversedByUserId: prepared.actorUserId,
                reversalReason: failure.code,
              },
            });
          }
          await tx.invoice.update({
            where: { id: prepared.invoiceId },
            data: {
              fiscalStatus: unknown
                ? InvoiceFiscalStatus.UNKNOWN
                : InvoiceFiscalStatus.FAILED,
              lastFiscalErrorCode: failure.code,
              lastFiscalErrorMessage: failure.code,
              version: { increment: 1 },
              ...(prepared.snapshot?.relationships?.length
                ? {
                    substitutionOfInvoiceId: null,
                  }
                : {}),
            },
          });
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: unknown
                ? FiscalOperationStatus.UNKNOWN
                : FiscalOperationStatus.TERMINAL_FAILURE,
              httpStatus: failure.statusCode,
              completedAt,
              errorCode: failure.code,
              errorMessage: failure.code,
            },
          });
          await tx.billingAuditLog.createMany({
            data: [
              {
                actorUserId: prepared.actorUserId,
                action: unknown ? 'CFDI_STAMP_UNKNOWN' : 'CFDI_STAMP_FAILED',
                entityType: 'Invoice',
                entityId: prepared.invoiceId,
                correlationId: prepared.correlationId,
                after: this.toJson({
                  attemptId: prepared.attemptId,
                  errorCode: failure.code,
                }),
              },
            ],
          });
          return this.result(
            prepared,
            unknown ? 'UNKNOWN' : 'FAILED',
            unknown ? 'UNKNOWN' : 'TERMINAL_FAILURE',
            null,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async markPersistenceUnknown(
    prepared: PreparedCfdiIssuance,
    code: 'STAMP_RESULT_PERSISTENCE_FAILED',
  ): Promise<CfdiIssuanceResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${prepared.attemptId} FOR UPDATE`;
          const [invoice, attempt] = await Promise.all([
            tx.invoice.findUnique({
              where: { id: prepared.invoiceId },
              select: { fiscalStatus: true, uuid: true },
            }),
            tx.fiscalOperationAttempt.findUnique({
              where: { id: prepared.attemptId },
              select: { status: true },
            }),
          ]);
          if (!invoice || !attempt)
            throw new NotFoundException('CFDI_OPERATION_NOT_FOUND');
          if (
            invoice.fiscalStatus === InvoiceFiscalStatus.STAMPED &&
            attempt.status === FiscalOperationStatus.SUCCEEDED
          ) {
            return this.result(prepared, 'STAMPED', 'SUCCEEDED', invoice.uuid);
          }
          if (
            invoice.fiscalStatus === InvoiceFiscalStatus.UNKNOWN &&
            attempt.status === FiscalOperationStatus.UNKNOWN
          ) {
            return this.result(prepared, 'UNKNOWN', 'UNKNOWN', invoice.uuid);
          }

          await tx.invoice.update({
            where: { id: prepared.invoiceId },
            data: {
              fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
              lastFiscalErrorCode: code,
              lastFiscalErrorMessage: code,
              version: { increment: 1 },
            },
          });
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: FiscalOperationStatus.UNKNOWN,
              completedAt: new Date(),
              errorCode: code,
              errorMessage: code,
            },
          });
          await tx.billingAuditLog.createMany({
            data: [
              {
                actorUserId: prepared.actorUserId,
                action: 'CFDI_STAMP_UNKNOWN',
                entityType: 'Invoice',
                entityId: prepared.invoiceId,
                correlationId: prepared.correlationId,
                after: this.toJson({
                  attemptId: prepared.attemptId,
                  errorCode: code,
                }),
              },
            ],
          });
          return this.result(prepared, 'UNKNOWN', 'UNKNOWN', null);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private toReplay(
    invoice: Prisma.InvoiceGetPayload<{ select: typeof existingInvoiceSelect }>,
    billingRequestId: string,
  ): PreparedCfdiIssuance {
    const attempt = invoice.fiscalOperationAttempts[0];
    if (!attempt) throw new ConflictException('CFDI_OPERATION_ALREADY_EXISTS');
    return {
      replayed: true,
      billingRequestId,
      invoiceId: invoice.id,
      attemptId: attempt.id,
      correlationId: attempt.correlationId,
      idempotencyKey: attempt.idempotencyKey,
      actorUserId: invoice.createdByUserId,
      series: invoice.series,
      folio: invoice.folio,
      version: invoice.version,
      fiscalStatus: invoice.fiscalStatus,
      operationStatus: attempt.status,
      uuid: invoice.uuid,
    };
  }

  private async resolveSubstitution(
    tx: Prisma.TransactionClient,
    billingRequestId: string,
    requestedOriginalId?: string,
  ): Promise<ResolvedCfdiSubstitution | null> {
    const originalId = requestedOriginalId?.trim();
    if (!originalId) return null;

    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${originalId} FOR UPDATE`;
    const original = await tx.invoice.findUnique({
      where: { id: originalId },
      select: {
        id: true,
        sourceBillingRequestId: true,
        legalEntityId: true,
        status: true,
        fiscalStatus: true,
        uuid: true,
        stampedAt: true,
        cancellationStatus: true,
        replacementInvoiceId: true,
        replacementUuid: true,
        substitutedByInvoiceId: true,
        nativeSubstitute: { select: { id: true } },
      },
    });

    if (!original || original.sourceBillingRequestId === billingRequestId) {
      throw new UnprocessableEntityException('INVALID_SUBSTITUTION_ORIGINAL');
    }
    if (
      original.status !== 'ACTIVE' ||
      original.fiscalStatus !== InvoiceFiscalStatus.STAMPED ||
      !original.uuid ||
      !UUID.test(original.uuid.trim())
    ) {
      throw new UnprocessableEntityException('INVALID_SUBSTITUTION_ORIGINAL');
    }
    if (
      original.cancellationStatus === 'PENDING' ||
      original.cancellationStatus === 'ACCEPTED' ||
      original.replacementInvoiceId ||
      original.replacementUuid ||
      original.substitutedByInvoiceId ||
      original.nativeSubstitute
    ) {
      throw new ConflictException('SUBSTITUTION_ALREADY_RESERVED');
    }

    return {
      originalInvoiceId: original.id,
      originalUuid: original.uuid.trim().toUpperCase(),
      originalLegalEntityId: original.legalEntityId,
    };
  }

  private validateSubstitutionSnapshot(
    snapshot: NonNullable<PreparedCfdiIssuance['snapshot']>,
    substitution: ResolvedCfdiSubstitution,
  ): void {
    const relationship = snapshot.relationships;
    if (snapshot.issuer.legalEntityId !== substitution.originalLegalEntityId)
      throw new UnprocessableEntityException(
        'SUBSTITUTION_LEGAL_ENTITY_MISMATCH',
      );
    if (
      !relationship ||
      relationship.length !== 1 ||
      relationship[0].typeCode !== '04' ||
      relationship[0].relatedInvoiceId !== substitution.originalInvoiceId ||
      relationship[0].relatedUuid !== substitution.originalUuid
    ) {
      throw new UnprocessableEntityException('INVALID_SUBSTITUTION_RELATION');
    }
  }

  private result(
    prepared: PreparedCfdiIssuance,
    fiscalStatus: string,
    operationStatus: string,
    uuid: string | null,
  ): CfdiIssuanceResult {
    return {
      billingRequestId: prepared.billingRequestId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      fiscalStatus,
      operationStatus,
      uuid,
      replayed: false,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034'
          ) ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException('CFDI_CONCURRENCY_CONFLICT');
  }
}
