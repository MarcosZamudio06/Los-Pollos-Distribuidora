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
    expect(result.items[0]).toMatchObject({ saleDocumentId: 'doc-1', total: '100.00', pendingInvoice: '100.00' });
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

  it('loads detail with one batched query and returns decimal strings', async () => {
    raw.mockResolvedValueOnce([{ ...row, items: [], requests: [], invoices: [], payments: [], delivery: null }]);

    const result = await service.detail('doc-1', admin);

    expect(raw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ saleDocumentId: 'doc-1', total: '100.00', items: [], requests: [] });
  });

  it('throws when detail is not visible or does not exist', async () => {
    raw.mockResolvedValueOnce([]);
    await expect(service.detail('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses one bounded query for export read-model rows', async () => {
    raw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ totalDocuments: 1n, totalPending: new Prisma.Decimal(100) }]);
    const result = await service.exportFile(query({ format: 'csv' }), admin);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(exporter.createFile).toHaveBeenCalledWith([expect.objectContaining({ total: '100.00' })], expect.objectContaining({ timeZone: 'America/Mexico_City', truncated: false }), 'csv');
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

  it('enforces the report and export RBAC matrix in the service layer', async () => {
    await expect(service.list(query(), { id: 'warehouse-1', name: 'Warehouse', role: 'WAREHOUSE' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(query(), { id: 'driver-1', name: 'Driver', role: 'DRIVER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportFile(query(), { id: 'seller-1', name: 'Seller', role: 'SELLER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportFile(query(), { id: 'collections-1', name: 'Collections', role: 'COLLECTIONS' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(raw).not.toHaveBeenCalled();
  });
});
