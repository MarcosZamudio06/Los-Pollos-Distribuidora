import { BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceCancellationService } from './invoice-cancellation.service';

describe('InvoiceCancellationService', () => {
  const actor = { id: 'billing-1', role: 'BILLING' };
  const invoice = {
    id: 'invoice-1', status: InvoiceStatus.ACTIVE, version: 3,
    cancelledAt: null, cancelledByUserId: null, cancellationReason: null,
    cancellationIdempotencyKey: null, cancellationPayloadHash: null,
    substitutedByInvoiceId: null, substitutes: null,
    documents: [{ id: 'application-1', reversedAt: null, itemApplications: [{ id: 'item-application-1', reversedAt: null }] }],
  };
  const tx = {
    $queryRaw: jest.fn(),
    invoice: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    invoiceSaleDocument: { updateMany: jest.fn() },
    invoiceSaleItemApplication: { updateMany: jest.fn() },
    billingAuditLog: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)), invoice: { findFirst: jest.fn() } };
  const service = new InvoiceCancellationService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.invoice.findFirst.mockResolvedValue(null);
    tx.invoice.findUnique.mockResolvedValue(invoice);
    tx.invoice.update.mockResolvedValue({ ...invoice, status: InvoiceStatus.CANCELLED, version: 4 });
  });

  it('cancels atomically, reverses applications, and audits the released balance', async () => {
    await service.cancel('invoice-1', { expectedVersion: 3, reason: 'Customer correction' }, actor, 'cancel-key-1');

    expect(tx.invoiceSaleItemApplication.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { invoiceSaleDocumentId: { in: ['application-1'] }, reversedAt: null },
      data: expect.objectContaining({ reversedByUserId: actor.id, reversalReason: 'Customer correction' }),
    }));
    expect(tx.invoiceSaleDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { invoiceId: 'invoice-1', reversedAt: null },
    }));
    expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invoice-1', version: 3 },
      data: expect.objectContaining({ status: InvoiceStatus.CANCELLED, cancellationIdempotencyKey: 'cancel-key-1', version: { increment: 1 } }),
    }));
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'INVOICE_CANCELLED', correlationId: 'cancel-key-1', reason: 'Customer correction' }) });
  });

  it('returns the original result for an identical idempotent retry', async () => {
    tx.invoice.findFirst.mockResolvedValue({ ...invoice, status: InvoiceStatus.CANCELLED, cancellationPayloadHash: expect.anything() });
    const firstHash = (service as any).hashPayload({ invoiceId: 'invoice-1', expectedVersion: 3, reason: 'Customer correction', actorUserId: actor.id });
    tx.invoice.findFirst.mockResolvedValue({ ...invoice, status: InvoiceStatus.CANCELLED, cancellationPayloadHash: firstHash });

    const result = await service.cancel('invoice-1', { expectedVersion: 3, reason: 'Customer correction' }, actor, 'cancel-key-1');
    expect(result.status).toBe(InvoiceStatus.CANCELLED);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it('rejects stale versions and incompatible substitution chains', async () => {
    tx.invoice.findUnique.mockResolvedValueOnce({ ...invoice, version: 4 });
    await expect(service.cancel('invoice-1', { expectedVersion: 3, reason: 'Correction' }, actor, 'key-a')).rejects.toBeInstanceOf(ConflictException);

    tx.invoice.findUnique.mockResolvedValueOnce({ ...invoice, substitutes: { id: 'original-1' } });
    await expect(service.cancel('invoice-1', { expectedVersion: 3, reason: 'Correction' }, actor, 'key-b')).rejects.toBeInstanceOf(BadRequestException);
  });
});
