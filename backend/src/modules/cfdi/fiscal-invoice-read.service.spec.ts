import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FiscalInvoiceReadService } from './fiscal-invoice-read.service';
import { ListFiscalInvoicesQueryDto } from './dto/fiscal-invoice-query.dto';

const admin = { id: 'admin-1', role: 'ADMIN' as const };

function artifact() {
  return {
    id: 'artifact-1',
    type: 'XML',
    status: 'AVAILABLE',
    version: 1,
    mimeType: 'application/xml',
    byteSize: 128n,
    sha256: 'a'.repeat(64),
    lastErrorCode: null,
    createdAt: new Date('2026-08-23T18:00:00.000Z'),
    storedAt: new Date('2026-08-23T18:01:00.000Z'),
  };
}

function document() {
  return {
    id: 'invoice-document-1',
    saleDocumentId: 'sale-document-1',
    billingRequestSaleDocumentId: 'request-document-1',
    subtotalApplied: new Prisma.Decimal('100.00'),
    taxApplied: new Prisma.Decimal('16.00'),
    totalApplied: new Prisma.Decimal('116.00'),
    reversedAt: null,
    reversalReason: null,
    saleDocument: {
      id: 'sale-document-1',
      saleId: 'sale-1',
      documentType: 'INTERNAL_RECEIPT',
      physicalFolio: 'T-1',
      status: 'ISSUED',
      operationalLocationId: 'location-1',
      operationalLocation: {
        id: 'location-1',
        name: 'Centro',
        code: 'CTR',
      },
      sale: { id: 'sale-1', saleNumber: 'V-1', locationId: 'location-1' },
    },
    itemApplications: [
      {
        id: 'item-application-1',
        saleItemId: 'sale-item-1',
        subtotalApplied: new Prisma.Decimal('100.00'),
        taxApplied: new Prisma.Decimal('16.00'),
        totalApplied: new Prisma.Decimal('116.00'),
        reversedAt: null,
        reversalReason: null,
      },
    ],
  };
}

function invoice() {
  return {
    id: 'invoice-1',
    sourceBillingRequestId: 'billing-request-1',
    legalEntityId: 'legal-entity-1',
    currencyCode: 'MXN',
    exchangeRate: new Prisma.Decimal('1.000000'),
    series: 'A',
    folio: '42',
    uuid: 'A8098C1A-F86E-11DA-BD1A-00112444BE1E',
    origin: 'NATIVE_CFDI',
    cfdiVersion: '4.0',
    cfdiType: 'INCOME',
    issuedAt: new Date('2026-08-23T18:00:00.000Z'),
    stampedAt: new Date('2026-08-23T18:01:00.000Z'),
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'NOT_REQUESTED',
    subtotal: new Prisma.Decimal('100.00'),
    discount: new Prisma.Decimal('0.00'),
    tax: new Prisma.Decimal('16.00'),
    total: new Prisma.Decimal('116.00'),
    status: 'ACTIVE',
    cancelledAt: null,
    cancellationReason: null,
    cancellationMotiveCode: null,
    internalReason: null,
    replacementInvoiceId: null,
    replacementUuid: null,
    substitutionUuid: null,
    substitutedByInvoiceId: null,
    issuerSnapshot: {
      legalEntityId: 'legal-entity-1',
      legalName: 'Emisor Fiscal',
      taxId: 'AAA010101AAA',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      series: 'A',
    },
    receiverSnapshot: {
      customerId: 'customer-1',
      fiscalName: 'Receptor Histórico',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '06000',
      fiscalRegime: '616',
      fiscalUseCode: 'G03',
    },
    createdAt: new Date('2026-08-23T18:00:00.000Z'),
    updatedAt: new Date('2026-08-23T18:02:00.000Z'),
    fiscalArtifacts: [artifact()],
    documents: [document()],
    fiscalUseCode: 'G03',
    exportCode: '01',
    paymentFormCode: '03',
    paymentMethodCode: 'PUE',
    certificateNumber: 'CERT-1',
    satCertificateNumber: 'SAT-CERT-1',
    certificationProviderTaxId: 'PAC010101AAA',
    cfdiSeal: 'cfdi-seal',
    satSeal: 'sat-seal',
    fiscalSnapshotHash: 'b'.repeat(64),
    fiscalAttemptCount: 1,
    lastFiscalAttemptAt: new Date('2026-08-23T18:00:30.000Z'),
    lastFiscalErrorCode: null,
    lastFiscalErrorMessage: null,
    version: 3,
    concepts: [
      {
        id: 'concept-1',
        lineNumber: 1,
        sourceSaleItemId: 'sale-item-1',
        productServiceCode: '10101500',
        identificationNumber: 'SKU-1',
        description: 'Producto histórico',
        quantity: new Prisma.Decimal('2.000000'),
        unitCode: 'KGM',
        unitName: 'Kilogramo',
        unitValue: new Prisma.Decimal('50.000000'),
        amount: new Prisma.Decimal('100.00'),
        discount: new Prisma.Decimal('0.00'),
        taxObjectCode: '02',
        taxCode: '002',
        factorType: 'Tasa',
        rateOrQuota: new Prisma.Decimal('0.160000'),
        taxBase: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('16.00'),
        total: new Prisma.Decimal('116.00'),
        taxesSnapshot: { taxCode: '002', rateOrQuota: '0.160000' },
        snapshotHash: 'c'.repeat(64),
        createdAt: new Date('2026-08-23T18:00:00.000Z'),
      },
    ],
    fiscalOperationAttempts: [
      {
        id: 'attempt-1',
        operation: 'STAMP',
        status: 'SUCCEEDED',
        attemptNumber: 1,
        correlationId: 'correlation-1',
        startedAt: new Date('2026-08-23T18:00:30.000Z'),
        completedAt: new Date('2026-08-23T18:01:00.000Z'),
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-08-23T18:00:30.000Z'),
      },
    ],
  };
}

function harness() {
  const prisma = {
    invoice: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([invoice()]),
      findUnique: jest.fn().mockResolvedValue(invoice()),
    },
    billingAuditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CFDI_STAMPED',
          reason: null,
          correlationId: 'correlation-1',
          createdAt: new Date('2026-08-23T18:01:00.000Z'),
          actorUserId: 'admin-1',
        },
      ]),
    },
  };
  const config = { get: jest.fn().mockReturnValue('America/Mexico_City') };
  return {
    prisma,
    service: new FiscalInvoiceReadService(prisma as never, config as never),
  };
}

describe('FiscalInvoiceReadService', () => {
  it('paginates one batched invoice query, applies filters, and keeps snapshot data authoritative', async () => {
    const { prisma, service } = harness();
    const query = Object.assign(new ListFiscalInvoicesQueryDto(), {
      page: 2,
      limit: 10,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      customerId: 'customer-1',
      taxId: 'XAXX010101000',
      uuid: 'A8098C1A-F86E-11DA-BD1A-00112444BE1E',
      series: 'A',
      folio: '42',
      fiscalStatus: 'STAMPED',
      legalEntityId: 'legal-entity-1',
      locationId: 'location-1',
      cfdiType: 'INCOME',
    });

    const result = await service.list(query, admin);

    expect(prisma.invoice.count).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.billingAuditLog.findMany).not.toHaveBeenCalled();
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('XAXX010101000');
    expect(JSON.stringify(where)).toContain('location-1');
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.items[0]).toMatchObject({
      issuer: invoice().issuerSnapshot,
      receiver: invoice().receiverSnapshot,
      totals: {
        subtotal: '100.00',
        tax: '16.00',
        total: '116.00',
      },
      documents: [expect.objectContaining({ totalApplied: '116.00' })],
      artifacts: [
        expect.objectContaining({ sizeBytes: '128', available: true }),
      ],
    });
    expect(result.items[0]).not.toHaveProperty('concepts');
  });

  it('returns immutable concepts, sale-document relations and summarized audit without current Customer/Product reads', async () => {
    const { prisma, service } = harness();

    const result = await service.detail('invoice-1', admin);

    expect(prisma.invoice.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.billingAuditLog.findMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      issuer: invoice().issuerSnapshot,
      receiver: invoice().receiverSnapshot,
      fiscal: {
        fiscalUseCode: 'G03',
        paymentMethodCode: 'PUE',
      },
      concepts: [
        expect.objectContaining({
          description: 'Producto histórico',
          quantity: '2.000000',
          amount: '100.00',
          taxes: expect.objectContaining({ amount: '16.00' }),
        }),
      ],
      audit: [expect.objectContaining({ action: 'CFDI_STAMPED' })],
    });
    expect(result.documents[0].saleDocument.sale.saleNumber).toBe('V-1');
    expect(result).not.toHaveProperty('customer');
    expect(result.concepts[0]).not.toHaveProperty('product');
  });

  it('returns status, cancellation and artifact availability without loading detail concepts', async () => {
    const { prisma, service } = harness();

    const result = await service.status('invoice-1', admin);

    expect(prisma.invoice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ fiscalArtifacts: expect.anything() }),
      }),
    );
    expect(result).toMatchObject({
      invoiceId: 'invoice-1',
      fiscalStatus: 'STAMPED',
      uuid: 'A8098C1A-F86E-11DA-BD1A-00112444BE1E',
      cancellation: {
        status: 'NOT_REQUESTED',
        cancellationMotiveCode: null,
        internalReason: null,
        replacementInvoiceId: null,
        replacementUuid: null,
      },
      artifacts: [expect.objectContaining({ type: 'XML', available: true })],
      latestOperation: expect.objectContaining({ status: 'SUCCEEDED' }),
    });
  });

  it('returns a dedicated cancellation projection with retry state and acknowledgment availability', async () => {
    const { prisma, service } = harness();
    prisma.invoice.findUnique.mockResolvedValueOnce({
      ...invoice(),
      cancellationStatus: 'PENDING',
      cancellationMotiveCode: '01',
      internalReason: 'Sustitución fiscal',
      replacementInvoiceId: 'replacement-1',
      replacementUuid: 'B8098C1A-F86E-11DA-BD1A-00112444BE1E',
      fiscalArtifacts: [
        {
          ...artifact(),
          type: 'CANCELLATION_ACK',
          status: 'AVAILABLE',
        },
      ],
      fiscalOperationAttempts: [
        {
          ...invoice().fiscalOperationAttempts[0],
          id: 'status-attempt-1',
          operation: 'STATUS',
          status: 'PROCESSING',
        },
        {
          ...invoice().fiscalOperationAttempts[0],
          id: 'cancel-attempt-1',
          operation: 'CANCEL',
          status: 'SUCCEEDED',
          nextRetryAt: new Date('2026-08-23T19:05:00.000Z'),
          errorCode: null,
          errorMessage: null,
        },
      ],
    });

    const result = await service.cancellation('invoice-1', admin);

    expect(result).toMatchObject({
      invoiceId: 'invoice-1',
      state: 'PENDING',
      cancellationStatus: 'PENDING',
      cancellationMotiveCode: '01',
      replacementUuid: 'B8098C1A-F86E-11DA-BD1A-00112444BE1E',
      acknowledgment: { available: true, type: 'CANCELLATION_ACK' },
      latestOperation: expect.objectContaining({ operation: 'STATUS' }),
    });
  });

  it('does not infer missing legacy snapshots from mutable current records', async () => {
    const { prisma, service } = harness();
    prisma.invoice.findUnique.mockResolvedValueOnce({
      ...invoice(),
      origin: 'LEGACY_EXTERNAL',
      issuerSnapshot: null,
      receiverSnapshot: null,
      concepts: [],
    });

    const result = await service.detail('legacy-invoice-1', admin);

    expect(result).toMatchObject({
      issuer: null,
      receiver: null,
      snapshotAvailable: false,
      concepts: [],
    });
    expect(result).not.toHaveProperty('customer');
    expect(result).not.toHaveProperty('product');
  });

  it('enforces the canonical ADMIN/BILLING-only read policy and stable not-found error', async () => {
    const { prisma, service } = harness();

    await expect(
      service.list(new ListFiscalInvoicesQueryDto(), {
        id: 'seller-1',
        role: 'SELLER',
      }),
    ).rejects.toEqual(new ForbiddenException('CFDI_INVOICE_READ_FORBIDDEN'));

    prisma.invoice.findUnique.mockResolvedValueOnce(null);
    await expect(service.status('missing', admin)).rejects.toEqual(
      new NotFoundException('INVOICE_NOT_FOUND'),
    );
  });
});
