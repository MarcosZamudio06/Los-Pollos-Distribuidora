import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BillingRequestStatus, SaleStatus } from '@prisma/client';
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
    customer: { id: 'customer-1', name: 'Cliente Uno' }, accountReceivable: null, history: [],
    ...overrides,
  };
}

function createPrisma() {
  const tx = {
    sale: { findUnique: jest.fn() },
    billingRequest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    billingRequestHistory: { create: jest.fn() },
    accountReceivable: { update: jest.fn() },
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

describe('BillingRequestsService', () => {
  it('creates a request only for a confirmed customer sale and links an existing receivable', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.sale.findUnique.mockResolvedValue({ id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequest: null, accountReceivable: { id: 'ar-1' } });
    tx.billingRequest.create.mockResolvedValue(request());
    tx.billingRequest.update.mockResolvedValue(request());
    tx.billingRequest.findUnique.mockResolvedValue(request());

    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: ' Cliente solicita seguimiento ' }, seller)).resolves.toMatchObject({ id: 'request-1', status: 'REQUESTED' });
    expect(tx.billingRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ saleId: 'sale-1', customerId: 'customer-1', reason: 'Cliente solicita seguimiento' }) }));
  });

  it('rejects duplicate, cancelled, customerless and mismatched-customer sales', async () => {
    const { prisma, tx } = createPrisma();
    const service = new BillingRequestsService(prisma as unknown as PrismaService);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequest: { id: 'existing' }, accountReceivable: null });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(ConflictException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-1', userId: 'seller-1', status: SaleStatus.CANCELLED, billingRequest: null, accountReceivable: null });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(BadRequestException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: null, userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequest: null, accountReceivable: null });
    await expect(service.create({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Razón' }, seller)).rejects.toBeInstanceOf(BadRequestException);
    tx.sale.findUnique.mockResolvedValueOnce({ id: 'sale-1', customerId: 'customer-2', userId: 'seller-1', status: SaleStatus.CONFIRMED, billingRequest: null, accountReceivable: null });
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
});
