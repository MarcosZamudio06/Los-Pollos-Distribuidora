import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceOrigin, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { buildCivilDateRangeFilter } from '../../common/utils/civil-date-range';
import type { ListFiscalInvoicesQueryDto } from './dto/fiscal-invoice-query.dto';

type ReadActor = Pick<AuthenticatedUser, 'id' | 'role'>;

const ARTIFACT_SELECT = {
  id: true,
  type: true,
  status: true,
  version: true,
  mimeType: true,
  byteSize: true,
  sha256: true,
  lastErrorCode: true,
  createdAt: true,
  storedAt: true,
} satisfies Prisma.FiscalArtifactSelect;

const DOCUMENT_SELECT = {
  id: true,
  saleDocumentId: true,
  billingRequestSaleDocumentId: true,
  subtotalApplied: true,
  taxApplied: true,
  totalApplied: true,
  reversedAt: true,
  reversalReason: true,
  saleDocument: {
    select: {
      id: true,
      saleId: true,
      documentType: true,
      physicalFolio: true,
      status: true,
      operationalLocationId: true,
      operationalLocation: {
        select: { id: true, name: true, code: true },
      },
      sale: {
        select: { id: true, saleNumber: true, locationId: true },
      },
    },
  },
  itemApplications: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      saleItemId: true,
      subtotalApplied: true,
      taxApplied: true,
      totalApplied: true,
      reversedAt: true,
      reversalReason: true,
    },
  },
} satisfies Prisma.InvoiceSaleDocumentSelect;

const LIST_SELECT = {
  id: true,
  sourceBillingRequestId: true,
  legalEntityId: true,
  currencyCode: true,
  exchangeRate: true,
  series: true,
  folio: true,
  uuid: true,
  origin: true,
  cfdiVersion: true,
  cfdiType: true,
  issuedAt: true,
  stampedAt: true,
  fiscalStatus: true,
  cancellationStatus: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  status: true,
  cancelledAt: true,
  cancellationReason: true,
  cancellationMotiveCode: true,
  internalReason: true,
  replacementInvoiceId: true,
  replacementUuid: true,
  substitutionUuid: true,
  substitutedByInvoiceId: true,
  issuerSnapshot: true,
  receiverSnapshot: true,
  globalInformationSnapshot: true,
  createdAt: true,
  updatedAt: true,
  fiscalArtifacts: {
    orderBy: { type: 'asc' as const },
    select: ARTIFACT_SELECT,
  },
  documents: {
    orderBy: { createdAt: 'asc' as const },
    select: DOCUMENT_SELECT,
  },
} satisfies Prisma.InvoiceSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  fiscalUseCode: true,
  exportCode: true,
  paymentFormCode: true,
  paymentMethodCode: true,
  certificateNumber: true,
  satCertificateNumber: true,
  certificationProviderTaxId: true,
  cfdiSeal: true,
  satSeal: true,
  fiscalSnapshotHash: true,
  fiscalAttemptCount: true,
  lastFiscalAttemptAt: true,
  lastFiscalErrorCode: true,
  lastFiscalErrorMessage: true,
  version: true,
  concepts: {
    orderBy: { lineNumber: 'asc' as const },
    select: {
      id: true,
      lineNumber: true,
      sourceSaleItemId: true,
      productServiceCode: true,
      identificationNumber: true,
      description: true,
      quantity: true,
      unitCode: true,
      unitName: true,
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
      snapshotHash: true,
      createdAt: true,
    },
  },
  fiscalOperationAttempts: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    select: {
      id: true,
      operation: true,
      status: true,
      attemptNumber: true,
      correlationId: true,
      startedAt: true,
      completedAt: true,
      nextRetryAt: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const STATUS_SELECT = {
  id: true,
  uuid: true,
  origin: true,
  series: true,
  folio: true,
  fiscalStatus: true,
  cancellationStatus: true,
  status: true,
  issuedAt: true,
  stampedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  cancellationMotiveCode: true,
  internalReason: true,
  replacementInvoiceId: true,
  replacementUuid: true,
  substitutionUuid: true,
  substitutedByInvoiceId: true,
  fiscalAttemptCount: true,
  lastFiscalAttemptAt: true,
  lastFiscalErrorCode: true,
  lastFiscalErrorMessage: true,
  fiscalArtifacts: {
    orderBy: { type: 'asc' as const },
    select: ARTIFACT_SELECT,
  },
  fiscalOperationAttempts: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      operation: true,
      status: true,
      attemptNumber: true,
      correlationId: true,
      startedAt: true,
      completedAt: true,
      nextRetryAt: true,
      errorCode: true,
      errorMessage: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const CANCELLATION_SELECT = {
  id: true,
  uuid: true,
  status: true,
  fiscalStatus: true,
  cancellationStatus: true,
  cancelledAt: true,
  cancellationMotiveCode: true,
  internalReason: true,
  cancellationReason: true,
  replacementInvoiceId: true,
  replacementUuid: true,
  substitutionUuid: true,
  version: true,
  fiscalArtifacts: {
    where: { type: 'CANCELLATION_ACK' },
    orderBy: { version: 'desc' as const },
    take: 1,
    select: ARTIFACT_SELECT,
  },
  fiscalOperationAttempts: {
    where: { operation: { in: ['CANCEL', 'STATUS'] } },
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    select: {
      id: true,
      operation: true,
      status: true,
      attemptNumber: true,
      correlationId: true,
      startedAt: true,
      completedAt: true,
      nextRetryAt: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const AUDIT_SELECT = {
  id: true,
  action: true,
  reason: true,
  correlationId: true,
  createdAt: true,
  actorUserId: true,
} satisfies Prisma.BillingAuditLogSelect;

type InvoiceListRecord = Prisma.InvoiceGetPayload<{
  select: typeof LIST_SELECT;
}>;
type InvoiceDetailRecord = Prisma.InvoiceGetPayload<{
  select: typeof DETAIL_SELECT;
}>;
type InvoiceStatusRecord = Prisma.InvoiceGetPayload<{
  select: typeof STATUS_SELECT;
}>;
type InvoiceCancellationRecord = Prisma.InvoiceGetPayload<{
  select: typeof CANCELLATION_SELECT;
}>;
type AuditRecord = Prisma.BillingAuditLogGetPayload<{
  select: typeof AUDIT_SELECT;
}>;

@Injectable()
export class FiscalInvoiceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListFiscalInvoicesQueryDto, actor: ReadActor) {
    this.assertReadAccess(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where = this.buildWhere(query);

    const [total, invoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: invoices.map((invoice) => this.toListItem(invoice)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async detail(id: string, actor: ReadActor) {
    this.assertReadAccess(actor);
    const [invoice, audit] = await Promise.all([
      this.prisma.invoice.findUnique({
        where: { id },
        select: DETAIL_SELECT,
      }),
      this.auditForInvoice(id),
    ]);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    return this.toDetail(invoice, audit);
  }

  async status(id: string, actor: ReadActor) {
    this.assertReadAccess(actor);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: STATUS_SELECT,
    });
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    return this.toStatus(invoice);
  }

  async cancellation(id: string, actor: ReadActor) {
    this.assertReadAccess(actor);
    const [invoice, audit] = await Promise.all([
      this.prisma.invoice.findUnique({
        where: { id },
        select: CANCELLATION_SELECT,
      }),
      this.auditForInvoice(id),
    ]);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');

    return this.toCancellation(invoice, audit);
  }

  private async auditForInvoice(id: string): Promise<AuditRecord[]> {
    return this.prisma.billingAuditLog.findMany({
      where: { entityType: 'Invoice', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: AUDIT_SELECT,
    });
  }

  private assertReadAccess(actor: ReadActor): void {
    if (actor.role !== 'ADMIN' && actor.role !== 'BILLING') {
      throw new ForbiddenException('CFDI_INVOICE_READ_FORBIDDEN');
    }
  }

  private buildWhere(
    query: ListFiscalInvoicesQueryDto,
  ): Prisma.InvoiceWhereInput {
    const and: Prisma.InvoiceWhereInput[] = [];
    const dateRange = buildCivilDateRangeFilter(
      query.dateFrom,
      query.dateTo,
      this.config.get<string>('app.timezone'),
    );

    if (dateRange) {
      and.push({
        OR: [{ issuedAt: dateRange }, { issuedAt: null, createdAt: dateRange }],
      });
    }
    if (query.customerId) {
      and.push({
        OR: [
          {
            sourceBillingRequest: { is: { customerId: query.customerId } },
          },
          {
            documents: {
              some: {
                saleDocument: { sale: { customerId: query.customerId } },
              },
            },
          },
        ],
      });
    }
    if (query.taxId) {
      const taxId = query.taxId.trim().toUpperCase();
      and.push({
        OR: [
          { receiverSnapshot: { path: ['taxId'], equals: taxId } },
          {
            AND: [
              { origin: InvoiceOrigin.LEGACY_EXTERNAL },
              {
                OR: [
                  {
                    sourceBillingRequest: {
                      is: { customer: { taxId } },
                    },
                  },
                  {
                    documents: {
                      some: {
                        saleDocument: {
                          sale: { customer: { is: { taxId } } },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
    }
    if (query.uuid) and.push({ uuid: query.uuid.trim().toUpperCase() });
    if (query.series) and.push({ series: query.series.trim().toUpperCase() });
    if (query.folio) and.push({ folio: query.folio.trim() });
    if (query.fiscalStatus) and.push({ fiscalStatus: query.fiscalStatus });
    if (query.legalEntityId) and.push({ legalEntityId: query.legalEntityId });
    if (query.cfdiType) and.push({ cfdiType: query.cfdiType });
    if (query.locationId) {
      and.push({
        documents: {
          some: {
            saleDocument: {
              OR: [
                { operationalLocationId: query.locationId },
                { sale: { locationId: query.locationId } },
              ],
            },
          },
        },
      });
    }

    return and.length ? { AND: and } : {};
  }

  private toListItem(invoice: InvoiceListRecord) {
    return {
      id: invoice.id,
      sourceBillingRequestId: invoice.sourceBillingRequestId,
      origin: invoice.origin,
      series: invoice.series,
      folio: invoice.folio,
      uuid: invoice.uuid,
      cfdiVersion: invoice.cfdiVersion,
      cfdiType: invoice.cfdiType,
      fiscalStatus: invoice.fiscalStatus,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      stampedAt: invoice.stampedAt,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      legalEntityId: invoice.legalEntityId,
      currencyCode: invoice.currencyCode,
      exchangeRate: this.decimal(invoice.exchangeRate, 6),
      issuer: this.snapshot(invoice.issuerSnapshot),
      receiver: this.snapshot(invoice.receiverSnapshot),
      globalInformation: this.snapshot(invoice.globalInformationSnapshot),
      snapshotAvailable: Boolean(
        invoice.issuerSnapshot && invoice.receiverSnapshot,
      ),
      totals: this.totals(invoice),
      documents: invoice.documents.map((document) => this.toDocument(document)),
      artifacts: invoice.fiscalArtifacts.map((artifact) =>
        this.toArtifact(artifact),
      ),
      cancellation: this.cancellationSummary(invoice),
    };
  }

  private toDetail(invoice: InvoiceDetailRecord, audit: AuditRecord[]) {
    return {
      ...this.toListItem(invoice),
      fiscal: {
        fiscalUseCode: invoice.fiscalUseCode,
        exportCode: invoice.exportCode,
        paymentFormCode: invoice.paymentFormCode,
        paymentMethodCode: invoice.paymentMethodCode,
        certificateNumber: invoice.certificateNumber,
        satCertificateNumber: invoice.satCertificateNumber,
        certificationProviderTaxId: invoice.certificationProviderTaxId,
        cfdiSeal: invoice.cfdiSeal,
        satSeal: invoice.satSeal,
        fiscalSnapshotHash: invoice.fiscalSnapshotHash,
      },
      fiscalAttemptCount: invoice.fiscalAttemptCount,
      lastFiscalAttemptAt: invoice.lastFiscalAttemptAt,
      lastFiscalErrorCode: invoice.lastFiscalErrorCode,
      lastFiscalErrorMessage: invoice.lastFiscalErrorMessage,
      version: invoice.version,
      concepts: invoice.concepts.map((concept) => ({
        id: concept.id,
        lineNumber: concept.lineNumber,
        sourceSaleItemId: concept.sourceSaleItemId,
        productServiceCode: concept.productServiceCode,
        identificationNumber: concept.identificationNumber,
        description: concept.description,
        quantity: this.decimal(concept.quantity, 6),
        unitCode: concept.unitCode,
        unitName: concept.unitName,
        unitValue: this.decimal(concept.unitValue, 6),
        amount: this.decimal(concept.amount),
        discount: this.decimal(concept.discount),
        taxObjectCode: concept.taxObjectCode,
        taxes: {
          taxCode: concept.taxCode,
          factorType: concept.factorType,
          rateOrQuota: this.decimal(concept.rateOrQuota, 6),
          base: this.decimal(concept.taxBase),
          amount: this.decimal(concept.taxAmount),
          snapshot: concept.taxesSnapshot,
        },
        total: this.decimal(concept.total),
        snapshotHash: concept.snapshotHash,
        createdAt: concept.createdAt,
      })),
      operations: invoice.fiscalOperationAttempts.map((attempt) => ({
        id: attempt.id,
        operation: attempt.operation,
        status: attempt.status,
        attemptNumber: attempt.attemptNumber,
        correlationId: attempt.correlationId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        nextRetryAt: attempt.nextRetryAt,
        errorCode: attempt.errorCode,
        errorMessage: attempt.errorMessage,
        createdAt: attempt.createdAt,
      })),
      audit: audit.map((entry) => this.toAudit(entry)),
    };
  }

  private toStatus(invoice: InvoiceStatusRecord) {
    return {
      invoiceId: invoice.id,
      origin: invoice.origin,
      series: invoice.series,
      folio: invoice.folio,
      uuid: invoice.uuid,
      fiscalStatus: invoice.fiscalStatus,
      status: invoice.status,
      cancellationStatus: invoice.cancellationStatus,
      issuedAt: invoice.issuedAt,
      stampedAt: invoice.stampedAt,
      fiscalAttemptCount: invoice.fiscalAttemptCount,
      lastFiscalAttemptAt: invoice.lastFiscalAttemptAt,
      lastFiscalErrorCode: invoice.lastFiscalErrorCode,
      lastFiscalErrorMessage: invoice.lastFiscalErrorMessage,
      cancellation: this.cancellationSummary(invoice),
      artifacts: invoice.fiscalArtifacts.map((artifact) =>
        this.toArtifact(artifact),
      ),
      latestOperation: invoice.fiscalOperationAttempts[0]
        ? {
            ...invoice.fiscalOperationAttempts[0],
          }
        : null,
    };
  }

  private toCancellation(
    invoice: InvoiceCancellationRecord,
    audit: AuditRecord[],
  ) {
    const state =
      invoice.cancellationStatus === 'PENDING'
        ? 'PENDING'
        : invoice.cancellationStatus === 'ACCEPTED'
          ? 'CANCELLED'
          : invoice.cancellationStatus === 'REJECTED'
            ? 'REJECTED'
            : invoice.cancellationStatus === 'UNKNOWN'
              ? 'ERROR'
              : 'NOT_REQUESTED';
    const latestOperation = invoice.fiscalOperationAttempts[0] ?? null;
    const acknowledgment = invoice.fiscalArtifacts[0] ?? null;
    return {
      invoiceId: invoice.id,
      uuid: invoice.uuid,
      invoiceStatus: invoice.status,
      fiscalStatus: invoice.fiscalStatus,
      cancellationStatus: invoice.cancellationStatus,
      state,
      cancelledAt: invoice.cancelledAt,
      cancellationMotiveCode: invoice.cancellationMotiveCode,
      internalReason: invoice.internalReason ?? invoice.cancellationReason,
      replacementInvoiceId: invoice.replacementInvoiceId,
      replacementUuid: invoice.replacementUuid ?? invoice.substitutionUuid,
      version: invoice.version,
      nextRetryAt: latestOperation?.nextRetryAt ?? null,
      lastErrorCode: latestOperation?.errorCode ?? null,
      lastErrorMessage: latestOperation?.errorMessage ?? null,
      latestOperation: latestOperation
        ? {
            id: latestOperation.id,
            operation: latestOperation.operation,
            status: latestOperation.status,
            attemptNumber: latestOperation.attemptNumber,
            correlationId: latestOperation.correlationId,
            startedAt: latestOperation.startedAt,
            completedAt: latestOperation.completedAt,
            nextRetryAt: latestOperation.nextRetryAt,
            errorCode: latestOperation.errorCode,
            errorMessage: latestOperation.errorMessage,
            createdAt: latestOperation.createdAt,
          }
        : null,
      acknowledgment: acknowledgment
        ? {
            ...this.toArtifact(acknowledgment),
            type: 'CANCELLATION_ACK',
          }
        : null,
      audit: audit
        .filter((entry) => entry.action.startsWith('CFDI_CANCELLATION'))
        .slice(0, 10)
        .map((entry) => this.toAudit(entry)),
    };
  }

  private toDocument(document: InvoiceListRecord['documents'][number]) {
    return {
      id: document.id,
      saleDocumentId: document.saleDocumentId,
      billingRequestSaleDocumentId: document.billingRequestSaleDocumentId,
      subtotalApplied: this.decimal(document.subtotalApplied),
      taxApplied: this.decimal(document.taxApplied),
      totalApplied: this.decimal(document.totalApplied),
      reversedAt: document.reversedAt,
      reversalReason: document.reversalReason,
      saleDocument: {
        id: document.saleDocument.id,
        saleId: document.saleDocument.saleId,
        documentType: document.saleDocument.documentType,
        physicalFolio: document.saleDocument.physicalFolio,
        status: document.saleDocument.status,
        operationalLocation: document.saleDocument.operationalLocation,
        sale: document.saleDocument.sale,
      },
      itemApplications: document.itemApplications.map((item) => ({
        id: item.id,
        saleItemId: item.saleItemId,
        subtotalApplied: this.decimal(item.subtotalApplied),
        taxApplied: this.decimal(item.taxApplied),
        totalApplied: this.decimal(item.totalApplied),
        reversedAt: item.reversedAt,
        reversalReason: item.reversalReason,
      })),
    };
  }

  private toArtifact(artifact: InvoiceListRecord['fiscalArtifacts'][number]) {
    return {
      id: artifact.id,
      type: artifact.type,
      status: artifact.status,
      available:
        artifact.status === 'AVAILABLE' &&
        artifact.sha256 !== null &&
        artifact.byteSize !== null &&
        artifact.storedAt !== null,
      version: artifact.version,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.byteSize?.toString() ?? null,
      sha256: artifact.sha256,
      lastErrorCode: artifact.lastErrorCode,
      createdAt: artifact.createdAt,
      storedAt: artifact.storedAt,
    };
  }

  private toAudit(entry: AuditRecord) {
    return {
      id: entry.id,
      action: entry.action,
      reason: entry.reason,
      correlationId: entry.correlationId,
      actorUserId: entry.actorUserId,
      createdAt: entry.createdAt,
    };
  }

  private cancellationSummary(invoice: {
    cancellationStatus: string;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    cancellationMotiveCode: string | null;
    internalReason: string | null;
    replacementInvoiceId: string | null;
    replacementUuid: string | null;
    substitutionUuid: string | null;
    substitutedByInvoiceId: string | null;
  }) {
    return {
      status: invoice.cancellationStatus,
      cancelledAt: invoice.cancelledAt,
      cancellationMotiveCode: invoice.cancellationMotiveCode,
      internalReason: invoice.internalReason ?? invoice.cancellationReason,
      replacementInvoiceId: invoice.replacementInvoiceId,
      replacementUuid: invoice.replacementUuid ?? invoice.substitutionUuid,
      // Deprecated aliases retained for legacy readers.
      reason: invoice.cancellationReason,
      substitutionUuid: invoice.substitutionUuid,
      substitutedByInvoiceId: invoice.substitutedByInvoiceId,
    };
  }

  private totals(invoice: {
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
  }) {
    return {
      subtotal: this.decimal(invoice.subtotal),
      discount: this.decimal(invoice.discount),
      tax: this.decimal(invoice.tax),
      total: this.decimal(invoice.total),
    };
  }

  private snapshot(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    return value;
  }

  private decimal(value: Prisma.Decimal | null, scale = 2): string | null {
    return value === null ? null : value.toFixed(scale);
  }
}
