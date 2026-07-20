import { ConflictException } from '@nestjs/common';
import { BillingRemediationService } from './billing-remediation.service';

describe('BillingRemediationService', () => {
  const actor = { id: 'admin-1', role: 'ADMIN' } as const;

  function setup(remediation: Record<string, unknown>, sale: Record<string, unknown>) {
    const tx = {
      $queryRaw: jest.fn(),
      billingDataRemediation: {
        findUnique: jest.fn().mockResolvedValue(remediation),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...remediation, ...data })),
      },
      sale: {
        findUnique: jest.fn().mockResolvedValue(sale),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...sale, ...data })),
      },
      legalEntity: { findFirst: jest.fn().mockResolvedValue({ id: 'legal-1', isActive: true }) },
      saleDocument: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      saleItem: { update: jest.fn() },
      billingAuditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    return { service: new BillingRemediationService(prisma as never), tx };
  }

  it('assigns an active legal entity and resolves only after validation', async () => {
    const remediation = { id: 'rem-1', code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, updatedAt: new Date('2026-07-19T12:00:00.000Z'), details: {} };
    const sale = { id: 'sale-1', legalEntityId: null, items: [], documents: [] };
    const { service, tx } = setup(remediation, sale);

    await service.resolve('rem-1', {
      expectedUpdatedAt: '2026-07-19T12:00:00.000Z',
      reason: 'Entidad emisora confirmada',
      correction: { legalEntityId: 'legal-1' },
    }, actor as never);

    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({ data: { legalEntityId: 'legal-1' } }));
    expect(tx.billingDataRemediation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolvedByUserId: 'admin-1' }) }));
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BILLING_REMEDIATION_RESOLVED' }) });
  });

  it('does not close a remediation while the inconsistency is still present', async () => {
    const remediation = { id: 'rem-1', code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', resolvedAt: null, updatedAt: new Date('2026-07-19T12:00:00.000Z'), details: {} };
    const { service, tx } = setup(remediation, { id: 'sale-1', legalEntityId: null, items: [], documents: [] });

    await expect(service.resolve('rem-1', {
      expectedUpdatedAt: '2026-07-19T12:00:00.000Z', reason: 'Validar corrección externa',
    }, actor as never)).rejects.toBeInstanceOf(ConflictException);

    expect(tx.billingDataRemediation.update).not.toHaveBeenCalled();
  });
});
