import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';

describe('PointOfSaleDailyCloseService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    cashMovement: { create: jest.fn(), findUnique: jest.fn() },
    scaleTicketReference: { create: jest.fn(), findUnique: jest.fn() },
    sale: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    saleDocument: { findFirst: jest.fn() },
    payment: { findMany: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    dailyCloseInventoryCount: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    dailyCloseEvent: { create: jest.fn() },
    dailyCloseSnapshot: { create: jest.fn() },
    product: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new PointOfSaleDailyCloseService(prisma as never);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.dailyCloseInventoryCount.findMany.mockResolvedValue([]);
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.cashMovement.findUnique.mockResolvedValue(null);
    prisma.scaleTicketReference.findUnique.mockResolvedValue(null);
    prisma.dailyCloseInventoryCount.findUnique.mockResolvedValue(null);
    prisma.sale.updateMany.mockResolvedValue({ count: 0 });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    prisma.inventoryMovement.updateMany.mockResolvedValue({ count: 0 });
    prisma.dailyCloseEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.dailyCloseSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  });

  it('rejects opening an inactive location', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: false });
    await expect(service.open({ operationalLocationId: 'loc-1', businessDate: '2026-07-17' }, { id: 'u1', role: 'ADMIN' } as never))
      .rejects.toThrow(new BadRequestException('LOCATION_INACTIVE'));
  });

  it('rejects opening a daily close for a location that is not a point of sale', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-warehouse', isActive: true, type: 'WAREHOUSE' });

    await expect(service.open(
      { operationalLocationId: 'loc-warehouse', businessDate: '2026-07-17' },
      { id: 'u1', role: 'ADMIN' } as never,
    )).rejects.toThrow(new BadRequestException('LOCATION_NOT_POINT_OF_SALE'));

    expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
  });

  it('rejects opening a close after the current operational day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-22T01:00:00.000Z'));
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true, type: 'BRANCH' });

    try {
      await expect(service.open(
        { operationalLocationId: 'loc-1', businessDate: '2026-07-22' },
        { id: 'u1', role: 'ADMIN' } as never,
      )).rejects.toThrow(new BadRequestException('DAILY_CLOSE_FUTURE_DATE'));

      expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a duplicate non-cancelled close', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true, type: 'BRANCH' });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1' });
    await expect(service.open({ operationalLocationId: 'loc-1', businessDate: '2026-07-17' }, { id: 'u1', role: 'ADMIN' } as never))
      .rejects.toThrow(new ConflictException('DAILY_CLOSE_ALREADY_EXISTS'));
  });

  it('maps a concurrent daily close insert conflict to the domain error', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true, type: 'BRANCH' });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
    (prisma as any).$transaction = jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.19.3' },
    ));

    await expect(service.open(
      { operationalLocationId: 'loc-1', businessDate: '2026-07-17' },
      { id: 'u1', role: 'ADMIN' } as never,
    )).rejects.toThrow(new ConflictException('DAILY_CLOSE_ALREADY_EXISTS'));
  });

  it('rejects cancelling a closed daily close', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'CLOSED',
      sales: [],
      updatedAt: new Date(),
    });
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancel(
      'close-1',
      { version: 1, reason: 'Cancelar por error' },
      { id: 'admin-1', role: 'ADMIN' } as never,
    )).rejects.toThrow(new BadRequestException('DAILY_CLOSE_INVALID_STATUS'));

    expect(prisma.pointOfSaleDailyClose.updateMany).not.toHaveBeenCalled();
  });

  it('reopens a reviewed daily close to draft', async () => {
    const reviewed = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'REVIEWED',
      sales: [],
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(reviewed)
      .mockResolvedValueOnce({ ...reviewed, status: 'DRAFT' });
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await service.reopen(
      'close-1',
      { version: 1, reason: 'Corregir conteo' },
      { id: 'admin-1', role: 'ADMIN' } as never,
    );

    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'REVIEWED' }),
      data: expect.objectContaining({ status: 'DRAFT' }),
    }));
  });

  it('rejects an expense outside the operational day before creating the cash movement', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });

    await expect(service.addExpense(
      'close-1',
      { amount: 100, reason: 'Compra operativa', occurredAt: '2026-07-17T05:59:59.999Z' },
      { id: 'admin-1', role: 'ADMIN' } as never,
      'expense-key-1',
    )).rejects.toThrow(new BadRequestException('EXPENSE_OUTSIDE_OPERATIONAL_DAY'));

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a scale ticket whose captured date differs from the daily close', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });

    await expect(service.addScaleTicket(
      'close-1',
      { physicalFolio: 'BAS-42', capturedDate: '2026-07-16', weightKg: 2.5 },
      { id: 'admin-1', role: 'ADMIN' } as never,
      'scale-key-1',
    )).rejects.toThrow(new BadRequestException('SCALE_TICKET_DATE_MISMATCH'));

    expect(prisma.scaleTicketReference.create).not.toHaveBeenCalled();
  });

  it('links a manually captured scale ticket to its matching scale sale and document', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1', operationalLocationId: 'loc-1', businessDate: new Date('2026-07-17T00:00:00.000Z'), status: 'DRAFT', sales: [], updatedAt: new Date(),
    });
    prisma.saleDocument.findFirst.mockResolvedValue({ id: 'doc-scale-1', saleId: 'sale-scale-1' });
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-scale-1' });
    prisma.scaleTicketReference.create.mockResolvedValue({ id: 'reference-1' });
    jest.spyOn(service as any, 'recalculate').mockResolvedValue({ sales: [], updatedAt: new Date() });

    await service.addScaleTicket('close-1', {
      physicalFolio: 'BAS-001', capturedDate: '2026-07-17', netWeightKg: 25, grossWeightKg: 26.2, tareWeightKg: 1.2,
      saleId: 'sale-scale-1', saleDocumentId: 'doc-scale-1',
    }, { id: 'seller-1', role: 'ADMIN' } as never, 'scale-key-2');

    expect(prisma.scaleTicketReference.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      saleId: 'sale-scale-1', saleDocumentId: 'doc-scale-1', grossWeightKg: 26.2, tareWeightKg: 1.2,
      netWeightKg: 25, weightKg: 25, captureSource: 'MANUAL',
    }) }));
  });

  it('syncs confirmed branch sales even when they are assigned to a route', async () => {
    const tx = {
      sale: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inventoryMovement: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await (service as any).syncOperations(
      tx,
      'close-1',
      'loc-1',
      new Date('2026-07-17T06:00:00.000Z'),
      new Date('2026-07-18T06:00:00.000Z'),
    );

    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: {
        locationId: 'loc-1',
        createdAt: { gte: new Date('2026-07-17T06:00:00.000Z'), lt: new Date('2026-07-18T06:00:00.000Z') },
        status: 'CONFIRMED',
      },
      data: { pointOfSaleDailyCloseId: 'close-1' },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ routeId: null }),
    }));
  });

  it('uses America/Mexico_City boundaries for the operational day', () => {
    expect((service as any).operationalDay(new Date('2026-07-17T00:00:00.000Z'))).toEqual({
      from: new Date('2026-07-17T06:00:00.000Z'),
      to: new Date('2026-07-18T06:00:00.000Z'),
    });
  });

  it('rejects a seller attempting to access or change a close from another location', async () => {
    const seller = { id: 'seller-1', role: 'SELLER' } as never;
    prisma.user.findUnique.mockResolvedValue({ operationalLocationId: 'loc-seller', isActive: true });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-other',
      operationalLocationId: 'loc-other',
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });

    await expect(service.get('close-other', seller)).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(service.validate('close-other', seller)).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(service.refresh('close-other', seller)).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(service.addExpense('close-other', { amount: 10, reason: 'Gasto' }, seller, 'expense-key-2')).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(service.addScaleTicket('close-other', { physicalFolio: 'B-1', capturedDate: '2026-07-17', weightKg: 1 }, seller, 'scale-key-3')).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(prisma.scaleTicketReference.create).not.toHaveBeenCalled();
  });

  it('rejects a seller list query for another location', async () => {
    prisma.user.findUnique.mockResolvedValue({ operationalLocationId: 'loc-seller', isActive: true });

    await expect(
      service.list({ operationalLocationId: 'loc-other' }, { id: 'seller-1', role: 'SELLER' } as never),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.pointOfSaleDailyClose.findMany).not.toHaveBeenCalled();
  });

  it('rejects a seller opening a close outside the assigned location', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-other', isActive: true, type: 'BRANCH' });
    prisma.user.findUnique.mockResolvedValue({ operationalLocationId: 'loc-seller', isActive: true });

    await expect(
      service.open({ operationalLocationId: 'loc-other', businessDate: '2026-07-17' }, { id: 'seller-1', role: 'SELLER' } as never),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
  });

  it('scopes a seller list to the assigned location without loading detail relations', async () => {
    prisma.user.findUnique.mockResolvedValue({ operationalLocationId: 'loc-seller', isActive: true });
    prisma.pointOfSaleDailyClose.findMany.mockResolvedValue([
      { id: 'close-1', operationalLocationId: 'loc-seller', businessDate: new Date(), status: 'DRAFT', updatedAt: new Date() },
    ]);

    const result = await service.list({}, { id: 'seller-1', role: 'SELLER' } as never);

    expect(prisma.pointOfSaleDailyClose.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { operationalLocationId: 'loc-seller' },
    }));
    expect(result).toEqual([expect.objectContaining({ id: 'close-1', operationalLocationId: 'loc-seller' })]);
  });

  it('projects only inventory to WAREHOUSE and only financial data to COLLECTIONS', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      updatedAt: new Date(),
      sales: [],
      payments: [{ id: 'payment-1' }],
      cashMovements: [{ id: 'cash-1' }],
      inventoryMovements: [{ id: 'movement-1' }],
      lines: [{ id: 'line-1', amount: 100 }],
      scaleTicketReferences: [{ id: 'ticket-1', amount: 100, unitPrice: 50, weightKg: 2 }],
      purchaseCostTotal: 80,
      grossProfitTotal: 20,
      netProfitTotal: 10,
      totalInputKg: 2,
      totalSoldKg: 1,
      totalRemainingKg: 1,
      totalShortageKg: 0,
      totalSurplusKg: 0,
      scaleReportedKg: 1,
      scaleDifferenceKg: 0,
      cashTotal: 100,
      cardVoucherTotal: 0,
      transferTotal: 0,
      expenseTotal: 0,
      grossSalesTotal: 100,
      netCashExpected: 100,
      cashDifferenceTotal: 0,
    };
    prisma.user.findUnique.mockResolvedValue({ operationalLocationId: 'loc-1', isActive: true });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(close);

    const warehouse = await service.get('close-1', { id: 'warehouse-1', role: 'WAREHOUSE' } as never);
    const collections = await service.get('close-1', { id: 'collections-1', role: 'COLLECTIONS' } as never);

    expect(warehouse).toHaveProperty('inventoryMovements');
    expect(warehouse).not.toHaveProperty('payments');
    expect(warehouse).not.toHaveProperty('purchaseCostTotal');
    expect(collections).toHaveProperty('payments');
    expect(collections).not.toHaveProperty('inventoryMovements');
    expect(collections).not.toHaveProperty('purchaseCostTotal');
  });

  it('reports route payments and unconfirmed sales as excluded operations', async () => {
    const businessDate = new Date('2026-07-17T00:00:00.000Z');
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1', operationalLocationId: 'loc-1', businessDate, status: 'DRAFT', sales: [], updatedAt: new Date(),
    });
    prisma.payment.findMany.mockResolvedValue([{ id: 'payment-route-1', amount: 250, paidAt: new Date('2026-07-17T10:00:00.000Z'), referenceNumber: 'RUTA-100' }]);
    prisma.sale.findMany.mockResolvedValue([{ id: 'sale-draft-1', saleNumber: 'V-100', total: 80, createdAt: new Date('2026-07-17T11:00:00.000Z'), status: 'DRAFT' }]);

    const result = await service.get('close-1', { id: 'admin-1', role: 'ADMIN' } as never);

    expect(result).toMatchObject({ excludedOperations: [
      { id: 'payment-route-1', type: 'PAYMENT', reference: 'RUTA-100' },
      { id: 'sale-draft-1', type: 'SALE', reference: 'V-100' },
    ] });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ routeId: { not: null } }),
    }));
  });

  it('excludes registered payments from all daily-close income totals', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      sales: [],
      payments: [
        { paymentMethod: 'CASH', amount: 120, status: 'APPLIED' },
        { paymentMethod: 'CASH', amount: 50, status: 'REGISTERED' },
        { paymentMethod: 'CARD', amount: 30, status: 'APPLIED' },
        { paymentMethod: 'VOUCHER', amount: 20, status: 'REGISTERED' },
        { paymentMethod: 'TRANSFER', amount: 40, status: 'APPLIED' },
        { paymentMethod: 'DEPOSIT', amount: 10, status: 'REGISTERED' },
      ],
      cashCountedTotal: 100,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValueOnce(close).mockResolvedValueOnce(close);
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({ ...close, cashTotal: 120, cardVoucherTotal: 30, transferTotal: 40, netCashExpected: 120, cashDifferenceTotal: -20 });

    const result = await (service as any).recalculate('close-1');

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cashTotal: 120, cardVoucherTotal: 30, transferTotal: 40, netCashExpected: 120, cashDifferenceTotal: -20 }),
    }));
    expect(result.cashDifferenceTotal).toBe(-20);
  });

  it('persists a physical count without creating an inventory movement', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1', operationalLocationId: 'loc-1', status: 'DRAFT', businessDate: new Date('2026-07-17T00:00:00.000Z'), sales: [], updatedAt: new Date(),
    });
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
    prisma.dailyCloseInventoryCount.create.mockResolvedValue({ id: 'count-1' });
    jest.spyOn(service as any, 'recalculate').mockResolvedValue({ sales: [], updatedAt: new Date() });

    await service.createInventoryCount('close-1', { productId: 'product-1', physicalQuantityKg: 4.5, reason: 'Conteo de anaquel' }, { id: 'seller-1', role: 'ADMIN' } as never, 'count-key-1');

    expect(prisma.dailyCloseInventoryCount.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ physicalQuantityKg: 4.5, countedByUserId: 'seller-1' }) }));
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('requires counted cash before validation can succeed', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 1,
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      sales: [],
      payments: [],
      cashCountedTotal: null,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close)
      .mockResolvedValue(close);
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.pointOfSaleDailyClose.update
      .mockResolvedValueOnce({ ...close, netCashExpected: 0, cashDifferenceTotal: null })
      .mockResolvedValueOnce(close);

    const result = await service.validate('close-1', { id: 'seller-1', role: 'SELLER' } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'CASH_COUNT_REQUIRED' }));
    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastValidationAttemptAt: expect.any(Date), lastValidatedAt: null, validatedSourceVersion: null }),
    }));
  });

  it('marks a source version as validated only after a successful validation', async () => {
    const close = { id: 'close-1', operationalLocationId: 'loc-1', status: 'DRAFT', version: 4, sales: [], updatedAt: new Date() };
    const recalculated = { ...close, lines: [], cashCountedTotal: 0, scaleDifferenceKg: 0, cashDifferenceTotal: 0 };
    jest.spyOn(service as any, 'requireDraft').mockResolvedValue(close);
    jest.spyOn(service as any, 'recalculate').mockResolvedValue(recalculated);
    prisma.pointOfSaleDailyClose.update.mockResolvedValue(recalculated);

    const result = await service.validate('close-1', { id: 'seller-1', role: 'SELLER' } as never);

    expect(result.valid).toBe(true);
    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastValidationAttemptAt: expect.any(Date), lastValidatedAt: expect.any(Date), validatedSourceVersion: 4 }),
    }));
  });

  it('commits an expense, version bump, recalculation, and audit event in one transaction', async () => {
    const close = { id: 'close-1', operationalLocationId: 'loc-1', businessDate: new Date('2026-07-17T00:00:00.000Z'), status: 'DRAFT', sales: [], updatedAt: new Date() };
    jest.spyOn(service as any, 'requireDraft').mockResolvedValue(close);
    jest.spyOn(service as any, 'recalculate').mockResolvedValue(close);
    prisma.cashMovement.create.mockResolvedValue({ id: 'expense-1' });

    await service.addExpense('close-1', { amount: 100, reason: 'Hielo', occurredAt: '2026-07-17T10:00:00.000Z' }, { id: 'seller-1', role: 'ADMIN' } as never, 'expense-key-atomic');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'expense-key-atomic' }) }));
    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }));
    expect((service as any).recalculate).toHaveBeenCalledWith('close-1', prisma);
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'EXPENSE_RECORDED', idempotencyKey: 'expense-key-atomic' }) }));
  });

  it('replays an idempotent expense without a second write', async () => {
    const occurredAt = new Date('2026-07-17T10:00:00.000Z');
    const close = { id: 'close-1', operationalLocationId: 'loc-1', businessDate: new Date('2026-07-17T00:00:00.000Z'), status: 'DRAFT', sales: [], updatedAt: new Date() };
    const payloadHash = createHash('sha256').update(JSON.stringify({ closeId: 'close-1', amount: 100, reason: 'Hielo', reference: null, occurredAt: occurredAt.toISOString(), userId: 'seller-1' })).digest('hex');
    jest.spyOn(service as any, 'requireDraft').mockResolvedValue(close);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(close);
    prisma.cashMovement.findUnique.mockResolvedValue({ id: 'expense-1', idempotencyPayloadHash: payloadHash });

    await service.addExpense('close-1', { amount: 100, reason: 'Hielo', occurredAt: occurredAt.toISOString() }, { id: 'seller-1', role: 'ADMIN' } as never, 'expense-key-replay');

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(prisma.pointOfSaleDailyClose.update).not.toHaveBeenCalled();
    expect(prisma.dailyCloseEvent.create).not.toHaveBeenCalled();
  });

  it('rolls back an expense transaction when its audit event cannot be persisted', async () => {
    const close = { id: 'close-1', operationalLocationId: 'loc-1', businessDate: new Date('2026-07-17T00:00:00.000Z'), status: 'DRAFT', sales: [], updatedAt: new Date() };
    let persistedExpense = false;
    jest.spyOn(service as any, 'requireDraft').mockResolvedValue(close);
    jest.spyOn(service as any, 'recalculate').mockResolvedValue(close);
    prisma.cashMovement.create.mockImplementation(async () => { persistedExpense = true; return { id: 'expense-1' }; });
    prisma.dailyCloseEvent.create.mockRejectedValue(new Error('audit storage failed'));
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      try {
        return await callback(prisma);
      } catch (error) {
        persistedExpense = false;
        throw error;
      }
    });

    await expect(service.addExpense('close-1', { amount: 100, reason: 'Hielo', occurredAt: '2026-07-17T10:00:00.000Z' }, { id: 'seller-1', role: 'ADMIN' } as never, 'expense-key-rollback')).rejects.toThrow('audit storage failed');

    expect(persistedExpense).toBe(false);
  });

  it('persists an immutable closed snapshot with a payload hash', async () => {
    const current = { id: 'close-1', operationalLocationId: 'loc-1', businessDate: new Date('2026-07-17T00:00:00.000Z'), status: 'REVIEWED', version: 4, sales: [], payments: [], inventoryMovements: [], cashMovements: [], scaleTicketReferences: [], inventoryCounts: [], lines: [], updatedAt: new Date() };
    const closed = { ...current, status: 'CLOSED', version: 5 };
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(closed);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await (service as any).transitionWithin(prisma, 'close-1', 4, 'CLOSED', { status: 'CLOSED', closedByUserId: 'admin-1', closedAt: new Date() }, { id: 'admin-1', role: 'ADMIN' });

    expect(prisma.dailyCloseSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pointOfSaleDailyCloseId: 'close-1', sourceVersion: 4, snapshotType: 'CLOSED', payloadHash: expect.any(String) }) }));
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'STATUS_CHANGED' }) }));
  });
});
