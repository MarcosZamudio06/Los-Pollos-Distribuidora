import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BillingRequestStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BillingRequestsService } from './billing-requests.service';

const admin = { id: 'admin-1', role: 'ADMIN' };
const seller = { id: 'seller-1', role: 'SELLER' };
const now = new Date('2026-07-17T12:00:00.000Z');

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1', saleId: 'sale-1', customerId: 'customer-1', requestedByUserId: 'seller-1',
    status: BillingRequestStatus.REQUESTED, requestedAt: now, reviewedAt: null, reviewedByUserId: null,
    reason: 'Cliente solicita seguimiento', notes: null, createdAt: now, updatedAt: now,
    sale: { id: 'sale-1', saleNumber: 'V-001', userId: 'seller-1', locationId: 'loc-1', status: SaleStatus.CONFIRMED },
    customer: { id: 'customer-1', name: 'Cliente Uno' }, accountReceivables: [], documents: [], history: [],
    ...overrides,
  };
}

function createPrisma() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([
        { saleDocumentId: 'document-1', billingStatus: 'BILLABLE', blockingCodes: [] },
        { saleDocumentId: 'document-2', billingStatus: 'BILLABLE', blockingCodes: [] },
      ]),
    sale: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    saleDocument: { findMany: jest.fn() },
    billingRequest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    billingRequestSaleDocument: { create: jest.fn() },
    billingRequestHistory: { create: jest.fn() },
    accountReceivable: { update: jest.fn() },
    invoice: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    invoiceSaleDocument: { create: jest.fn() },
    invoiceSaleItemApplication: { create: jest.fn() },
    billingPolicy: { findUnique: jest.fn().mockResolvedValue({
      id: 'default', billableDocumentTypes: ['SIMPLE_NOTE', 'LARGE_NOTE'], allowInternalReceipt: false,
      requireConfirmedDelivery: false, deadlineDays: 30, deadlineBasis: 'ISSUED_AT', timezone: 'America/Mexico_City',
    }) },
    billingAuditLog: { create: jest.fn() },
    payment: { create: jest.fn(), update: jest.fn() },
    inventoryMovement: { create: jest.fn(), update: jest.fn() },
  };
  return {
    tx,
    prisma: {
      billingRequest: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
}

const documentRecord = {
  id: 'document-1', documentType: 'SIMPLE_NOTE', status: 'ISSUED',
  createdAt: now,
  sale: {
    id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CONFIRMED,
    currencyCode: 'MXN', legalEntityId: 'legal-1', subtotal: new Prisma.Decimal(90), discount: new Prisma.Decimal(0), tax: new Prisma.Decimal(10), total: new Prisma.Decimal(100),
    items: [{ id: 'item-1', taxableBase: new Prisma.Decimal(90), tax: new Prisma.Decimal(10), total: new Prisma.Decimal(100), invoiceApplications: [] }],
    customer: { id: 'customer-1', isActive: true, taxId: 'XAXX010101000', fiscalName: 'Cliente Uno', fiscalPostalCode: '64000', fiscalRegime: '601', fiscalUseCode: 'G03', billingEmail: 'billing@example.com' },
    deliveryOrder: null,
  },
  billingRequestDocuments: [], invoiceDocuments: [],
};

describe('BillingRequestsService', () => {
  it('loads request documents with sale items required for invoice reconciliation', async () => {
    const { prisma } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    prisma.billingRequest.findFirst.mockResolvedValue(request());

    await service.findOne('request-1', admin);

    expect(prisma.billingRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        documents: expect.objectContaining({
          include: expect.objectContaining({
            saleDocument: expect.objectContaining({ include: expect.objectContaining({ sale: expect.objectContaining({ include: { items: true } }) }) }),
          }),
        }),
      }),
    }));
  });

  it('links an external invoice with exact document and item applications', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    const invoice = { id: 'invoice-1', legalEntityId: 'legal-1', currencyCode: 'MXN', subtotal: new Prisma.Decimal(90), discount: new Prisma.Decimal(0), tax: new Prisma.Decimal(10), total: new Prisma.Decimal(100), status: 'ACTIVE', linkPayloadHash: null };
    tx.invoice.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(invoice);
    tx.invoice.create.mockResolvedValue(invoice);
    tx.invoiceSaleDocument.create.mockResolvedValue({ id: 'invoice-document-1' });
    tx.billingRequest.findUnique.mockResolvedValue({ id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED, documents: [{ id: 'request-document-1', saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100), invoiceApplications: [], saleDocument: { id: 'document-1', invoiceDocuments: [], sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] } } }] });

    await service.linkInvoice('request-1', { expectedVersion: 1, invoice: { legalEntityId: 'legal-1', currencyCode: 'MXN', series: 'A', folio: '1', subtotal: '90.00', discount: '0.00', tax: '10.00', total: '100.00' }, applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }] }] }, admin, 'link-key');

    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ linkIdempotencyKey: 'link-key', total: new Prisma.Decimal(100) }) });
    expect(tx.invoiceSaleDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      billingRequestSaleDocumentId: 'request-document-1',
      saleDocumentId: 'document-1',
      totalApplied: new Prisma.Decimal(100),
    }) });
    expect(tx.invoiceSaleItemApplication.create).toHaveBeenCalledWith({ data: expect.objectContaining({ saleItemId: 'item-1', totalApplied: new Prisma.Decimal(100) }) });
    expect(tx.billingRequest.update).toHaveBeenCalledWith({ where: { id: 'request-1', version: 1 }, data: { version: { increment: 1 } } });
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'INVOICE_LINKED', actorUserId: 'admin-1', entityId: 'invoice-1' }) });
  });

  it('rejects invoice applications whose item sum differs from the document amount', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.invoice.findUnique.mockResolvedValue(null);
    tx.billingRequest.findUnique.mockResolvedValue({ id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED, documents: [{ saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100), saleDocument: { id: 'document-1', invoiceDocuments: [], sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] } } }] });
    await expect(service.linkInvoice('request-1', { expectedVersion: 1, invoiceId: 'invoice-1', applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '80.00', taxApplied: '10.00', totalApplied: '90.00' }] }] }, admin, 'mismatch')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls back before persistence when an application would over-invoice a document', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.invoice.findUnique.mockResolvedValue(null);
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{
        saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100),
        saleDocument: {
          id: 'document-1',
          invoiceDocuments: [{ totalApplied: new Prisma.Decimal(80), invoice: { id: 'invoice-existing', status: 'ACTIVE' } }],
          sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] },
        },
      }],
    });

    await expect(service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoiceId: 'invoice-2',
      applications: [{
        saleDocumentId: 'document-1', subtotalApplied: '27.00', taxApplied: '3.00', totalApplied: '30.00',
        items: [{ saleItemId: 'item-1', subtotalApplied: '27.00', taxApplied: '3.00', totalApplied: '30.00' }],
      }],
    }, admin, 'over-invoice')).rejects.toThrow('OVER_INVOICED');

    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.invoiceSaleDocument.create).not.toHaveBeenCalled();
    expect(tx.invoiceSaleItemApplication.create).not.toHaveBeenCalled();
    expect(tx.billingRequest.update).not.toHaveBeenCalled();
    expect(tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects an application that exceeds the unconsumed request balance', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.invoice.findUnique.mockResolvedValue(null);
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{
        id: 'request-document-1', saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(50),
        invoiceApplications: [{ totalApplied: new Prisma.Decimal(30), invoice: { status: 'ACTIVE' } }],
        saleDocument: {
          id: 'document-1', invoiceDocuments: [{ totalApplied: new Prisma.Decimal(30), invoice: { id: 'invoice-existing', status: 'ACTIVE' } }],
          sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(200), items: [{ id: 'item-1' }] },
        },
      }],
    });

    await expect(service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoiceId: 'invoice-2',
      applications: [{
        saleDocumentId: 'document-1', subtotalApplied: '27.00', taxApplied: '3.00', totalApplied: '30.00',
        items: [{ saleItemId: 'item-1', subtotalApplied: '27.00', taxApplied: '3.00', totalApplied: '30.00' }],
      }],
    }, admin, 'over-request-balance')).rejects.toThrow('OVER_INVOICED');

    expect(tx.invoiceSaleDocument.create).not.toHaveBeenCalled();
  });

  it('rejects linking an existing invoice when prior and new applications exceed its totals', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    const invoice = {
      id: 'invoice-1', legalEntityId: 'legal-1', currencyCode: 'MXN',
      subtotal: new Prisma.Decimal(900), discount: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(100), total: new Prisma.Decimal(1000), status: 'ACTIVE',
      documents: [{
        subtotalApplied: new Prisma.Decimal(900), taxApplied: new Prisma.Decimal(100),
        totalApplied: new Prisma.Decimal(1000), reversedAt: null,
      }],
    };
    tx.invoice.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(invoice);
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{
        id: 'request-document-2', saleDocumentId: 'document-2', requestedTotal: new Prisma.Decimal(1000),
        invoiceApplications: [],
        saleDocument: {
          id: 'document-2', invoiceDocuments: [],
          sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(1000), items: [{ id: 'item-2' }] },
        },
      }],
    });

    await expect(service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoiceId: 'invoice-1',
      applications: [{
        saleDocumentId: 'document-2', subtotalApplied: '900.00', taxApplied: '100.00', totalApplied: '1000.00',
        items: [{ saleItemId: 'item-2', subtotalApplied: '900.00', taxApplied: '100.00', totalApplied: '1000.00' }],
      }],
    }, admin, 'existing-invoice-over-total')).rejects.toThrow('INVOICE_TOTAL_MISMATCH');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.invoiceSaleDocument.create).not.toHaveBeenCalled();
  });

  it('records substitution without creating sales, payments, or inventory movements', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    const original = {
      id: 'invoice-old', status: 'ACTIVE', version: 3, legalEntityId: 'legal-1', currencyCode: 'MXN', substitutedByInvoiceId: null,
      documents: [{
        saleDocumentId: 'document-1', subtotalApplied: new Prisma.Decimal(90), taxApplied: new Prisma.Decimal(10), totalApplied: new Prisma.Decimal(100),
        itemApplications: [{ saleItemId: 'item-1', subtotalApplied: new Prisma.Decimal(90), taxApplied: new Prisma.Decimal(10), totalApplied: new Prisma.Decimal(100) }],
      }],
    };
    const replacement = {
      id: 'invoice-new', legalEntityId: 'legal-1', currencyCode: 'MXN',
      subtotal: new Prisma.Decimal(90), discount: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(10), total: new Prisma.Decimal(100), status: 'ACTIVE',
    };
    tx.invoice.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    tx.invoice.create.mockResolvedValue(replacement);
    tx.invoiceSaleDocument.create.mockResolvedValue({ id: 'invoice-document-new' });
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{
        saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100),
        invoiceApplications: [{ totalApplied: new Prisma.Decimal(100), invoice: { id: 'invoice-old', status: 'ACTIVE' } }],
        saleDocument: { id: 'document-1', invoiceDocuments: [{ totalApplied: new Prisma.Decimal(100), invoice: { id: 'invoice-old', status: 'ACTIVE' } }], sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] } },
      }],
    });

    await service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoice: {
        legalEntityId: 'legal-1', currencyCode: 'MXN', series: 'B', folio: '2',
        subtotal: '90.00', discount: '0.00', tax: '10.00', total: '100.00',
        substitutesInvoiceId: 'invoice-old',
        substitutionReason: 'Correct external invoice data',
      },
      applications: [{
        saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00',
        items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }],
      }],
    }, admin, 'substitution-key');

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-old', version: 3 },
      data: { status: 'SUBSTITUTED', substitutedByInvoiceId: 'invoice-new', version: { increment: 1 } },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'INVOICE_SUBSTITUTED', entityId: 'invoice-old', reason: 'Correct external invoice data' }),
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.sale.update).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.update).not.toHaveBeenCalled();
  });

  it.each([
    ['issuer', { legalEntityId: 'legal-2' }, 'SUBSTITUTION_LEGAL_ENTITY_MISMATCH'],
    ['currency', { currencyCode: 'USD' }, 'SUBSTITUTION_CURRENCY_MISMATCH'],
  ])('rejects a replacement with a different %s', async (_field, originalOverride, errorCode) => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.invoice.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'invoice-old', status: 'ACTIVE', version: 3, substitutedByInvoiceId: null,
      legalEntityId: 'legal-1', currencyCode: 'MXN', documents: [], ...originalOverride,
    });
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{ id: 'request-document-1', saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100), invoiceApplications: [], saleDocument: { invoiceDocuments: [], sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] } } }],
    });

    await expect(service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoice: { legalEntityId: 'legal-1', currencyCode: 'MXN', series: 'B', folio: '2', subtotal: '90.00', discount: '0.00', tax: '10.00', total: '100.00', substitutesInvoiceId: 'invoice-old', substitutionReason: 'Correction' },
      applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }] }],
    }, admin, `mismatch-${_field}`)).rejects.toThrow(errorCode);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a replacement whose document or item applications differ from the original', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.invoice.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'invoice-old', status: 'ACTIVE', version: 3, substitutedByInvoiceId: null, legalEntityId: 'legal-1', currencyCode: 'MXN',
      documents: [{ saleDocumentId: 'different-document', subtotalApplied: new Prisma.Decimal(90), taxApplied: new Prisma.Decimal(10), totalApplied: new Prisma.Decimal(100), itemApplications: [] }],
    });
    tx.billingRequest.findUnique.mockResolvedValue({
      id: 'request-1', version: 1, status: BillingRequestStatus.APPROVED,
      documents: [{ id: 'request-document-1', saleDocumentId: 'document-1', requestedTotal: new Prisma.Decimal(100), invoiceApplications: [], saleDocument: { invoiceDocuments: [], sale: { legalEntityId: 'legal-1', currencyCode: 'MXN', total: new Prisma.Decimal(100), items: [{ id: 'item-1' }] } } }],
    });
    await expect(service.linkInvoice('request-1', {
      expectedVersion: 1,
      invoice: { legalEntityId: 'legal-1', currencyCode: 'MXN', series: 'B', folio: '2', subtotal: '90.00', discount: '0.00', tax: '10.00', total: '100.00', substitutesInvoiceId: 'invoice-old', substitutionReason: 'Correction' },
      applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }] }],
    }, admin, 'application-mismatch')).rejects.toThrow('SUBSTITUTION_APPLICATION_MISMATCH');
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('creates a request only for a confirmed customer sale and links an existing receivable', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.sale.findUnique.mockResolvedValue({
      id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CONFIRMED,
      documentType: 'SIMPLE_NOTE', subtotal: { minus: () => 100 }, discount: 0, tax: 0, total: 100,
      billingRequests: [], accountReceivable: { id: 'ar-1' },
      documents: [{ id: 'document-1', documentType: 'SIMPLE_NOTE', createdAt: now }], deliveryOrder: null,
    });
    tx.billingRequest.create.mockResolvedValue(request());
    tx.billingRequest.update.mockResolvedValue(request());
    tx.billingRequest.findUnique.mockResolvedValue(request());

    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: ' Cliente solicita seguimiento ' }, seller)).resolves.toMatchObject({ id: 'request-1', status: 'REQUESTED' });
    expect(tx.billingRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ saleId: 'sale-1', customerId: 'customer-1', reason: 'Cliente solicita seguimiento' }) }));
    expect(tx.billingRequestSaleDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingRequestId: 'request-1', saleDocumentId: 'document-1', requestedTotal: 100,
      }),
    });
  });

  it('creates partial and grouped requests from compatible documents in stable lock order', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.saleDocument.findMany.mockResolvedValue([
      documentRecord,
      { ...documentRecord, id: 'document-2', sale: { ...documentRecord.sale, id: 'sale-2' } },
    ]);
    tx.billingRequest.create.mockResolvedValue(request({ version: 1 }));
    tx.billingRequest.findUnique.mockResolvedValueOnce(null).mockResolvedValue(request({ version: 1 }));

    await service.create({
      customerId: 'customer-1', reason: 'Grouped request', documents: [
        { saleDocumentId: 'document-2', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00', items: [{ saleItemId: 'item-1' }] },
        { saleDocumentId: 'document-1', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00', items: [{ saleItemId: 'item-1' }] },
      ],
    }, seller, 'grouped-key');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.billingRequestSaleDocument.create).toHaveBeenCalledTimes(2);
    expect(tx.billingRequestSaleDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({ selectedSaleItemIds: ['item-1'], requestedSubtotal: new Prisma.Decimal(90), requestedTax: new Prisma.Decimal(10) }) });
    expect(tx.billingRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ saleId: null, creationIdempotencyKey: 'grouped-key' }) }));
  });

  it('rejects a document amount that does not equal the exact selected item breakdown', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.saleDocument.findMany.mockResolvedValue([documentRecord]);
    tx.billingRequest.findUnique.mockResolvedValue(null);

    await expect(service.create({ customerId: 'customer-1', reason: 'Incorrect tax split', documents: [{
      saleDocumentId: 'document-1', items: [{ saleItemId: 'item-1' }],
      requestedSubtotal: '80.00', requestedTax: '10.00', requestedTotal: '90.00',
    }] }, seller, 'invalid-item-breakdown')).rejects.toThrow('INVALID_REQUESTED_ITEM_BREAKDOWN');

    expect(tx.billingRequest.create).not.toHaveBeenCalled();
  });

  it('uses the canonical read model for internal receipt, delivery, and deadline rules', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.billingPolicy.findUnique.mockResolvedValue({
      id: 'default', billableDocumentTypes: ['INTERNAL_RECEIPT'], allowInternalReceipt: true,
      requireConfirmedDelivery: false, deadlineDays: null, deadlineBasis: 'DELIVERED_AT', timezone: 'America/Cancun',
    });
    tx.saleDocument.findMany.mockResolvedValue([{ ...documentRecord, documentType: 'INTERNAL_RECEIPT' }]);
    tx.billingRequest.findUnique.mockResolvedValueOnce(null).mockResolvedValue(request());
    tx.billingRequest.create.mockResolvedValue(request());

    await expect(service.create({ customerId: 'customer-1', reason: 'Configured policy', documents: [
      { saleDocumentId: 'document-1', requestedSubtotal: '90', requestedTax: '10', requestedTotal: '100' },
    ] }, seller, 'configured-policy')).resolves.toMatchObject({ id: 'request-1' });
    expect(tx.$queryRaw.mock.calls.some(([query]) => JSON.stringify(query).includes('BillingReportableNoteReadModel'))).toBe(true);
  });

  it('rejects mixed issuers and incomplete fiscal profiles', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.saleDocument.findMany.mockResolvedValue([documentRecord, { ...documentRecord, id: 'document-2', sale: { ...documentRecord.sale, legalEntityId: 'legal-2' } }]);
    await expect(service.create({ customerId: 'customer-1', reason: 'Grouped', documents: [
      { saleDocumentId: 'document-1', requestedSubtotal: '90', requestedTax: '10', requestedTotal: '100' },
      { saleDocumentId: 'document-2', requestedSubtotal: '90', requestedTax: '10', requestedTotal: '100' },
    ] }, seller, 'mixed')).rejects.toBeInstanceOf(BadRequestException);
    tx.saleDocument.findMany.mockResolvedValue([{ ...documentRecord, sale: { ...documentRecord.sale, customer: { ...documentRecord.sale.customer, fiscalRegime: null } } }]);
    await expect(service.create({ customerId: 'customer-1', reason: 'Missing fiscal', documents: [
      { saleDocumentId: 'document-1', requestedSubtotal: '90', requestedTax: '10', requestedTotal: '100' },
    ] }, seller, 'fiscal')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the existing request for an idempotent retry and rejects payload drift', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    const dto = { customerId: 'customer-1', reason: 'Retry', documents: [{ saleDocumentId: 'document-1', requestedSubtotal: '90', requestedTax: '10', requestedTotal: '100' }] };
    const payloadHash = createHash('sha256').update(JSON.stringify({ customerId: 'customer-1', retryOfBillingRequestId: null, reason: 'Retry', notes: null, documents: dto.documents })).digest('hex');
    tx.billingRequest.findUnique.mockResolvedValue(request({ creationPayloadHash: payloadHash }));
    await expect(service.create(dto, seller, 'retry-key')).resolves.toMatchObject({ id: 'request-1' });
    tx.billingRequest.findUnique.mockResolvedValue(request({ creationPayloadHash: 'different' }));
    await expect(service.create(dto, seller, 'retry-key')).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves, rejects and cancels with optimistic versioning and terminal states', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.billingRequest.findUnique.mockResolvedValue(request({ version: 2, status: BillingRequestStatus.IN_REVIEW }));
    tx.billingRequest.update.mockResolvedValue(request({ version: 3, status: BillingRequestStatus.APPROVED }));
    await service.approve('request-1', { expectedVersion: 2, reason: 'Validated' }, admin);
    expect(tx.billingRequest.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'request-1', version: 2 }, data: expect.objectContaining({ status: BillingRequestStatus.APPROVED, version: { increment: 1 } }) }));
    tx.billingRequest.findUnique.mockResolvedValue(request({ version: 3, status: BillingRequestStatus.APPROVED }));
    await expect(service.cancel('request-1', { expectedVersion: 3, reason: 'Too late' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    tx.billingRequest.findUnique.mockResolvedValue(request({ version: 4, status: BillingRequestStatus.REQUESTED }));
    await expect(service.reject('request-1', { expectedVersion: 3, reason: 'Invalid' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate, cancelled, customerless and mismatched-customer sales', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequests: [{ id: 'existing' }], accountReceivable: null, documents: [] });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(ConflictException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CANCELLED, billingRequests: [], accountReceivable: null, documents: [] });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(BadRequestException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: null, userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequests: [], accountReceivable: null, documents: [] });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(BadRequestException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-2', userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequests: [], accountReceivable: null, documents: [] });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces state transitions, audit history and terminal states', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.billingRequest.findUnique.mockResolvedValue(request());
    tx.billingRequest.update.mockResolvedValue(request({ status: BillingRequestStatus.IN_REVIEW, reviewedByUserId: 'admin-1', reviewedAt: now }));

    await service.update('request-1', { status: BillingRequestStatus.IN_REVIEW, reason: 'Revisión iniciada', notes: 'Validar datos' }, admin);
    expect(tx.billingRequestHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: 'REQUESTED', toStatus: 'IN_REVIEW', changedByUserId: 'admin-1', reason: 'Revisión iniciada', notes: 'Validar datos' }) });

    tx.billingRequest.findUnique.mockResolvedValue(request({ status: BillingRequestStatus.APPROVED }));
    await expect(service.update('request-1', { status: BillingRequestStatus.IN_REVIEW }, admin)).rejects.toBeInstanceOf(BadRequestException);
    tx.billingRequest.findUnique.mockResolvedValue(request({ status: BillingRequestStatus.REQUESTED }));
    await expect(service.update('request-1', { status: BillingRequestStatus.APPROVED }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits sellers to their own requests and REQUESTED text edits', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.billingRequest.findUnique.mockResolvedValue(request({ sale: { id: 'sale-1', userId: 'other-seller', locationId: 'loc-1', status: SaleStatus.CONFIRMED } }));
    await expect(service.update('request-1', { notes: 'Nota' }, seller)).rejects.toBeInstanceOf(ForbiddenException);
    tx.billingRequest.findUnique.mockResolvedValue(request({ status: BillingRequestStatus.IN_REVIEW }));
    await expect(service.update('request-1', { notes: 'Nota' }, seller)).rejects.toBeInstanceOf(ForbiddenException);
    tx.billingRequest.findUnique.mockResolvedValue(request());
    await expect(service.update('request-1', { status: BillingRequestStatus.IN_REVIEW }, seller)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('starts review through the explicit versioned and audited command', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.billingRequest.findUnique.mockResolvedValue(request({ version: 3, status: BillingRequestStatus.REQUESTED, creationIdempotencyKey: 'created-from-report', documents: [] }));
    tx.billingRequest.update.mockResolvedValue(request({ version: 4, status: BillingRequestStatus.IN_REVIEW }));

    await service.startReview('request-1', { expectedVersion: 3, reason: 'Validar expediente' }, admin);

    expect(tx.billingRequest.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'request-1', version: 3 }, data: expect.objectContaining({ status: BillingRequestStatus.IN_REVIEW, version: { increment: 1 } }) }));
    expect(tx.billingRequestHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: 'REQUESTED', toStatus: 'IN_REVIEW', changedByUserId: 'admin-1' }) });
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BILLING_REQUEST_IN_REVIEW', actorUserId: 'admin-1' }) });
  });
});
