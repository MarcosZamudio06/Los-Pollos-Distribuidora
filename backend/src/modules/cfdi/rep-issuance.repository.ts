import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CfdiDocumentType,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  InvoiceStatus,
  PaymentInvoiceApplicationStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import type { FiscalStampResponse } from './domain/fiscal-provider.port';
import {
  buildRepDocument,
  type RepCandidate,
  type RepFiscalPartySnapshot,
} from './domain/rep-document-builder';
import type { IssuePaymentCfdiDto } from './dto/issue-payment-cfdi.dto';
import type {
  PreparedRepIssuance,
  RepIssuanceFailure,
  RepIssuanceFailureOutcome,
  RepIssuanceResult,
} from './rep-issuance.types';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const invoiceSelect = {
  id: true,
  legalEntityId: true,
  fiscalIdempotencyKey: true,
  fiscalRequestHash: true,
  fiscalStatus: true,
  cancellationStatus: true,
  status: true,
  uuid: true,
  series: true,
  folio: true,
  origin: true,
  cfdiType: true,
  paymentMethodCode: true,
  currencyCode: true,
  total: true,
  issuerSnapshot: true,
  receiverSnapshot: true,
  fiscalSnapshotHash: true,
  fiscalUseCode: true,
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
  paymentReceipt: {
    select: {
      id: true,
      details: { select: { id: true, paymentId: true } },
    },
  },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

function requestHash(paymentId: string, dto: IssuePaymentCfdiDto): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        paymentId,
        expectedVersion: dto.expectedVersion,
        operation: 'ISSUE_PAYMENT_RECEIPT_2_0',
      }),
    )
    .digest('hex');
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CfdiDomainError('MISSING_FISCAL_PROFILE', { field: name });
  }
  return value.trim();
}

function issuerSnapshot(
  value: Prisma.JsonValue | null,
): RepFiscalPartySnapshot {
  const source = asObject(value);
  return {
    legalEntityId: stringField(source.legalEntityId, 'issuer.legalEntityId'),
    legalName: stringField(source.legalName, 'issuer.legalName'),
    taxId: stringField(source.taxId, 'issuer.taxId'),
    fiscalPostalCode: stringField(
      source.fiscalPostalCode,
      'issuer.fiscalPostalCode',
    ),
    fiscalRegime: stringField(source.fiscalRegime, 'issuer.fiscalRegime'),
    series: stringField(source.series, 'issuer.series'),
    certificateSerialNumber: stringField(
      source.certificateSerialNumber,
      'issuer.certificateSerialNumber',
    ),
    certificateFingerprint: stringField(
      source.certificateFingerprint,
      'issuer.certificateFingerprint',
    ),
  };
}

function receiverSnapshot(
  value: Prisma.JsonValue | null,
): RepFiscalPartySnapshot {
  const source = asObject(value);
  return {
    customerId: stringField(source.customerId, 'receiver.customerId'),
    fiscalName: stringField(source.fiscalName, 'receiver.fiscalName'),
    taxId: stringField(source.taxId, 'receiver.taxId'),
    fiscalPostalCode: stringField(
      source.fiscalPostalCode,
      'receiver.fiscalPostalCode',
    ),
    fiscalRegime: stringField(source.fiscalRegime, 'receiver.fiscalRegime'),
    series: '',
    certificateSerialNumber: '',
    certificateFingerprint: '',
    billingEmail:
      typeof source.billingEmail === 'string' ? source.billingEmail : '',
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class RepIssuanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    paymentId: string,
    dto: IssuePaymentCfdiDto,
    actor: Actor,
    idempotencyKey: string,
    providerKey: string,
  ): Promise<PreparedRepIssuance> {
    const payloadHash = requestHash(paymentId, dto);
    const issuedAt = new Date();
    try {
      return await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;

            const keyedInvoice = await tx.invoice.findUnique({
              where: { fiscalIdempotencyKey: idempotencyKey },
              select: invoiceSelect,
            });
            if (keyedInvoice) {
              if (keyedInvoice.fiscalRequestHash !== payloadHash) {
                throw new ConflictException('IDEMPOTENCY_CONFLICT');
              }
              const detail = keyedInvoice.paymentReceipt?.details.find(
                (item) => item.paymentId === paymentId,
              );
              if (!detail) throw new ConflictException('IDEMPOTENCY_CONFLICT');
              return this.toReplay(keyedInvoice, paymentId, detail.id);
            }

            const payment = await tx.payment.findUnique({
              where: { id: paymentId },
              select: {
                id: true,
                accountReceivableId: true,
                saleId: true,
                customerId: true,
                amount: true,
                currencyCode: true,
                exchangeRateToMxn: true,
                fiscalPaymentFormCode: true,
                paymentMethod: true,
                status: true,
                paidAt: true,
                version: true,
                paymentReceiptDetails: {
                  select: {
                    id: true,
                    paymentId: true,
                    paymentReceipt: { select: { invoiceId: true } },
                  },
                },
              },
            });
            if (!payment) throw new NotFoundException('PAYMENT_NOT_FOUND');
            if (payment.paymentReceiptDetails.length) {
              throw new ConflictException('REP_ALREADY_ISSUED');
            }
            if (payment.status !== PaymentStatus.APPLIED) {
              throw new BadRequestException('PAYMENT_NOT_APPLIED');
            }
            if (payment.version !== dto.expectedVersion) {
              throw new ConflictException('VERSION_CONFLICT');
            }
            if (!payment.fiscalPaymentFormCode) {
              throw new UnprocessableEntityException(
                'REP_PAYMENT_FORM_MISSING',
              );
            }
            if (!payment.saleId || !payment.accountReceivableId) {
              throw new UnprocessableEntityException(
                'REP_PAYMENT_APPLICATION_MISSING',
              );
            }
            const exchangeRate =
              payment.exchangeRateToMxn ??
              (payment.currencyCode === 'MXN' ? new Prisma.Decimal(1) : null);
            if (
              !exchangeRate ||
              !exchangeRate.greaterThan(new Prisma.Decimal(0))
            ) {
              throw new UnprocessableEntityException(
                'INVALID_PAYMENT_CONFIGURATION',
              );
            }

            const olderPayments = await tx.payment.findMany({
              where: {
                accountReceivableId: payment.accountReceivableId,
                status: PaymentStatus.APPLIED,
                id: { not: paymentId },
                OR: [
                  { paidAt: { lt: payment.paidAt } },
                  { paidAt: payment.paidAt, id: { lt: paymentId } },
                ],
              },
              select: {
                id: true,
                paymentReceiptDetails: { select: { id: true } },
              },
            });
            if (
              olderPayments.some(
                (older) => older.paymentReceiptDetails.length === 0,
              )
            ) {
              throw new UnprocessableEntityException(
                'REP_OUT_OF_ORDER_PAYMENT',
              );
            }

            const rows = await tx.invoiceSaleDocument.findMany({
              where: {
                saleDocument: { saleId: payment.saleId },
                reversedAt: null,
              },
              include: {
                saleDocument: { select: { id: true, saleId: true } },
                invoice: {
                  select: {
                    id: true,
                    legalEntityId: true,
                    fiscalStatus: true,
                    cancellationStatus: true,
                    status: true,
                    uuid: true,
                    issuedAt: true,
                    series: true,
                    folio: true,
                    origin: true,
                    cfdiType: true,
                    paymentMethodCode: true,
                    currencyCode: true,
                    total: true,
                    issuerSnapshot: true,
                    receiverSnapshot: true,
                    concepts: {
                      select: { taxObjectCode: true, taxesSnapshot: true },
                      orderBy: { lineNumber: 'asc' },
                    },
                    paymentInvoiceApplications: {
                      where: {
                        status: PaymentInvoiceApplicationStatus.EFFECTIVE,
                      },
                      select: {
                        amountPaid: true,
                        sourceSaleId: true,
                        partialityNumber: true,
                      },
                    },
                  },
                },
              },
            });
            if (!rows.length) {
              throw new UnprocessableEntityException(
                'REP_ORIGINAL_INVOICE_NOT_STAMPED',
              );
            }

            const invoiceIds = [
              ...new Set(rows.map((row) => row.invoice.id)),
            ].sort();
            await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(invoiceIds)}) ORDER BY "id" FOR UPDATE`;

            const grouped = new Map<string, RepCandidate>();
            for (const row of rows) {
              const invoice = row.invoice;
              if (
                invoice.origin !== InvoiceOrigin.NATIVE_CFDI ||
                invoice.cfdiType !== CfdiDocumentType.INCOME ||
                invoice.fiscalStatus !== InvoiceFiscalStatus.STAMPED ||
                invoice.status !== InvoiceStatus.ACTIVE ||
                !invoice.uuid
              ) {
                throw new UnprocessableEntityException(
                  'REP_ORIGINAL_INVOICE_NOT_STAMPED',
                );
              }
              if (invoice.paymentMethodCode !== 'PPD') {
                throw new UnprocessableEntityException(
                  'REP_ORIGINAL_INVOICE_NOT_PPD',
                );
              }
              if (invoice.currencyCode !== payment.currencyCode) {
                throw new UnprocessableEntityException('REP_CURRENCY_MISMATCH');
              }
              const issuer = issuerSnapshot(invoice.issuerSnapshot);
              const receiver = receiverSnapshot(invoice.receiverSnapshot);
              const existing = grouped.get(invoice.id);
              const applications = invoice.paymentInvoiceApplications;
              const effectiveAppliedTotal = applications.reduce(
                (sum, application) => sum.plus(application.amountPaid),
                new Prisma.Decimal(0),
              );
              const effectiveAppliedForSale = applications
                .filter(
                  (application) => application.sourceSaleId === payment.saleId,
                )
                .reduce(
                  (sum, application) => sum.plus(application.amountPaid),
                  new Prisma.Decimal(0),
                );
              const maxEffectivePartiality = applications.reduce(
                (max, application) =>
                  Math.max(max, application.partialityNumber),
                0,
              );
              const sourceDocument = {
                id: row.id,
                saleDocumentId: row.saleDocument.id,
                saleId: row.saleDocument.saleId,
                totalApplied: row.totalApplied,
              };
              const taxObjectCodes = new Set(
                invoice.concepts.map((concept) => concept.taxObjectCode),
              );
              const taxObjectCode = taxObjectCodes.has('02')
                ? '02'
                : ([...taxObjectCodes][0] ?? '01');
              const next: RepCandidate = existing
                ? {
                    ...existing,
                    sourceDocuments: [
                      ...existing.sourceDocuments,
                      sourceDocument,
                    ],
                  }
                : {
                    invoiceId: invoice.id,
                    uuid: invoice.uuid,
                    issuedAt: invoice.issuedAt,
                    series: invoice.series,
                    folio: invoice.folio,
                    currencyCode: invoice.currencyCode,
                    total: invoice.total,
                    effectiveAppliedTotal,
                    effectiveAppliedForSale,
                    maxEffectivePartiality,
                    taxObjectCode,
                    issuer,
                    receiver,
                    sourceDocuments: [sourceDocument],
                    taxesSnapshot: invoice.concepts
                      .map((concept) => concept.taxesSnapshot)
                      .filter((snapshot) => snapshot !== null),
                  };
              grouped.set(invoice.id, next);
            }

            const candidates = [...grouped.values()].sort((left, right) =>
              left.invoiceId.localeCompare(right.invoiceId),
            );
            const paymentReceiptId = randomUUID();
            const paymentReceiptDetailId = randomUUID();
            const built = buildRepDocument({
              paymentId,
              paymentReceiptId,
              issuedAt,
              paidAt: payment.paidAt,
              amount: payment.amount,
              currencyCode: payment.currencyCode,
              exchangeRateToMxn: exchangeRate,
              paymentFormCode: payment.fiscalPaymentFormCode,
              candidates,
            });

            const legalEntity = await tx.legalEntity.findUnique({
              where: { id: built.snapshot.issuer.legalEntityId },
              select: {
                isActive: true,
                cfdiEnabled: true,
                certificateSubject: true,
                certificateValidFrom: true,
                certificateValidTo: true,
              },
            });
            if (
              !legalEntity?.isActive ||
              !legalEntity.cfdiEnabled ||
              !legalEntity.certificateValidFrom ||
              !legalEntity.certificateValidTo
            ) {
              throw new UnprocessableEntityException('MISSING_FISCAL_PROFILE');
            }

            const certificate = await tx.fiscalCertificate.upsert({
              where: {
                legalEntityId_serialNumber: {
                  legalEntityId: built.snapshot.issuer.legalEntityId,
                  serialNumber: built.snapshot.issuer.certificateSerialNumber,
                },
              },
              update: {},
              create: {
                legalEntityId: built.snapshot.issuer.legalEntityId,
                serialNumber: built.snapshot.issuer.certificateSerialNumber,
                fingerprintSha256: built.snapshot.issuer.certificateFingerprint,
                subject: legalEntity.certificateSubject,
                validFrom: legalEntity.certificateValidFrom,
                validTo: legalEntity.certificateValidTo,
              },
              select: { id: true },
            });

            const sequence = await tx.fiscalFolioSequence.upsert({
              where: {
                legalEntityId_series: {
                  legalEntityId: built.snapshot.issuer.legalEntityId,
                  series: built.snapshot.issuer.series,
                },
              },
              update: { nextValue: { increment: 1 } },
              create: {
                legalEntityId: built.snapshot.issuer.legalEntityId,
                series: built.snapshot.issuer.series,
                nextValue: 2,
              },
              select: { nextValue: true },
            });
            const folio = (sequence.nextValue - 1n).toString();
            const invoice = await tx.invoice.create({
              data: {
                legalEntityId: built.snapshot.issuer.legalEntityId,
                fiscalCertificateId: certificate.id,
                fiscalIdempotencyKey: idempotencyKey,
                fiscalRequestHash: payloadHash,
                currencyCode: 'XXX',
                exchangeRate: new Prisma.Decimal(1),
                series: built.snapshot.issuer.series,
                folio,
                origin: InvoiceOrigin.NATIVE_CFDI,
                cfdiVersion: '4.0',
                cfdiType: CfdiDocumentType.PAYMENT_RECEIPT,
                issuedAt,
                issuerSnapshot: toJson(built.snapshot.issuer),
                receiverSnapshot: toJson(built.snapshot.receiver),
                fiscalSnapshotHash: built.snapshot.snapshotHash,
                fiscalUseCode: 'CP01',
                exportCode: '01',
                fiscalStatus: InvoiceFiscalStatus.READY,
                cancellationStatus: 'NOT_REQUESTED',
                subtotal: new Prisma.Decimal(0),
                discount: new Prisma.Decimal(0),
                tax: new Prisma.Decimal(0),
                total: new Prisma.Decimal(0),
                createdByUserId: actor.id,
              },
              select: { id: true, version: true },
            });

            await tx.invoiceConcept.create({
              data: {
                invoiceId: invoice.id,
                lineNumber: 1,
                productServiceCode: '84111506',
                description: 'Pago',
                quantity: new Prisma.Decimal(1),
                unitCode: 'ACT',
                unitValue: new Prisma.Decimal(0),
                amount: new Prisma.Decimal(0),
                discount: new Prisma.Decimal(0),
                taxObjectCode: '01',
                taxAmount: new Prisma.Decimal(0),
                total: new Prisma.Decimal(0),
                snapshotHash: createHash('sha256')
                  .update('CFDI-P-CONCEPT-01')
                  .digest('hex'),
              },
            });

            await tx.paymentReceipt.create({
              data: {
                id: paymentReceiptId,
                invoiceId: invoice.id,
                totalPaymentsMxn: built.totalPaymentsMxn,
                taxTotalsSnapshot: built.snapshot.payment.taxes
                  ? toJson(built.snapshot.payment.taxes)
                  : Prisma.JsonNull,
                snapshotHash: built.snapshotHash,
                createdByUserId: actor.id,
              },
            });
            await tx.paymentReceiptDetail.create({
              data: {
                id: paymentReceiptDetailId,
                paymentReceiptId,
                paymentId,
                paymentDate: payment.paidAt,
                paymentFormCode: payment.fiscalPaymentFormCode,
                currencyCode: payment.currencyCode,
                exchangeRateToMxn: exchangeRate,
                amount: payment.amount,
                sourcePaymentSnapshot: toJson({
                  id: payment.id,
                  amount: payment.amount.toString(),
                  currencyCode: payment.currencyCode,
                  paymentMethod: payment.paymentMethod,
                  paidAt: payment.paidAt.toISOString(),
                }),
                snapshotHash: createHash('sha256')
                  .update(`${built.snapshotHash}:${paymentId}`)
                  .digest('hex'),
              },
            });
            await tx.paymentInvoiceApplication.createMany({
              data: built.allocations.map((allocation) => ({
                paymentReceiptDetailId,
                paymentId,
                relatedInvoiceId: allocation.candidate.invoiceId,
                sourceAccountReceivableId: payment.accountReceivableId,
                sourceSaleId: payment.saleId,
                sourceSaleDocumentId: allocation.sourceDocumentIds[0] ?? null,
                relatedUuid: allocation.candidate.uuid,
                relatedSeries: allocation.candidate.series,
                relatedFolio: allocation.candidate.folio,
                documentCurrencyCode: allocation.candidate.currencyCode,
                equivalenceDr: new Prisma.Decimal(1),
                paymentMethodDr: 'PPD',
                partialityNumber: allocation.partialityNumber,
                previousBalanceAmount: allocation.previousBalanceAmount,
                amountPaid: allocation.amountPaid,
                remainingBalance: allocation.remainingBalance,
                taxObjectCode: allocation.candidate.taxObjectCode,
                taxesSnapshot: toJson(
                  allocation.taxesSnapshot.length > 0
                    ? allocation.taxesSnapshot
                    : null,
                ),
                sourceDocumentsSnapshot: toJson(
                  allocation.candidate.sourceDocuments,
                ),
                snapshotHash: createHash('sha256')
                  .update(
                    `${built.snapshotHash}:${allocation.candidate.invoiceId}:${allocation.amountPaid.toFixed(2)}`,
                  )
                  .digest('hex'),
                status: PaymentInvoiceApplicationStatus.RESERVED,
              })),
            });

            const attempt = await tx.fiscalOperationAttempt.create({
              data: {
                invoiceId: invoice.id,
                operation: FiscalOperationType.STAMP,
                status: FiscalOperationStatus.PROCESSING,
                attemptNumber: 1,
                correlationId: randomUUID(),
                idempotencyKey,
                requestHash: payloadHash,
                providerKey,
              },
              select: { id: true, correlationId: true },
            });
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                fiscalStatus: InvoiceFiscalStatus.STAMPING,
                fiscalAttemptCount: 1,
                lastFiscalAttemptAt: new Date(),
              },
            });
            await tx.billingAuditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'REP_ISSUANCE_RESERVED',
                entityType: 'Invoice',
                entityId: invoice.id,
                correlationId: attempt.correlationId,
                after: toJson({
                  paymentId,
                  paymentReceiptId,
                  paymentReceiptDetailId,
                  attemptId: attempt.id,
                  snapshotHash: built.snapshotHash,
                  fiscalStatus: 'STAMPING',
                }),
              },
            });
            return {
              replayed: false,
              paymentId,
              invoiceId: invoice.id,
              paymentReceiptId,
              paymentReceiptDetailId,
              attemptId: attempt.id,
              correlationId: attempt.correlationId,
              idempotencyKey,
              actorUserId: actor.id,
              series: built.snapshot.issuer.series,
              folio,
              fiscalStatus: InvoiceFiscalStatus.STAMPING,
              operationStatus: FiscalOperationStatus.PROCESSING,
              snapshot: { ...built.snapshot, paymentReceiptId },
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (error instanceof CfdiDomainError) {
        throw new UnprocessableEntityException(error.code);
      }
      throw error;
    }
  }

  async finalizeStamped(
    prepared: PreparedRepIssuance,
    response: FiscalStampResponse,
  ): Promise<RepIssuanceResult> {
    if (
      !prepared.snapshot ||
      response.correlationId !== prepared.correlationId ||
      response.uuid !== response.tfd.uuid ||
      response.stampedAt !== response.tfd.stampedAt
    ) {
      throw new Error('FISCAL_PROVIDER_RESPONSE_INVALID');
    }
    const snapshot = prepared.snapshot;
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
              certificateNumber: snapshot.issuer.certificateSerialNumber,
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
              completedAt: new Date(),
              responseDigest: createHash('sha256')
                .update(
                  `${response.provider}:${response.providerDocumentId}:${response.uuid}`,
                )
                .digest('hex'),
              errorCode: null,
              errorMessage: null,
            },
          });
          await tx.paymentInvoiceApplication.updateMany({
            where: {
              paymentReceiptDetailId: prepared.paymentReceiptDetailId,
              status: PaymentInvoiceApplicationStatus.RESERVED,
            },
            data: { status: PaymentInvoiceApplicationStatus.EFFECTIVE },
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
                metadata: toJson({
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
                metadata: toJson({
                  providerDocumentId: response.pdfReference.providerDocumentId,
                }),
              },
            ],
          });
          await tx.billingAuditLog.create({
            data: {
              actorUserId: prepared.actorUserId,
              action: 'REP_STAMPED',
              entityType: 'Invoice',
              entityId: prepared.invoiceId,
              correlationId: prepared.correlationId,
              after: toJson({
                paymentId: prepared.paymentId,
                uuid: response.uuid,
              }),
            },
          });
          return this.result(prepared, 'STAMPED', 'SUCCEEDED', response.uuid);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async finalizeFailure(
    prepared: PreparedRepIssuance,
    outcome: RepIssuanceFailureOutcome,
    failure: RepIssuanceFailure,
  ): Promise<RepIssuanceResult> {
    const unknown = outcome === 'UNKNOWN';
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "FiscalOperationAttempt" WHERE "id" = ${prepared.attemptId} FOR UPDATE`;
          await tx.invoice.update({
            where: { id: prepared.invoiceId },
            data: {
              fiscalStatus: unknown
                ? InvoiceFiscalStatus.UNKNOWN
                : InvoiceFiscalStatus.FAILED,
              lastFiscalErrorCode: failure.code,
              lastFiscalErrorMessage: failure.code,
              version: { increment: 1 },
            },
          });
          await tx.paymentInvoiceApplication.updateMany({
            where: {
              paymentReceiptDetailId: prepared.paymentReceiptDetailId,
              status: PaymentInvoiceApplicationStatus.RESERVED,
            },
            data: {
              status: unknown
                ? PaymentInvoiceApplicationStatus.UNKNOWN
                : PaymentInvoiceApplicationStatus.RELEASED,
            },
          });
          await tx.fiscalOperationAttempt.update({
            where: { id: prepared.attemptId },
            data: {
              status: unknown
                ? FiscalOperationStatus.UNKNOWN
                : FiscalOperationStatus.TERMINAL_FAILURE,
              httpStatus: failure.statusCode,
              completedAt: new Date(),
              errorCode: failure.code,
              errorMessage: failure.code,
            },
          });
          await tx.billingAuditLog.create({
            data: {
              actorUserId: prepared.actorUserId,
              action: unknown ? 'REP_STAMP_UNKNOWN' : 'REP_STAMP_FAILED',
              entityType: 'Invoice',
              entityId: prepared.invoiceId,
              correlationId: prepared.correlationId,
              after: toJson({
                paymentId: prepared.paymentId,
                errorCode: failure.code,
              }),
            },
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
    prepared: PreparedRepIssuance,
  ): Promise<RepIssuanceResult> {
    return this.finalizeFailure(prepared, 'UNKNOWN', {
      code: 'REP_RESULT_PERSISTENCE_FAILED',
      statusCode: null,
    });
  }

  private toReplay(
    invoice: InvoiceRow,
    paymentId: string,
    detailId: string,
  ): PreparedRepIssuance {
    const attempt = invoice.fiscalOperationAttempts[0];
    const receipt = invoice.paymentReceipt;
    if (!attempt || !receipt) throw new ConflictException('REP_ALREADY_ISSUED');
    return {
      replayed: true,
      paymentId,
      invoiceId: invoice.id,
      paymentReceiptId: receipt.id,
      paymentReceiptDetailId: detailId,
      attemptId: attempt.id,
      correlationId: attempt.correlationId,
      idempotencyKey: attempt.idempotencyKey,
      actorUserId: '',
      series: invoice.series,
      folio: invoice.folio,
      fiscalStatus: invoice.fiscalStatus,
      operationStatus: attempt.status,
      uuid: invoice.uuid,
    };
  }

  private result(
    prepared: PreparedRepIssuance,
    fiscalStatus: string,
    operationStatus: string,
    uuid: string | null,
  ): RepIssuanceResult {
    return {
      paymentId: prepared.paymentId,
      invoiceId: prepared.invoiceId,
      paymentReceiptId: prepared.paymentReceiptId,
      paymentReceiptDetailId: prepared.paymentReceiptDetailId,
      attemptId: prepared.attemptId,
      fiscalStatus,
      operationStatus,
      uuid,
      replayed: false,
    };
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
    throw new ConflictException('REP_CONCURRENCY_CONFLICT');
  }
}
