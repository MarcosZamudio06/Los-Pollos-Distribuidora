import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CollectionStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsService } from './payments.service';

function money(value: string) {
  return { toString: () => value };
}

function hashPayload(payload: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    accountReceivableId: 'ar-1',
    saleId: 'sale-1',
    customerId: 'customer-1',
    userId: 'collector-1',
    collectedByUserId: 'collector-1',
    collectionPass: null,
    amount: money('400'),
    paymentMethod: PaymentMethod.CASH,
    bankName: null,
    referenceNumber: null,
    appliedDocumentId: null,
    appliedDocumentType: null,
    operationalLocationId: null,
    routeId: null,
    routeSettlementId: null,
    pointOfSaleDailyCloseId: null,
    status: PaymentStatus.APPLIED,
    paidAt: new Date('2026-06-20T10:00:00.000Z'),
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    cancellationIdempotencyKey: null,
    cancellationPayloadHash: null,
    version: 2,
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
    accountReceivable: {
      id: 'ar-1',
      saleId: 'sale-1',
      outstandingAmount: money('600'),
      originalAmount: money('1000'),
      dueDate: new Date('2026-06-16T12:00:00.000Z'),
      status: CollectionStatus.PARTIALLY_PAID,
    },
    ...overrides,
  };
}

function createPrisma() {
  const prisma = {
    payment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    accountReceivable: { findUnique: jest.fn(), update: jest.fn() },
    sale: { update: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  return { service: new PaymentsService(prisma as unknown as PrismaService), prisma };
}

describe('PaymentsService', () => {
  it('cancels a collection payment and restores receivable balance transactionally', async () => {
    const { service, prisma } = createService();

    await expect(
      service.cancel('payment-1', { reason: 'Pago duplicado' } as any, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key-missing-version'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.findUnique.mockResolvedValue(createPayment());
    prisma.payment.update.mockResolvedValue({
      ...createPayment(),
      status: PaymentStatus.CANCELLED,
      cancelledAt: new Date('2026-06-21T10:00:00.000Z'),
      cancelledByUserId: 'admin-1',
      cancellationReason: 'Pago registrado por error',
      cancellationIdempotencyKey: 'cancel-key-1',
      cancellationPayloadHash: 'hash',
      version: 3,
    });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: null,
      status: CollectionStatus.UNPAID,
    });

    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago registrado por error', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-1',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({
        id: 'payment-1',
        status: PaymentStatus.CANCELLED,
        cancelledByUserId: 'admin-1',
        cancellationReason: 'Pago registrado por error',
      }),
      accountReceivable: expect.objectContaining({ id: 'ar-1', outstandingAmount: '1000', status: CollectionStatus.UNPAID }),
    });

    expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment-1', version: 2 },
      data: expect.objectContaining({
        status: PaymentStatus.CANCELLED,
        cancelledAt: expect.any(Date),
        cancelledByUserId: 'admin-1',
        cancellationReason: 'Pago registrado por error',
        cancellationIdempotencyKey: 'cancel-key-1',
        cancellationPayloadHash: expect.any(String),
        version: { increment: 1 },
      }),
    }));
    expect(prisma.accountReceivable.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ar-1' },
      data: expect.objectContaining({
        outstandingAmount: 1000,
        status: CollectionStatus.UNPAID,
        lastPaymentDate: null,
        paidAt: null,
      }),
    }));
  });

  it('rejects cancellation without reason, missing payment, already cancelled payment, or stale expectedVersion', async () => {
    const { service, prisma } = createService();

    await expect(
      service.cancel('payment-1', { reason: ' ', expectedVersion: 2 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.cancel('missing', { reason: 'Pago duplicado', expectedVersion: 2 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key'),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.payment.findUnique.mockResolvedValueOnce(createPayment({ status: PaymentStatus.CANCELLED }));
    await expect(
      service.cancel('payment-1', { reason: 'Pago duplicado', expectedVersion: 2 }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-key'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.payment.findUnique.mockResolvedValueOnce(createPayment({ version: 3 }));
    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago duplicado', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-version',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deduplicates cancellation retries by Idempotency-Key and rejects a reused key with different payload', async () => {
    const { service, prisma } = createService();
    const existingCancelled = createPayment({
      status: PaymentStatus.CANCELLED,
      cancelledAt: new Date('2026-06-21T10:00:00.000Z'),
      cancelledByUserId: 'admin-1',
      cancellationReason: 'Pago registrado por error',
      cancellationIdempotencyKey: 'cancel-key-1',
      cancellationPayloadHash: hashPayload({
        operation: 'CANCEL_PAYMENT',
        paymentId: 'payment-1',
        userId: 'admin-1',
        reason: 'Pago registrado por error',
        expectedVersion: 2,
      }),
    });
    prisma.payment.findFirst.mockResolvedValueOnce(existingCancelled);
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: null,
      status: CollectionStatus.UNPAID,
    });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: null,
      status: CollectionStatus.UNPAID,
    });

    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago registrado por error', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-1',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({ id: 'payment-1', status: PaymentStatus.CANCELLED }),
      accountReceivable: expect.objectContaining({ id: 'ar-1', outstandingAmount: '1000' }),
    });
    expect(prisma.payment.update).not.toHaveBeenCalled();

    prisma.payment.findFirst.mockResolvedValueOnce({
      ...existingCancelled,
      cancellationPayloadHash: 'different-hash',
    });
    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Otro motivo', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });



  it('maps stale optimistic update failures to ConflictException', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.findUnique.mockResolvedValue(createPayment());
    prisma.payment.update.mockRejectedValueOnce({ code: 'P2025' });

    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago registrado por error', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-stale-update',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deduplicates a simultaneous same-key cancellation after a unique-key race', async () => {
    const { service, prisma } = createService();
    const existingCancelled = createPayment({
      status: PaymentStatus.CANCELLED,
      cancelledAt: new Date('2026-06-21T10:00:00.000Z'),
      cancelledByUserId: 'admin-1',
      cancellationReason: 'Pago registrado por error',
      cancellationIdempotencyKey: 'cancel-race-key',
      cancellationPayloadHash: hashPayload({
        operation: 'CANCEL_PAYMENT',
        paymentId: 'payment-1',
        userId: 'admin-1',
        reason: 'Pago registrado por error',
        expectedVersion: 2,
      }),
    });
    prisma.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existingCancelled);
    prisma.payment.findUnique.mockResolvedValue(createPayment());
    prisma.payment.update.mockRejectedValueOnce({ code: 'P2002' });
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: null,
      status: CollectionStatus.UNPAID,
    });

    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago registrado por error', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-race-key',
      ),
    ).resolves.toEqual({
      payment: expect.objectContaining({ id: 'payment-1', status: PaymentStatus.CANCELLED }),
      accountReceivable: expect.objectContaining({ id: 'ar-1', outstandingAmount: '1000' }),
    });
    expect(prisma.accountReceivable.update).not.toHaveBeenCalled();
  });

  it('recalculates lastPaymentDate from non-cancelled payments after cancellation', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ paidAt: new Date('2026-06-18T10:00:00.000Z') });
    prisma.payment.findUnique.mockResolvedValue(createPayment());
    prisma.payment.update.mockResolvedValue({ ...createPayment(), status: PaymentStatus.CANCELLED });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: new Date('2026-06-18T10:00:00.000Z'),
      status: CollectionStatus.UNPAID,
    });

    await service.cancel(
      'payment-1',
      { reason: 'Pago registrado por error', expectedVersion: 2 },
      { id: 'admin-1', role: 'ADMIN' },
      'cancel-key-last-date',
    );

    expect(prisma.payment.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        accountReceivableId: 'ar-1',
        status: { not: PaymentStatus.CANCELLED },
        id: { not: 'payment-1' },
      },
      orderBy: { paidAt: 'desc' },
      select: { paidAt: true },
    });
    expect(prisma.accountReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastPaymentDate: new Date('2026-06-18T10:00:00.000Z') }),
      }),
    );
  });

  it('does not swallow Sale.collectionStatus update failures when cancelling a payment', async () => {
    const { service, prisma } = createService();
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.findUnique.mockResolvedValue(createPayment());
    prisma.payment.update.mockResolvedValue({ ...createPayment(), status: PaymentStatus.CANCELLED });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('1000'),
      daysOverdue: 5,
      lastPaymentDate: null,
      status: CollectionStatus.UNPAID,
    });
    prisma.sale.update.mockRejectedValue(new Error('sale update failed'));

    await expect(
      service.cancel(
        'payment-1',
        { reason: 'Pago registrado por error', expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'cancel-key-sale-update',
      ),
    ).rejects.toThrow('sale update failed');
  });
});
