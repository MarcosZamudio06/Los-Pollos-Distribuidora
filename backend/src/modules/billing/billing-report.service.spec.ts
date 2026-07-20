import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingReportService } from './billing-report.service';
import { BillingReportQueryDto } from './dto/billing-report-query.dto';

describe('BillingReportService', () => {
  const raw = jest.fn();
  const auditCreate = jest.fn();
  const prisma = { $queryRaw: raw, billingAuditLog: { create: auditCreate } };
  const exporter = { createFile: jest.fn().mockResolvedValue({ stream: 'stream', contentType: 'text/csv', fileName: 'file.csv' }) };
  const service = new BillingReportService(prisma as never, exporter as never);
  const admin = { id: 'admin-1', name: 'Admin', role: 'ADMIN' };
  const query = (overrides: Partial<BillingReportQueryDto> = {}) =>
    Object.assign(new BillingReportQueryDto(), overrides);
  const row = {
    saleDocumentId: 'doc-1', saleId: 'sale-1', saleNumber: 'V-1', issuedAt: new Date('2026-07-18T12:00:00Z'),
    documentType: 'SIMPLE_NOTE', documentStatus: 'ISSUED', physicalFolio: 'N-1', locationId: 'loc-1',
    locationName: 'Centro', customerId: 'customer-1', customerName: 'Cliente', taxId: 'XAXX010101000',
    sellerId: 'seller-1', sellerName: 'Seller', routeId: null, routeName: null, currencyCode: 'MXN',
    legalEntityId: 'le-1', total: new Prisma.Decimal('100.00'), activeRequested: new Prisma.Decimal('0'),
    activeInvoiced: new Prisma.Decimal('0'), pendingInvoice: new Prisma.Decimal('100.00'),
    pendingSubtotal: new Prisma.Decimal('90.00'), pendingTax: new Prisma.Decimal('10.00'), pendingTotal: new Prisma.Decimal('100.00'), requestableItems: [],
    activePaid: new Prisma.Decimal('20.00'), collectionBalance: new Prisma.Decimal('80.00'),
    billingStatus: 'BILLABLE', blockingCodes: [], deliveryStatus: 'DELIVERED', paymentStatus: 'PARTIALLY_PAID',
    fiscalProfileComplete: true, deadline: new Date('2026-08-17T12:00:00Z'), updatedAt: new Date('2026-07-18T12:30:00Z'),
  };

  beforeEach(() => { raw.mockReset(); auditCreate.mockReset(); exporter.createFile.mockClear(); });

  it('uses exactly one row query and one summary query for a paginated list', async () => {
    raw.mockResolvedValueOnce([{ ...row, totalCount: 1n }]).mockResolvedValueOnce([{
      totalDocuments: 1n, billableDocuments: 1n, blockedDocuments: 0n,
      totalBillable: new Prisma.Decimal(100), totalRequested: new Prisma.Decimal(0),
      totalInvoiced: new Prisma.Decimal(0), totalPending: new Prisma.Decimal(100),
    }]);

    const result = await service.list(query(), admin);

    expect(raw).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toMatchObject({ saleDocumentId: 'doc-1', total: '100.00', pendingSubtotal: '90.00', pendingTax: '10.00', pendingTotal: '100.00' });
    expect(JSON.stringify(raw.mock.calls[0][0])).toContain('requestableItems');
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
    expect(result.summary.totalPending).toBe('100.00');
    expect(result).toEqual(expect.objectContaining({ generatedAt: expect.any(String), dataAsOf: expect.any(String), freshnessSeconds: expect.any(Number), isStale: expect.any(Boolean) }));
  });

  it('applies SELLER ownership scope to list and summary queries', async () => {
    raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await service.list(query(), { id: 'seller-1', name: 'Seller', role: 'SELLER' });

    const serialized = raw.mock.calls.map(([query]) => JSON.stringify(query));
    expect(serialized.every((query) => query.includes('seller-1'))).toBe(true);
  });

  it('treats dateTo as an exclusive boundary at the start of the following day', async () => {
    raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.list(query({ dateFrom: '2026-07-01', dateTo: '2026-07-19' }), admin);

    const reportQuery = raw.mock.calls[0][0];
    expect(reportQuery.strings.join('')).toContain('b."issuedAt" < ');
    expect(reportQuery.strings.join('')).not.toContain('b."issuedAt" <= ');
    expect(reportQuery.values).toContainEqual(new Date('2026-07-20T00:00:00.000Z'));
  });

  it('loads detail with one batched query and returns decimal strings', async () => {
    raw.mockResolvedValueOnce([{ ...row, items: [], requests: [], activeInvoices: [{ id: 'invoice-active' }], invoiceHistory: [{ id: 'invoice-cancelled' }], payments: [], delivery: null }]);

    const result = await service.detail('doc-1', admin);

    expect(raw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ saleDocumentId: 'doc-1', total: '100.00', items: [], requests: [], activeInvoices: [{ id: 'invoice-active' }], invoiceHistory: [{ id: 'invoice-cancelled' }] });
    expect(result).not.toHaveProperty('invoices');
    const sql = raw.mock.calls[0][0].strings.join('');
    expect(sql).toContain('AS "activeInvoices"');
    expect(sql).toContain('AS "invoiceHistory"');
    expect(sql).toContain('idoc."reversedAt" IS NULL AND i."status" = \'ACTIVE\'');
    expect(sql).toContain('idoc."reversedAt" IS NOT NULL OR i."status" <> \'ACTIVE\'');
  });

  it('throws when detail is not visible or does not exist', async () => {
    raw.mockResolvedValueOnce([]);
    await expect(service.detail('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses one bounded query for export read-model rows', async () => {
    raw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ totalDocuments: 1n, billableDocuments: 1n, blockedDocuments: 0n, totalBillable: new Prisma.Decimal(100), totalRequested: new Prisma.Decimal(0), totalInvoiced: new Prisma.Decimal(0), totalPending: new Prisma.Decimal(100), totalCollected: new Prisma.Decimal(20), totalReceivable: new Prisma.Decimal(80) }]);
    const result = await service.exportFile(query({ format: 'csv' }), admin);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(exporter.createFile).toHaveBeenCalledWith([expect.objectContaining({ total: '100.00' })], expect.objectContaining({ timeZone: 'America/Mexico_City', truncated: false }), 'csv');
    expect(exporter.createFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ totals: expect.objectContaining({ billableDocuments: 1, totalCollected: '20.00', totalReceivable: '80.00' }) }), 'csv');
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin-1', action: 'BILLING_REPORT_EXPORTED', entityType: 'BillingReportExport' }) });
    expect(result).toEqual(expect.objectContaining({ fileName: 'file.csv' }));
  });

  it('applies identical filters to table, summary, and export-source totals', async () => {
    const filters = {
      page: 1, limit: 25, sortBy: 'issuedAt', sortOrder: 'desc' as const,
      search: 'reconciliation-needle', customerId: 'customer-filter',
      billingStatus: 'BLOCKED' as const, hasRequest: true,
    };
    raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.list(query(filters), admin);
    await service.exportFile(query({ ...filters, format: 'csv' }), admin);

    expect(raw).toHaveBeenCalledTimes(4);
    const serializedQueries = raw.mock.calls.map(([query]) => JSON.stringify(query));
    for (const query of serializedQueries) {
      expect(query).toContain('reconciliation-needle');
      expect(query).toContain('customer-filter');
      expect(query).toContain('BLOCKED');
      expect(query).toContain('true');
    }
  });

  it('assigns monetary amounts only to the primary billable sale document', async () => {
    raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.list(query(), admin);

    const readModelSql = raw.mock.calls[0][0].strings.join('');
    expect(readModelSql).toContain('FROM "BillingReportableNoteReadModel"');
    expect(readModelSql).not.toContain('CASE');
  });

  it('delegates eligibility, delivery, deadline, and timezone to the canonical read model', async () => {
    raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await service.list(query(), admin);
    const sql = raw.mock.calls[0][0].strings.join('');
    expect(sql).toContain('FROM "BillingReportableNoteReadModel"');
    expect(sql).not.toContain('bp."billableDocumentTypes"');
  });

  it('reserves only the unconsumed remainder of active billing requests', async () => {
    raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.list(query(), admin);

    const readModelSql = raw.mock.calls[0][0].strings.join('');
    expect(readModelSql).toContain('FROM "BillingReportableNoteReadModel"');
  });

  it('enforces the report and export RBAC matrix in the service layer', async () => {
    await expect(service.list(query(), { id: 'warehouse-1', name: 'Warehouse', role: 'WAREHOUSE' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(query(), { id: 'driver-1', name: 'Driver', role: 'DRIVER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportFile(query(), { id: 'seller-1', name: 'Seller', role: 'SELLER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportFile(query(), { id: 'collections-1', name: 'Collections', role: 'COLLECTIONS' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(raw).not.toHaveBeenCalled();
  });
});
