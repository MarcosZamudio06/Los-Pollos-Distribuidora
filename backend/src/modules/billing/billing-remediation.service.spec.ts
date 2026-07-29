import { ConflictException } from '@nestjs/common';
import { BillingRemediationService } from './billing-remediation.service';
import { RemediationImpactAnalyzer } from './remediation-impact-analyzer';
import { SaleConsistencyValidator } from './sale-consistency-validator';

describe('BillingRemediationService', () => {
  const actor = { id: 'admin-1', role: 'ADMIN' } as const;

  function consistentSale(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sale-1', version: 4, legalEntityId: null, subtotal: '100.00', discount: '0.00', discountPercentage: '0.00', tax: '0.00', total: '100.00',
      discountAuthorizationId: null, discountAuthorization: null, paymentType: 'CASH_SALE',
      items: [{ id: 'item-1', version: 1, subtotal: '100.00', discount: '0.00', taxableBase: '100.00', tax: '0.00', total: '100.00' }],
      payments: [{ status: 'APPLIED', amount: '100.00' }], accountReceivable: null, documents: [],
      pointOfSaleDailyClose: null, cashShift: null, route: null,
      ...overrides,
    };
  }

  function setup(remediation: Record<string, unknown>, sale: Record<string, unknown>) {
    let currentRemediation = remediation;
    let currentSale = sale;
    const tx = {
      $queryRaw: jest.fn(),
      billingDataRemediation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentRemediation)),
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(currentRemediation)),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          currentRemediation = { ...currentRemediation, ...data, version: Number(currentRemediation.version) + 1 };
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...remediation, ...data })),
      },
      sale: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentSale)),
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(currentSale)),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          currentSale = { ...currentSale, ...data, version: Number(currentSale.version) + 1 };
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...sale, ...data })),
      },
      legalEntity: { findFirst: jest.fn().mockResolvedValue({ id: 'legal-1', isActive: true }) },
      saleDocument: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      saleItem: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      billingAuditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    return { service: new BillingRemediationService(prisma as never, new RemediationImpactAnalyzer(), new SaleConsistencyValidator()), tx };
  }

  it('assigns an active legal entity and resolves only after validation', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, updatedAt: new Date('2026-07-19T12:00:00.000Z'), details: {} };
    const sale = consistentSale();
    const { service, tx } = setup(remediation, sale);

    await service.resolve('rem-1', {
      expectedRemediationVersion: 2,
      expectedSaleVersion: 4,
      expectedDocumentVersions: [],
      reason: 'Entidad emisora confirmada',
      correction: { legalEntityId: 'legal-1' },
    }, actor as never, 'resolve-key-1');

    expect(tx.sale.updateMany).toHaveBeenCalledWith({ where: { id: 'sale-1', version: 4 }, data: { legalEntityId: 'legal-1', version: { increment: 1 } } });
    expect(tx.billingDataRemediation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rem-1', version: 2, resolvedAt: null }, data: expect.objectContaining({ resolvedByUserId: 'admin-1', resolutionIdempotencyKey: 'resolve-key-1', version: { increment: 1 } }) }));
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BILLING_REMEDIATION_RESOLVED' }) });
  });

  it('does not close a remediation while the inconsistency is still present', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, updatedAt: new Date('2026-07-19T12:00:00.000Z'), details: {} };
    const { service, tx } = setup(remediation, { id: 'sale-1', version: 4, legalEntityId: null, items: [], documents: [] });

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Validar corrección externa',
    }, actor as never, 'resolve-key-2')).rejects.toBeInstanceOf(ConflictException);

    expect(tx.billingDataRemediation.updateMany).not.toHaveBeenCalled();
  });

  it('runs impact analysis before changing a monetary remediation', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'INVALID_SALE_TOTAL', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, updatedAt: new Date('2026-07-19T12:00:00.000Z'), details: {} };
    const sale = {
      id: 'sale-1', version: 4, status: 'CONFIRMED', paymentType: 'CASH_SALE', legalEntityId: 'legal-1',
      subtotal: '1000.00', discount: '0.00', tax: '0.00', total: '1000.00', items: [], documents: [],
      payments: [{ status: 'APPLIED', amount: '1000.00' }], accountReceivable: null,
      pointOfSaleDailyClose: null, cashShift: null, route: null,
    };
    const { service, tx } = setup(remediation, sale);

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Corregir total inconsistente',
      correction: { subtotal: '900.00', discount: '0.00', tax: '0.00', total: '900.00' },
    }, actor as never, 'resolve-key-3')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REMEDIATION_REQUIRES_ACCOUNTING_ADJUSTMENT',
        blockers: [expect.objectContaining({ code: 'APPLIED_PAYMENT_INCOMPATIBLE' })],
      }),
    });

    expect(tx.sale.updateMany).not.toHaveBeenCalled();
    expect(tx.billingDataRemediation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale sale version before applying a correction', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = { id: 'sale-1', version: 5, legalEntityId: null, items: [], documents: [] };
    const { service, tx } = setup(remediation, sale);

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Stale correction',
      correction: { legalEntityId: 'legal-1' },
    }, actor as never, 'resolve-key-stale')).rejects.toThrow('VERSION_CONFLICT');

    expect(tx.sale.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale item versions before changing monetary lines', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'UNALLOCATED_ITEM_AMOUNTS', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = {
      id: 'sale-1', version: 4, status: 'CONFIRMED', paymentType: 'CREDIT_SALE', total: '100.00', legalEntityId: 'legal-1',
      items: [{ id: 'item-1', version: 3, subtotal: '100.00', discount: '0.00', tax: '0.00', total: '100.00' }],
      documents: [], payments: [], accountReceivable: null, pointOfSaleDailyClose: null, cashShift: null, route: null,
    };
    const { service, tx } = setup(remediation, sale);

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Stale item correction',
      correction: { items: [{ saleItemId: 'item-1', expectedVersion: 2, subtotal: '100.00', discount: '0.00', tax: '0.00', total: '100.00' }] },
    }, actor as never, 'resolve-key-item')).rejects.toThrow('VERSION_CONFLICT');

    expect(tx.saleItem.updateMany).not.toHaveBeenCalled();
  });

  it('rejects missing or stale versions for ambiguous document candidates', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'AMBIGUOUS_SALE_DOCUMENT', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = {
      id: 'sale-1', version: 4, documentType: 'SIMPLE_NOTE', legalEntityId: 'legal-1', items: [],
      documents: [
        { id: 'document-1', version: 2, documentType: 'SIMPLE_NOTE', status: 'ISSUED', billingRequestDocuments: [], invoiceDocuments: [] },
        { id: 'document-2', version: 5, documentType: 'SIMPLE_NOTE', status: 'ISSUED', billingRequestDocuments: [], invoiceDocuments: [] },
      ],
    };
    const { service, tx } = setup(remediation, sale);

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4,
      expectedDocumentVersions: [{ saleDocumentId: 'document-1', expectedVersion: 2 }],
      reason: 'Choose primary document', correction: { selectedSaleDocumentId: 'document-1' },
    }, actor as never, 'resolve-key-document')).rejects.toThrow('VERSION_CONFLICT');

    expect(tx.saleDocument.updateMany).not.toHaveBeenCalled();
  });

  it('replays the same idempotent resolution without applying it twice', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = consistentSale();
    const { service, tx } = setup(remediation, sale);
    const command = {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Assign legal entity',
      correction: { legalEntityId: 'legal-1' },
    };

    const first = await service.resolve('rem-1', command, actor as never, 'resolve-key-replay');
    tx.billingDataRemediation.findFirst.mockImplementation(() => Promise.resolve(first));
    const replay = await service.resolve('rem-1', command, actor as never, 'resolve-key-replay');

    expect(replay).toBe(first);
    expect(tx.sale.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.billingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = consistentSale();
    const { service, tx } = setup(remediation, sale);
    const command = {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Assign legal entity',
      correction: { legalEntityId: 'legal-1' },
    };
    const first = await service.resolve('rem-1', command, actor as never, 'resolve-key-conflict');
    tx.billingDataRemediation.findFirst.mockImplementation(() => Promise.resolve(first));

    await expect(service.resolve('rem-1', { ...command, reason: 'Different reason' }, actor as never, 'resolve-key-conflict'))
      .rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(tx.sale.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not resolve INVALID_SALE_TOTAL when item totals still contradict the header', async () => {
    const remediation = { id: 'rem-1', version: 2, code: 'INVALID_SALE_TOTAL', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, details: {} };
    const sale = {
      id: 'sale-1', version: 4, legalEntityId: 'legal-1', subtotal: '100.00', discount: '0.00', discountPercentage: '0.00', tax: '0.00', total: '100.00',
      discountAuthorizationId: null, discountAuthorization: null, paymentType: 'CASH_SALE',
      items: [{ id: 'item-1', version: 1, subtotal: '90.00', discount: '0.00', taxableBase: '90.00', tax: '0.00', total: '90.00' }],
      payments: [{ status: 'APPLIED', amount: '100.00' }], accountReceivable: null, documents: [],
      pointOfSaleDailyClose: null, cashShift: null, route: null,
    };
    const { service, tx } = setup(remediation, sale);

    await expect(service.resolve('rem-1', {
      expectedRemediationVersion: 2, expectedSaleVersion: 4, expectedDocumentVersions: [], reason: 'Validate external correction',
    }, actor as never, 'resolve-key-canonical')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SALE_CONSISTENCY_VALIDATION_FAILED',
        findings: expect.arrayContaining([expect.objectContaining({ code: 'ITEM_TOTALS_MISMATCH' })]),
      }),
    });
    expect(tx.billingDataRemediation.updateMany).not.toHaveBeenCalled();
  });
});
