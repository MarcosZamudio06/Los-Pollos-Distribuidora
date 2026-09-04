import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CfdiDocumentType,
  CreditAdjustmentStatus,
  FiscalCancellationStatus,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  CreditNoteIssuanceFailure,
  CreditNoteIssuanceFailureOutcome,
  CreditNoteIssuanceResult,
  PreparedCreditNoteIssuance,
} from './credit-adjustment.types';
import {
  buildCreditNoteDocument,
  type CreditNoteBuildInput,
  type CreditNoteOriginalConcept,
} from './domain/credit-note-document-builder';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import type { FiscalStampResponse } from './domain/fiscal-provider.port';
import type {
  CreateCreditAdjustmentDto,
  CreditAdjustmentVersionDto,
} from './dto/credit-adjustment.dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const reservingStatuses: CreditAdjustmentStatus[] = [
  CreditAdjustmentStatus.APPROVED,
  CreditAdjustmentStatus.ISSUING,
  CreditAdjustmentStatus.UNKNOWN,
  CreditAdjustmentStatus.ISSUED,
  CreditAdjustmentStatus.ISSUE_ERROR,
];

const sourceInvoiceSelect = {
  id: true,
  legalEntityId: true,
  currencyCode: true,
  exchangeRate: true,
  status: true,
  origin: true,
  cfdiType: true,
  fiscalStatus: true,
  cancellationStatus: true,
  uuid: true,
  issuerSnapshot: true,
  receiverSnapshot: true,
  concepts: {
    orderBy: { lineNumber: 'asc' as const },
    select: {
      id: true,
      sourceSaleItemId: true,
      productServiceCode: true,
      identificationNumber: true,
      description: true,
      quantity: true,
      unitCode: true,
      unitValue: true,
      amount: true,
      discount: true,
      taxObjectCode: true,
      taxCode: true,
      factorType: true,
      rateOrQuota: true,
      taxBase: true,
      taxAmount: true,
      total: true,
      taxesSnapshot: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

type SourceInvoice = Prisma.InvoiceGetPayload<{
  select: typeof sourceInvoiceSelect;
}>;

const adjustmentInclude = {
  applications: {
    orderBy: { originalInvoiceId: 'asc' as const },
    include: {
      originalInvoice: { select: sourceInvoiceSelect },
      lines: {
        orderBy: { originalInvoiceConceptId: 'asc' as const },
        include: { originalInvoiceConcept: true },
      },
    },
  },
  fiscalInvoice: {
    select: {
      id: true,
      fiscalStatus: true,
      uuid: true,
      series: true,
      folio: true,
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
    },
  },
} satisfies Prisma.CreditAdjustmentInclude;

type AdjustmentRecord = Prisma.CreditAdjustmentGetPayload<{
  include: typeof adjustmentInclude;
}>;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CfdiDomainError('MISSING_FISCAL_PROFILE', { field });
  }
  return value.trim();
}

function issuer(value: Prisma.JsonValue | null) {
  const source = asObject(value);
  return {
    legalEntityId: requiredText(source.legalEntityId, 'issuer.legalEntityId'),
    legalName: requiredText(source.legalName, 'issuer.legalName'),
    taxId: requiredText(source.taxId, 'issuer.taxId'),
    fiscalPostalCode: requiredText(
      source.fiscalPostalCode,
      'issuer.fiscalPostalCode',
    ),
    fiscalRegime: requiredText(source.fiscalRegime, 'issuer.fiscalRegime'),
    series: requiredText(source.series, 'issuer.series'),
    certificateSerialNumber: requiredText(
      source.certificateSerialNumber,
      'issuer.certificateSerialNumber',
    ),
    certificateFingerprint: requiredText(
      source.certificateFingerprint,
      'issuer.certificateFingerprint',
    ),
  };
}

function receiver(value: Prisma.JsonValue | null) {
  const source = asObject(value);
  return {
    customerId: requiredText(source.customerId, 'receiver.customerId'),
    fiscalName: requiredText(source.fiscalName, 'receiver.fiscalName'),
    taxId: requiredText(source.taxId, 'receiver.taxId'),
    fiscalPostalCode: requiredText(
      source.fiscalPostalCode,
      'receiver.fiscalPostalCode',
    ),
    fiscalRegime: requiredText(source.fiscalRegime, 'receiver.fiscalRegime'),
    billingEmail:
      typeof source.billingEmail === 'string' ? source.billingEmail : '',
  };
}

function conceptSnapshot(
  concept: SourceInvoice['concepts'][number],
): CreditNoteOriginalConcept {
  return {
    sourceSaleItemId: concept.sourceSaleItemId,
    productServiceCode: concept.productServiceCode,
    identificationNumber: concept.identificationNumber,
    description: concept.description,
    quantity: concept.quantity,
    unitCode: concept.unitCode,
    unitValue: concept.unitValue,
    amount: concept.amount,
    discount: concept.discount,
    taxableBase: concept.taxBase ?? concept.amount.minus(concept.discount),
    taxObjectCode: concept.taxObjectCode,
    taxCode: concept.taxCode,
    factorType: concept.factorType,
    rateOrQuota: concept.rateOrQuota,
    taxAmount: concept.taxAmount,
    total: concept.total,
    taxesSnapshot: concept.taxesSnapshot,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function sha(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function creationHash(dto: CreateCreditAdjustmentDto): string {
  return sha({
    sourceType: dto.sourceType,
    sourceReference: dto.sourceReference?.trim() || null,
    internalReason: dto.internalReason.trim(),
    paymentFormCode: dto.paymentFormCode.trim(),
    applications: dto.applications
      .map((application) => ({
        invoiceId: application.invoiceId,
        lines: application.lines
          .map((line) => ({
            invoiceConceptId: line.invoiceConceptId,
            creditTotal: new Prisma.Decimal(line.creditTotal).toFixed(2),
          }))
          .sort((left, right) =>
            left.invoiceConceptId.localeCompare(right.invoiceConceptId),
          ),
      }))
      .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId)),
  });
}

function issuanceHash(adjustmentId: string, expectedVersion: number): string {
  return sha({
    adjustmentId,
    expectedVersion,
    operation: 'ISSUE_CFDI_E',
  });
}

function assertEligible(invoice: SourceInvoice): void {
  if (
    invoice.origin !== InvoiceOrigin.NATIVE_CFDI ||
    invoice.cfdiType !== CfdiDocumentType.INCOME ||
    invoice.fiscalStatus !== InvoiceFiscalStatus.STAMPED ||
    !invoice.uuid
  ) {
    throw new CfdiDomainError('CREDIT_NOTE_ORIGINAL_INVOICE_NOT_STAMPED', {
      invoiceId: invoice.id,
    });
  }
  if (
    invoice.status !== InvoiceStatus.ACTIVE ||
    invoice.cancellationStatus !== FiscalCancellationStatus.NOT_REQUESTED
  ) {
    throw new CfdiDomainError('CREDIT_NOTE_ORIGINAL_INVOICE_CANCELLED', {
      invoiceId: invoice.id,
    });
  }
}

function assertSameParties(invoices: readonly SourceInvoice[]): void {
  const first = invoices[0];
  const firstIssuer = issuer(first.issuerSnapshot);
  const firstReceiver = receiver(first.receiverSnapshot);
  for (const invoice of invoices) {
    const currentIssuer = issuer(invoice.issuerSnapshot);
    const currentReceiver = receiver(invoice.receiverSnapshot);
    if (
      invoice.legalEntityId !== first.legalEntityId ||
      invoice.currencyCode !== first.currencyCode ||
      !(invoice.exchangeRate ?? new Prisma.Decimal(1)).equals(
        first.exchangeRate ?? new Prisma.Decimal(1),
      ) ||
      currentIssuer.taxId !== firstIssuer.taxId ||
      currentReceiver.customerId !== firstReceiver.customerId ||
      currentReceiver.taxId !== firstReceiver.taxId
    ) {
      throw new CfdiDomainError('CREDIT_NOTE_MIXED_PARTIES');
    }
  }
}

@Injectable()
export class CreditAdjustmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateCreditAdjustmentDto,
    actor: Actor,
    idempotencyKey: string,
  ) {
    if (dto.sourceType === 'APPROVED_RETURN' && !dto.sourceReference?.trim()) {
      throw new BadRequestException(
        'CREDIT_ADJUSTMENT_SOURCE_REFERENCE_REQUIRED',
      );
    }
    const requestHash = creationHash(dto);
    const invoiceIds = [
      ...new Set(dto.applications.map((item) => item.invoiceId)),
    ].sort();
    if (invoiceIds.length !== dto.applications.length) {
      throw new BadRequestException('CREDIT_NOTE_DUPLICATE_INVOICE');
    }
    try {
      const id = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const replay = await tx.creditAdjustment.findUnique({
              where: { creationIdempotencyKey: idempotencyKey },
              select: { id: true, creationRequestHash: true },
            });
            if (replay) {
              if (replay.creationRequestHash !== requestHash) {
                throw new ConflictException('IDEMPOTENCY_CONFLICT');
              }
              return replay.id;
            }
            await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(invoiceIds)}) ORDER BY "id" FOR UPDATE`;
            const invoices = await tx.invoice.findMany({
              where: { id: { in: invoiceIds } },
              select: sourceInvoiceSelect,
              orderBy: { id: 'asc' },
            });
            if (invoices.length !== invoiceIds.length) {
              throw new NotFoundException(
                'CREDIT_NOTE_ORIGINAL_INVOICE_NOT_FOUND',
              );
            }
            invoices.forEach(assertEligible);
            assertSameParties(invoices);
            const first = invoices[0];
            const relationshipTypeCode =
              dto.sourceType === 'APPROVED_RETURN' ? '03' : '01';
            const applications: CreditNoteBuildInput['applications'] =
              dto.applications.map((application) => {
                const invoice = invoices.find(
                  (item) => item.id === application.invoiceId,
                )!;
                const seen = new Set<string>();
                return {
                  originalInvoiceId: invoice.id,
                  originalUuid: invoice.uuid!,
                  relationshipTypeCode,
                  concepts: application.lines.map((line) => {
                    if (seen.has(line.invoiceConceptId)) {
                      throw new BadRequestException(
                        'CREDIT_NOTE_DUPLICATE_CONCEPT',
                      );
                    }
                    seen.add(line.invoiceConceptId);
                    const concept = invoice.concepts.find(
                      (item) => item.id === line.invoiceConceptId,
                    );
                    if (!concept) {
                      throw new CfdiDomainError(
                        'CREDIT_NOTE_CONCEPT_NOT_FOUND',
                      );
                    }
                    const lineId = randomUUID();
                    return {
                      creditAdjustmentLineId: lineId,
                      originalInvoiceConceptId: concept.id,
                      creditTotal: new Prisma.Decimal(line.creditTotal),
                      availableTotal: concept.total,
                      original: conceptSnapshot(concept),
                    };
                  }),
                };
              });
            const adjustmentId = randomUUID();
            const built = buildCreditNoteDocument({
              creditAdjustmentId: adjustmentId,
              creditAdjustmentVersion: 1,
              issuedAt: new Date(),
              sourceType: dto.sourceType,
              currencyCode: first.currencyCode,
              exchangeRate: first.exchangeRate ?? new Prisma.Decimal(1),
              paymentFormCode: dto.paymentFormCode,
              issuer: issuer(first.issuerSnapshot),
              receiver: receiver(first.receiverSnapshot),
              applications,
            });
            await tx.creditAdjustment.create({
              data: {
                id: adjustmentId,
                sourceType: dto.sourceType,
                sourceReference: dto.sourceReference?.trim() || null,
                internalReason: dto.internalReason.trim(),
                paymentFormCode: dto.paymentFormCode,
                relationshipTypeCode,
                legalEntityId: first.legalEntityId,
                customerId: built.snapshot.receiver.customerId,
                currencyCode: first.currencyCode,
                exchangeRate: first.exchangeRate ?? new Prisma.Decimal(1),
                subtotal: new Prisma.Decimal(built.snapshot.totals.subtotal),
                discount: new Prisma.Decimal(built.snapshot.totals.discount),
                tax: new Prisma.Decimal(built.snapshot.totals.tax),
                total: new Prisma.Decimal(built.snapshot.totals.total),
                creationIdempotencyKey: idempotencyKey,
                creationRequestHash: requestHash,
                createdByUserId: actor.id,
              },
            });
            for (const application of applications) {
              const applicationLines = built.lines.filter((line) =>
                application.concepts.some(
                  (concept) =>
                    concept.creditAdjustmentLineId ===
                    line.creditAdjustmentLineId,
                ),
              );
              const applicationId = randomUUID();
              const subtotal = applicationLines.reduce(
                (sum, line) => sum.plus(line.creditSubtotal),
                new Prisma.Decimal(0),
              );
              const discount = applicationLines.reduce(
                (sum, line) => sum.plus(line.creditDiscount),
                new Prisma.Decimal(0),
              );
              const tax = applicationLines.reduce(
                (sum, line) => sum.plus(line.creditTax),
                new Prisma.Decimal(0),
              );
              const total = applicationLines.reduce(
                (sum, line) => sum.plus(line.creditTotal),
                new Prisma.Decimal(0),
              );
              await tx.creditAdjustmentInvoice.create({
                data: {
                  id: applicationId,
                  creditAdjustmentId: adjustmentId,
                  originalInvoiceId: application.originalInvoiceId,
                  relatedUuid: application.originalUuid,
                  relationshipTypeCode,
                  subtotal,
                  discount,
                  tax,
                  total,
                  lines: {
                    create: applicationLines.map((line) => ({
                      id: line.creditAdjustmentLineId,
                      originalInvoiceConceptId: line.originalInvoiceConceptId,
                      requestedCreditTotal: line.requestedCreditTotal,
                      creditSubtotal: line.creditSubtotal,
                      creditDiscount: line.creditDiscount,
                      creditTaxableBase: line.creditTaxableBase,
                      creditTax: line.creditTax,
                      creditTotal: line.creditTotal,
                      originalConceptSnapshot: toJson(
                        application.concepts.find(
                          (item) =>
                            item.creditAdjustmentLineId ===
                            line.creditAdjustmentLineId,
                        )!.original,
                      ),
                      taxesSnapshot:
                        line.taxesSnapshot.length > 0
                          ? toJson(line.taxesSnapshot)
                          : Prisma.JsonNull,
                      snapshotHash: line.snapshot.snapshotHash,
                    })),
                  },
                },
              });
            }
            await tx.billingAuditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'CREDIT_ADJUSTMENT_CREATED',
                entityType: 'CreditAdjustment',
                entityId: adjustmentId,
                after: toJson({
                  status: 'DRAFT',
                  sourceType: dto.sourceType,
                  invoiceIds,
                  total: built.snapshot.totals.total,
                }),
              },
            });
            return adjustmentId;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      return this.findOne(id);
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  async findOne(id: string) {
    const adjustment = await this.prisma.creditAdjustment.findUnique({
      where: { id },
      include: adjustmentInclude,
    });
    if (!adjustment) throw new NotFoundException('CREDIT_ADJUSTMENT_NOT_FOUND');
    return adjustment;
  }

  async approve(id: string, dto: CreditAdjustmentVersionDto, actor: Actor) {
    try {
      await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "CreditAdjustment" WHERE "id" = ${id} FOR UPDATE`;
            const adjustment = await tx.creditAdjustment.findUnique({
              where: { id },
              include: adjustmentInclude,
            });
            if (!adjustment)
              throw new NotFoundException('CREDIT_ADJUSTMENT_NOT_FOUND');
            if (adjustment.version !== dto.expectedVersion) {
              throw new ConflictException('VERSION_CONFLICT');
            }
            if (adjustment.status !== CreditAdjustmentStatus.DRAFT) {
              throw new ConflictException('CREDIT_ADJUSTMENT_NOT_DRAFT');
            }
            const invoiceIds = adjustment.applications
              .map((item) => item.originalInvoiceId)
              .sort();
            await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(invoiceIds)}) ORDER BY "id" FOR UPDATE`;
            const currentInvoices = await tx.invoice.findMany({
              where: { id: { in: invoiceIds } },
              select: sourceInvoiceSelect,
              orderBy: { id: 'asc' },
            });
            if (currentInvoices.length !== invoiceIds.length) {
              throw new NotFoundException(
                'CREDIT_NOTE_ORIGINAL_INVOICE_NOT_FOUND',
              );
            }
            currentInvoices.forEach(assertEligible);
            assertSameParties(currentInvoices);
            const conceptIds = adjustment.applications
              .flatMap((application) =>
                application.lines.map((line) => line.originalInvoiceConceptId),
              )
              .sort();
            const reserved = await tx.creditAdjustmentLine.findMany({
              where: {
                originalInvoiceConceptId: { in: conceptIds },
                creditAdjustmentInvoice: {
                  creditAdjustment: {
                    id: { not: id },
                    status: { in: reservingStatuses },
                  },
                },
              },
              select: { originalInvoiceConceptId: true, creditTotal: true },
            });
            const reservedByConcept = new Map<string, Prisma.Decimal>();
            for (const row of reserved) {
              reservedByConcept.set(
                row.originalInvoiceConceptId,
                (
                  reservedByConcept.get(row.originalInvoiceConceptId) ??
                  new Prisma.Decimal(0)
                ).plus(row.creditTotal),
              );
            }
            const authorizedAt = new Date();
            const built = this.buildFromAdjustment(
              { ...adjustment, authorizedAt },
              adjustment.applications.map((application) => ({
                ...application,
                lines: application.lines.map((line) => ({
                  ...line,
                  availableTotal: line.originalInvoiceConcept.total.minus(
                    reservedByConcept.get(line.originalInvoiceConceptId) ??
                      new Prisma.Decimal(0),
                  ),
                })),
              })),
              dto.expectedVersion + 1,
            );
            for (const line of built.lines) {
              await tx.creditAdjustmentLine.update({
                where: { id: line.creditAdjustmentLineId },
                data: {
                  creditSubtotal: line.creditSubtotal,
                  creditDiscount: line.creditDiscount,
                  creditTaxableBase: line.creditTaxableBase,
                  creditTax: line.creditTax,
                  creditTotal: line.creditTotal,
                  taxesSnapshot:
                    line.taxesSnapshot.length > 0
                      ? toJson(line.taxesSnapshot)
                      : Prisma.JsonNull,
                  snapshotHash: line.snapshot.snapshotHash,
                },
              });
            }
            for (const application of adjustment.applications) {
              const applicationLines = built.lines.filter((line) =>
                application.lines.some(
                  (item) => item.id === line.creditAdjustmentLineId,
                ),
              );
              await tx.creditAdjustmentInvoice.update({
                where: { id: application.id },
                data: {
                  subtotal: applicationLines.reduce(
                    (sum, line) => sum.plus(line.creditSubtotal),
                    new Prisma.Decimal(0),
                  ),
                  discount: applicationLines.reduce(
                    (sum, line) => sum.plus(line.creditDiscount),
                    new Prisma.Decimal(0),
                  ),
                  tax: applicationLines.reduce(
                    (sum, line) => sum.plus(line.creditTax),
                    new Prisma.Decimal(0),
                  ),
                  total: applicationLines.reduce(
                    (sum, line) => sum.plus(line.creditTotal),
                    new Prisma.Decimal(0),
                  ),
                  snapshotHash: sha(
                    applicationLines.map((line) => line.snapshot.snapshotHash),
                  ),
                },
              });
            }
            await tx.creditAdjustment.update({
              where: { id },
              data: {
                status: CreditAdjustmentStatus.APPROVED,
                authorizedByUserId: actor.id,
                authorizedAt,
                subtotal: new Prisma.Decimal(built.snapshot.totals.subtotal),
                discount: new Prisma.Decimal(built.snapshot.totals.discount),
                tax: new Prisma.Decimal(built.snapshot.totals.tax),
                total: new Prisma.Decimal(built.snapshot.totals.total),
                snapshotHash: built.snapshotHash,
                version: { increment: 1 },
              },
            });
            await tx.billingAuditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'CREDIT_ADJUSTMENT_APPROVED',
                entityType: 'CreditAdjustment',
                entityId: id,
                after: toJson({
                  status: 'APPROVED',
                  total: built.snapshot.totals.total,
                  snapshotHash: built.snapshotHash,
                }),
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      return this.findOne(id);
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  async prepareIssuance(
    id: string,
    dto: CreditAdjustmentVersionDto,
    actor: Actor,
    idempotencyKey: string,
    providerKey: string,
  ): Promise<PreparedCreditNoteIssuance> {
    const requestHash = issuanceHash(id, dto.expectedVersion);
    try {
      return await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "CreditAdjustment" WHERE "id" = ${id} FOR UPDATE`;
            const keyed = await tx.invoice.findUnique({
              where: { fiscalIdempotencyKey: idempotencyKey },
              include: {
                fiscalOperationAttempts: {
                  where: { operation: FiscalOperationType.STAMP },
                  orderBy: { attemptNumber: 'desc' },
                  take: 1,
                },
                sourceCreditAdjustment: { select: { status: true } },
              },
            });
            if (keyed) {
              if (
                keyed.fiscalRequestHash !== requestHash ||
                keyed.sourceCreditAdjustmentId !== id
              ) {
                throw new ConflictException('IDEMPOTENCY_CONFLICT');
              }
              const attempt = keyed.fiscalOperationAttempts[0];
              if (!attempt)
                throw new ConflictException('CREDIT_NOTE_ALREADY_ISSUED');
              return {
                replayed: true,
                creditAdjustmentId: id,
                invoiceId: keyed.id,
                attemptId: attempt.id,
                correlationId: attempt.correlationId,
                idempotencyKey: attempt.idempotencyKey,
                actorUserId: '',
                series: keyed.series,
                folio: keyed.folio,
                fiscalStatus: keyed.fiscalStatus,
                operationStatus: attempt.status,
                adjustmentStatus:
                  keyed.sourceCreditAdjustment?.status ?? 'UNKNOWN',
                uuid: keyed.uuid,
              };
            }
            const adjustment = await tx.creditAdjustment.findUnique({
              where: { id },
              include: adjustmentInclude,
            });
            if (!adjustment)
              throw new NotFoundException('CREDIT_ADJUSTMENT_NOT_FOUND');
            if (adjustment.version !== dto.expectedVersion) {
              throw new ConflictException('VERSION_CONFLICT');
            }
            if (adjustment.status !== CreditAdjustmentStatus.APPROVED) {
              throw new UnprocessableEntityException(
                'CREDIT_ADJUSTMENT_NOT_APPROVED',
              );
            }
            if (adjustment.fiscalInvoice) {
              throw new ConflictException('CREDIT_NOTE_ALREADY_ISSUED');
            }
            const invoiceIds = adjustment.applications
              .map((item) => item.originalInvoiceId)
              .sort();
            await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(invoiceIds)}) ORDER BY "id" FOR UPDATE`;
            adjustment.applications.forEach((application) =>
              assertEligible(application.originalInvoice),
            );
            const built = this.buildFromAdjustment(
              adjustment,
              adjustment.applications.map((application) => ({
                ...application,
                lines: application.lines.map((line) => ({
                  ...line,
                  availableTotal: line.creditTotal,
                })),
              })),
              dto.expectedVersion,
            );
            if (built.snapshotHash !== adjustment.snapshotHash) {
              throw new ConflictException('CREDIT_NOTE_SNAPSHOT_CHANGED');
            }
            const legalEntity = await tx.legalEntity.findUnique({
              where: { id: adjustment.legalEntityId },
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
                  legalEntityId: adjustment.legalEntityId,
                  serialNumber: built.snapshot.issuer.certificateSerialNumber,
                },
              },
              update: {},
              create: {
                legalEntityId: adjustment.legalEntityId,
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
                  legalEntityId: adjustment.legalEntityId,
                  series: built.snapshot.issuer.series,
                },
              },
              update: { nextValue: { increment: 1 } },
              create: {
                legalEntityId: adjustment.legalEntityId,
                series: built.snapshot.issuer.series,
                nextValue: 2,
              },
              select: { nextValue: true },
            });
            const folio = (sequence.nextValue - 1n).toString();
            const invoice = await tx.invoice.create({
              data: {
                legalEntityId: adjustment.legalEntityId,
                sourceCreditAdjustmentId: id,
                fiscalCertificateId: certificate.id,
                fiscalIdempotencyKey: idempotencyKey,
                fiscalRequestHash: requestHash,
                currencyCode: adjustment.currencyCode,
                exchangeRate: adjustment.exchangeRate,
                series: built.snapshot.issuer.series,
                folio,
                origin: InvoiceOrigin.NATIVE_CFDI,
                cfdiVersion: '4.0',
                cfdiType: CfdiDocumentType.EXPENSE,
                issuedAt: new Date(built.snapshot.issuedAt),
                issuerSnapshot: toJson(built.snapshot.issuer),
                receiverSnapshot: toJson(built.snapshot.receiver),
                fiscalSnapshotHash: built.snapshotHash,
                fiscalUseCode: 'G02',
                exportCode: '01',
                paymentFormCode: adjustment.paymentFormCode,
                paymentMethodCode: 'PUE',
                fiscalStatus: InvoiceFiscalStatus.READY,
                cancellationStatus: FiscalCancellationStatus.NOT_REQUESTED,
                subtotal: new Prisma.Decimal(built.snapshot.totals.subtotal),
                discount: new Prisma.Decimal(built.snapshot.totals.discount),
                tax: new Prisma.Decimal(built.snapshot.totals.tax),
                total: new Prisma.Decimal(built.snapshot.totals.total),
                createdByUserId: actor.id,
              },
              select: { id: true },
            });
            await tx.invoiceConcept.createMany({
              data: built.snapshot.concepts.map((concept) => ({
                invoiceId: invoice.id,
                lineNumber: concept.lineNumber,
                sourceSaleItemId: concept.sourceSaleItemId || null,
                productServiceCode: concept.productServiceCode,
                identificationNumber: concept.identificationNumber,
                description: concept.description,
                quantity: new Prisma.Decimal(concept.quantity),
                unitCode: concept.unitCode,
                unitValue: new Prisma.Decimal(concept.unitValue),
                amount: new Prisma.Decimal(concept.amount),
                discount: new Prisma.Decimal(concept.discount),
                taxObjectCode: concept.taxObjectCode,
                taxCode: concept.taxCode || null,
                factorType: concept.factorType || null,
                rateOrQuota: new Prisma.Decimal(concept.rateOrQuota),
                taxBase: new Prisma.Decimal(concept.taxableBase),
                taxAmount: new Prisma.Decimal(concept.taxAmount),
                total: new Prisma.Decimal(concept.total),
                taxesSnapshot: toJson(
                  built.lines.find(
                    (line) =>
                      line.snapshot.snapshotHash === concept.snapshotHash,
                  )?.taxesSnapshot ?? null,
                ),
                snapshotHash: concept.snapshotHash,
              })),
            });
            const correlationId = randomUUID();
            const attempt = await tx.fiscalOperationAttempt.create({
              data: {
                invoiceId: invoice.id,
                operation: FiscalOperationType.STAMP,
                status: FiscalOperationStatus.PROCESSING,
                attemptNumber: 1,
                correlationId,
                idempotencyKey,
                requestHash,
                providerKey,
              },
              select: { id: true },
            });
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                fiscalStatus: InvoiceFiscalStatus.STAMPING,
                fiscalAttemptCount: 1,
                lastFiscalAttemptAt: new Date(),
              },
            });
            await tx.creditAdjustment.update({
              where: { id, version: dto.expectedVersion },
              data: {
                status: CreditAdjustmentStatus.ISSUING,
                version: { increment: 1 },
              },
            });
            await tx.billingAuditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'CREDIT_NOTE_ISSUANCE_RESERVED',
                entityType: 'CreditAdjustment',
                entityId: id,
                correlationId,
                after: toJson({
                  invoiceId: invoice.id,
                  attemptId: attempt.id,
                  status: 'ISSUING',
                  snapshotHash: built.snapshotHash,
                }),
              },
            });
            return {
              replayed: false,
              creditAdjustmentId: id,
              invoiceId: invoice.id,
              attemptId: attempt.id,
              correlationId,
              idempotencyKey,
              actorUserId: actor.id,
              series: built.snapshot.issuer.series,
              folio,
              fiscalStatus: InvoiceFiscalStatus.STAMPING,
              operationStatus: FiscalOperationStatus.PROCESSING,
              adjustmentStatus: CreditAdjustmentStatus.ISSUING,
              snapshot: built.snapshot,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  async finalizeStamped(
    prepared: PreparedCreditNoteIssuance,
    response: FiscalStampResponse,
  ): Promise<CreditNoteIssuanceResult> {
    if (
      !prepared.snapshot ||
      response.correlationId !== prepared.correlationId ||
      response.uuid !== response.tfd.uuid ||
      response.stampedAt !== response.tfd.stampedAt
    ) {
      throw new Error('FISCAL_PROVIDER_RESPONSE_INVALID');
    }
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
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
              completedAt: new Date(),
              responseDigest: sha({
                provider: response.provider,
                providerDocumentId: response.providerDocumentId,
                uuid: response.uuid,
              }),
              errorCode: null,
              errorMessage: null,
            },
          });
          await tx.creditAdjustment.update({
            where: { id: prepared.creditAdjustmentId },
            data: {
              status: CreditAdjustmentStatus.ISSUED,
              version: { increment: 1 },
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
              action: 'CREDIT_NOTE_STAMPED',
              entityType: 'CreditAdjustment',
              entityId: prepared.creditAdjustmentId,
              correlationId: prepared.correlationId,
              after: toJson({
                invoiceId: prepared.invoiceId,
                uuid: response.uuid,
              }),
            },
          });
          return this.result(
            prepared,
            'STAMPED',
            'SUCCEEDED',
            'ISSUED',
            response.uuid,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async finalizeFailure(
    prepared: PreparedCreditNoteIssuance,
    outcome: CreditNoteIssuanceFailureOutcome,
    failure: CreditNoteIssuanceFailure,
  ): Promise<CreditNoteIssuanceResult> {
    const unknown = outcome === 'UNKNOWN';
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${prepared.invoiceId} FOR UPDATE`;
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
          const adjustmentStatus = unknown
            ? CreditAdjustmentStatus.UNKNOWN
            : CreditAdjustmentStatus.ISSUE_ERROR;
          await tx.creditAdjustment.update({
            where: { id: prepared.creditAdjustmentId },
            data: { status: adjustmentStatus, version: { increment: 1 } },
          });
          await tx.billingAuditLog.create({
            data: {
              actorUserId: prepared.actorUserId,
              action: unknown
                ? 'CREDIT_NOTE_STAMP_UNKNOWN'
                : 'CREDIT_NOTE_STAMP_FAILED',
              entityType: 'CreditAdjustment',
              entityId: prepared.creditAdjustmentId,
              correlationId: prepared.correlationId,
              after: toJson({
                invoiceId: prepared.invoiceId,
                errorCode: failure.code,
              }),
            },
          });
          return this.result(
            prepared,
            unknown ? 'UNKNOWN' : 'FAILED',
            unknown ? 'UNKNOWN' : 'TERMINAL_FAILURE',
            adjustmentStatus,
            null,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  markPersistenceUnknown(prepared: PreparedCreditNoteIssuance) {
    return this.finalizeFailure(prepared, 'UNKNOWN', {
      code: 'CREDIT_NOTE_RESULT_PERSISTENCE_FAILED',
      statusCode: null,
    });
  }

  private buildFromAdjustment(
    adjustment: AdjustmentRecord,
    applications: Array<
      Omit<AdjustmentRecord['applications'][number], 'lines'> & {
        lines: Array<
          AdjustmentRecord['applications'][number]['lines'][number] & {
            availableTotal: Prisma.Decimal;
          }
        >;
      }
    >,
    version: number,
  ) {
    return buildCreditNoteDocument({
      creditAdjustmentId: adjustment.id,
      creditAdjustmentVersion: version,
      issuedAt: adjustment.authorizedAt ?? new Date(),
      sourceType: adjustment.sourceType,
      currencyCode: adjustment.currencyCode,
      exchangeRate: adjustment.exchangeRate,
      paymentFormCode: adjustment.paymentFormCode,
      issuer: issuer(applications[0].originalInvoice.issuerSnapshot),
      receiver: receiver(applications[0].originalInvoice.receiverSnapshot),
      applications: applications.map((application) => ({
        originalInvoiceId: application.originalInvoiceId,
        originalUuid: application.relatedUuid,
        relationshipTypeCode: application.relationshipTypeCode as '01' | '03',
        concepts: application.lines.map((line) => ({
          creditAdjustmentLineId: line.id,
          originalInvoiceConceptId: line.originalInvoiceConceptId,
          creditTotal: line.requestedCreditTotal,
          availableTotal: line.availableTotal,
          original: conceptSnapshot(line.originalInvoiceConcept),
        })),
      })),
    });
  }

  private result(
    prepared: PreparedCreditNoteIssuance,
    fiscalStatus: string,
    operationStatus: string,
    adjustmentStatus: string,
    uuid: string | null,
  ): CreditNoteIssuanceResult {
    return {
      creditAdjustmentId: prepared.creditAdjustmentId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      fiscalStatus,
      operationStatus,
      adjustmentStatus,
      uuid,
      replayed: false,
    };
  }

  private rethrowDomain(error: unknown): never {
    if (error instanceof CfdiDomainError) {
      throw new UnprocessableEntityException(error.code);
    }
    throw error;
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
    throw new ConflictException('CREDIT_NOTE_CONCURRENCY_CONFLICT');
  }
}
