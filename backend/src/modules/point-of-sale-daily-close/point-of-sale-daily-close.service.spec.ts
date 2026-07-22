import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';

describe('PointOfSaleDailyCloseService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    cashMovement: { create: jest.fn() },
    scaleTicketReference: { create: jest.fn() },
  };
  const service = new PointOfSaleDailyCloseService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

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
    )).rejects.toThrow(new BadRequestException('SCALE_TICKET_DATE_MISMATCH'));

    expect(prisma.scaleTicketReference.create).not.toHaveBeenCalled();
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
    await expect(service.addExpense('close-other', { amount: 10, reason: 'Gasto' }, seller)).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(service.addScaleTicket('close-other', { physicalFolio: 'B-1', capturedDate: '2026-07-17', weightKg: 1 }, seller)).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

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
    const tx = {
      sale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      inventoryMovement: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValueOnce(close).mockResolvedValueOnce(close);
    (prisma as any).$transaction = jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({ ...close, cashTotal: 120, cardVoucherTotal: 30, transferTotal: 40, netCashExpected: 120, cashDifferenceTotal: -20 });

    const result = await (service as any).recalculate('close-1');

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cashTotal: 120, cardVoucherTotal: 30, transferTotal: 40, netCashExpected: 120, cashDifferenceTotal: -20 }),
    }));
    expect(result.cashDifferenceTotal).toBe(-20);
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
    const tx = {
      sale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      inventoryMovement: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    (prisma as any).$transaction = jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
    prisma.pointOfSaleDailyClose.update
      .mockResolvedValueOnce({ ...close, netCashExpected: 0, cashDifferenceTotal: null })
      .mockResolvedValueOnce(close);

    const result = await service.validate('close-1', { id: 'seller-1', role: 'SELLER' } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'CASH_COUNT_REQUIRED' }));
  });
});
