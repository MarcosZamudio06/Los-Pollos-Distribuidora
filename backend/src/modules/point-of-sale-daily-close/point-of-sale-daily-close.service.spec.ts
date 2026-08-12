import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';

describe('PointOfSaleDailyCloseService', () => {
  const originalAppTimezone = process.env.APP_TIMEZONE;
  const prisma = {
    user: { findUnique: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    pointOfSaleDailyClose: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cashShift: { count: jest.fn(), findUnique: jest.fn() },
    cashMovement: { create: jest.fn(), findUnique: jest.fn() },
    scaleTicketReference: { create: jest.fn(), findUnique: jest.fn() },
    sale: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    saleDocument: { findFirst: jest.fn() },
    payment: { findMany: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    dailyCloseInventoryCount: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    dailyCloseDifference: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    dailyCloseEvent: { create: jest.fn() },
    dailyCloseSnapshot: { create: jest.fn() },
    product: { findUnique: jest.fn() },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new PointOfSaleDailyCloseService(prisma as never);
  const privateService = service as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.dailyCloseInventoryCount.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.findFirst.mockResolvedValue(null);
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
    prisma.cashShift.count.mockResolvedValue(0);
    prisma.cashShift.findUnique.mockResolvedValue({
      id: 'shift-1',
      pointOfSaleDailyCloseId: 'close-1',
      cashierUserId: 'seller-1',
      status: 'OPEN',
      terminal: { isActive: true, deviceId: 'device-1' },
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  afterEach(() => {
    if (originalAppTimezone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = originalAppTimezone;
  });

  it('rejects opening an inactive location', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: false,
    });
    await expect(
      service.open(
        { operationalLocationId: 'loc-1', businessDate: '2026-07-17' },
        { id: 'u1', role: 'ADMIN' } as never,
      ),
    ).rejects.toThrow(new BadRequestException('LOCATION_INACTIVE'));
  });

  it('rejects opening a daily close for a location that is not a point of sale', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-warehouse',
      isActive: true,
      type: 'WAREHOUSE',
    });

    await expect(
      service.open(
        { operationalLocationId: 'loc-warehouse', businessDate: '2026-07-17' },
        { id: 'u1', role: 'ADMIN' } as never,
      ),
    ).rejects.toThrow(new BadRequestException('LOCATION_NOT_POINT_OF_SALE'));

    expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
  });

  it('rejects opening a close after the current operational day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-22T01:00:00.000Z'));
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-1',
      isActive: true,
    });

    try {
      await expect(
        service.open(
          { operationalLocationId: 'loc-1', businessDate: '2026-07-22' },
          { id: 'u1', role: 'ADMIN' } as never,
        ),
      ).rejects.toThrow(new BadRequestException('DAILY_CLOSE_FUTURE_DATE'));

      expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a duplicate non-cancelled close', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({ id: 'close-1' });
    await expect(
      service.open(
        { operationalLocationId: 'loc-1', businessDate: '2026-07-17' },
        { id: 'u1', role: 'ADMIN' } as never,
      ),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_ALREADY_EXISTS'));
  });

  it('maps a concurrent daily close insert conflict to the domain error', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
    prisma.$transaction = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.open(
        { operationalLocationId: 'loc-1', businessDate: '2026-07-17' },
        { id: 'u1', role: 'ADMIN' } as never,
      ),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_ALREADY_EXISTS'));
  });

  it('opens a cash session with terminal, fund and opening movements', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-1',
      isActive: true,
    });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
    prisma.pointOfSaleDailyClose.create.mockResolvedValue({ id: 'close-1' });
    jest.spyOn(privateService, 'syncOperations').mockResolvedValue(undefined);
    jest
      .spyOn(privateService, 'recalculate')
      .mockResolvedValue({ id: 'close-1', updatedAt: new Date() });

    await service.open(
      {
        operationalLocationId: 'loc-1',
        businessDate: '2026-07-17',
        terminalIdentifier: 'Caja 01',
        initialCashFund: 1500,
        initialCashIn: 100,
        initialCashOut: 25,
      },
      { id: 'cashier-1', role: 'SELLER' } as never,
    );

    expect(prisma.pointOfSaleDailyClose.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          terminalIdentifier: 'Caja 01',
          initialCashFund: 1500,
          initialCashIn: 100,
          initialCashOut: 25,
          cashSessionStatus: 'OPEN',
          openedByUserId: 'cashier-1',
          openedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.cashMovement.create).toHaveBeenCalledTimes(2);
    expect(prisma.cashMovement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CASH_IN',
          amount: 100,
          isOpening: true,
          pointOfSaleDailyCloseId: 'close-1',
        }),
      }),
    );
    expect(prisma.cashMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CASH_OUT',
          amount: 25,
          isOpening: true,
          pointOfSaleDailyCloseId: 'close-1',
        }),
      }),
    );
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

    await expect(
      service.cancel('close-1', { version: 1, reason: 'Cancelar por error' }, {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).rejects.toThrow(new BadRequestException('DAILY_CLOSE_INVALID_STATUS'));

    expect(prisma.pointOfSaleDailyClose.updateMany).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('blocks cancelling a draft daily close while a cash shift is open', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });
    prisma.cashShift.count.mockResolvedValue(1);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.cancel('close-1', { version: 1, reason: 'Cancelar por error' }, {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_HAS_OPEN_SHIFTS'));

    expect(prisma.pointOfSaleDailyClose.updateMany).not.toHaveBeenCalled();
  });

  it('reopens a reviewed daily close to draft', async () => {
    const reviewed = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'REVIEWED',
      sales: [],
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(reviewed)
      .mockResolvedValueOnce({ ...reviewed, status: 'DRAFT' });
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    const reopened = await service.reopen(
      'close-1',
      { version: 1, reason: 'Corregir conteo' },
      {
        id: 'admin-1',
        role: 'ADMIN',
        permissions: [PERMISSIONS.DAILY_CLOSES_REOPEN],
      } as never,
    );

    expect(reopened).toEqual(
      expect.objectContaining({
        status: 'DRAFT',
        dataAsOf: reviewed.updatedAt,
        unresolvedDifferenceCount: 0,
      }),
    );

    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'REVIEWED' }),
        data: expect.objectContaining({ status: 'DRAFT' }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
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

    await expect(
      service.addExpense(
        'close-1',
        {
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
          amount: 100,
          reason: 'Compra operativa',
          occurredAt: '2026-07-17T05:59:59.999Z',
        },
        { id: 'admin-1', role: 'ADMIN' } as never,
        'expense-key-1',
      ),
    ).rejects.toThrow(
      new BadRequestException('EXPENSE_OUTSIDE_OPERATIONAL_DAY'),
    );

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

    await expect(
      service.addScaleTicket(
        'close-1',
        { physicalFolio: 'BAS-42', capturedDate: '2026-07-16', weightKg: 2.5 },
        { id: 'admin-1', role: 'ADMIN' } as never,
        'scale-key-1',
      ),
    ).rejects.toThrow(new BadRequestException('SCALE_TICKET_DATE_MISMATCH'));

    expect(prisma.scaleTicketReference.create).not.toHaveBeenCalled();
  });

  it('links a manually captured scale ticket to its matching scale sale and document', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });
    prisma.saleDocument.findFirst.mockResolvedValue({
      id: 'doc-scale-1',
      saleId: 'sale-scale-1',
    });
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-scale-1' });
    prisma.scaleTicketReference.create.mockResolvedValue({ id: 'reference-1' });
    jest
      .spyOn(privateService, 'recalculate')
      .mockResolvedValue({ sales: [], updatedAt: new Date() });

    await service.addScaleTicket(
      'close-1',
      {
        physicalFolio: 'BAS-001',
        capturedDate: '2026-07-17',
        netWeightKg: 25,
        grossWeightKg: 26.2,
        tareWeightKg: 1.2,
        saleId: 'sale-scale-1',
        saleDocumentId: 'doc-scale-1',
      },
      { id: 'seller-1', role: 'ADMIN' } as never,
      'scale-key-2',
    );

    expect(prisma.scaleTicketReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-scale-1',
          saleDocumentId: 'doc-scale-1',
          grossWeightKg: 26.2,
          tareWeightKg: 1.2,
          netWeightKg: 25,
          weightKg: 25,
          captureSource: 'MANUAL',
        }),
      }),
    );
  });

  it('syncs confirmed branch sales even when they are assigned to a route', async () => {
    const tx = {
      sale: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inventoryMovement: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await privateService.syncOperations(
      tx,
      'close-1',
      'loc-1',
      new Date('2026-07-17T06:00:00.000Z'),
      new Date('2026-07-18T06:00:00.000Z'),
    );

    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: {
        locationId: 'loc-1',
        createdAt: {
          gte: new Date('2026-07-17T06:00:00.000Z'),
          lt: new Date('2026-07-18T06:00:00.000Z'),
        },
        status: 'CONFIRMED',
        OR: [
          { pointOfSaleDailyCloseId: null },
          { pointOfSaleDailyCloseId: { not: 'close-1' } },
        ],
      },
      data: { pointOfSaleDailyCloseId: 'close-1' },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ routeId: null }),
      }),
    );
  });

  it('uses America/Mexico_City boundaries for the operational day', () => {
    delete process.env.APP_TIMEZONE;

    expect(
      privateService.operationalDay(new Date('2026-07-17T00:00:00.000Z')),
    ).toEqual({
      from: new Date('2026-07-17T06:00:00.000Z'),
      to: new Date('2026-07-18T06:00:00.000Z'),
    });
  });

  it('uses America/Cancun boundaries for the operational day', () => {
    process.env.APP_TIMEZONE = 'America/Cancun';

    expect(
      privateService.operationalDay(new Date('2026-07-17T00:00:00.000Z')),
    ).toEqual({
      from: new Date('2026-07-17T05:00:00.000Z'),
      to: new Date('2026-07-18T05:00:00.000Z'),
    });
  });

  it('rejects a seller attempting to access or change a close from another location', async () => {
    const seller = { id: 'seller-1', role: 'SELLER' } as never;
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-seller',
      isActive: true,
    });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-other',
      operationalLocationId: 'loc-other',
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });

    await expect(service.get('close-other', seller)).rejects.toThrow(
      new ForbiddenException('LOCATION_NOT_AUTHORIZED'),
    );
    await expect(service.validate('close-other', seller)).rejects.toThrow(
      new ForbiddenException('LOCATION_NOT_AUTHORIZED'),
    );
    await expect(service.refresh('close-other', seller)).rejects.toThrow(
      new ForbiddenException('LOCATION_NOT_AUTHORIZED'),
    );
    await expect(
      service.addExpense(
        'close-other',
        {
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
          amount: 10,
          reason: 'Gasto',
        },
        seller,
        'expense-key-2',
      ),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    await expect(
      service.addScaleTicket(
        'close-other',
        { physicalFolio: 'B-1', capturedDate: '2026-07-17', weightKg: 1 },
        seller,
        'scale-key-3',
      ),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(prisma.scaleTicketReference.create).not.toHaveBeenCalled();
  });

  it('rejects a seller list query for another location', async () => {
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-seller',
      isActive: true,
    });

    await expect(
      service.list({ operationalLocationId: 'loc-other' }, {
        id: 'seller-1',
        role: 'SELLER',
      } as never),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.pointOfSaleDailyClose.findMany).not.toHaveBeenCalled();
  });

  it('rejects a seller opening a close outside the assigned location', async () => {
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-other',
      isActive: true,
      type: 'BRANCH',
    });
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-seller',
      isActive: true,
    });

    await expect(
      service.open(
        { operationalLocationId: 'loc-other', businessDate: '2026-07-17' },
        { id: 'seller-1', role: 'SELLER' } as never,
      ),
    ).rejects.toThrow(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));

    expect(prisma.pointOfSaleDailyClose.findFirst).not.toHaveBeenCalled();
  });

  it('scopes a seller list to the assigned location without loading detail relations', async () => {
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-seller',
      isActive: true,
    });
    prisma.pointOfSaleDailyClose.findMany.mockResolvedValue([
      {
        id: 'close-1',
        operationalLocationId: 'loc-seller',
        businessDate: new Date(),
        status: 'DRAFT',
        updatedAt: new Date(),
      },
    ]);

    const result = await service.list({}, {
      id: 'seller-1',
      role: 'SELLER',
    } as never);

    expect(prisma.pointOfSaleDailyClose.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { operationalLocationId: 'loc-seller' },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'close-1',
        operationalLocationId: 'loc-seller',
      }),
    ]);
  });

  it('projects seller data without costs or utility while preserving role-specific projections', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      updatedAt: new Date(),
      sales: [
        {
          id: 'sale-1',
          items: [
            {
              unitCostSnapshot: 70,
              costSubtotalSnapshot: 70,
              costSnapshotSource: 'SALE_CONFIRMATION',
            },
          ],
        },
      ],
      payments: [{ id: 'payment-1' }],
      cashMovements: [{ id: 'cash-1' }],
      inventoryMovements: [{ id: 'movement-1' }],
      lines: [
        {
          id: 'line-income',
          section: 'INCOME',
          conceptType: 'CASH_INCOME',
          amount: 100,
        },
        {
          id: 'line-profit',
          section: 'PROFIT',
          conceptType: 'NET_PROFIT',
          amount: 10,
        },
      ],
      scaleTicketReferences: [
        { id: 'ticket-1', amount: 100, unitPrice: 50, weightKg: 2 },
      ],
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
    prisma.user.findUnique.mockResolvedValue({
      operationalLocationId: 'loc-1',
      isActive: true,
    });
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(close);

    const warehouse = await service.get('close-1', {
      id: 'warehouse-1',
      role: 'WAREHOUSE',
    } as never);
    const collections = await service.get('close-1', {
      id: 'collections-1',
      role: 'COLLECTIONS',
    } as never);
    const seller = await service.get('close-1', {
      id: 'seller-1',
      role: 'SELLER',
    } as never);

    expect(warehouse).toHaveProperty('inventoryMovements');
    expect(warehouse).not.toHaveProperty('payments');
    expect(warehouse).not.toHaveProperty('purchaseCostTotal');
    expect(collections).toHaveProperty('payments');
    expect(collections).not.toHaveProperty('inventoryMovements');
    expect(collections).not.toHaveProperty('purchaseCostTotal');
    expect(seller).toHaveProperty('sales');
    expect(seller).toHaveProperty('payments');
    expect(seller).toHaveProperty('cashDifferenceTotal');
    expect(seller).not.toHaveProperty('purchaseCostTotal');
    expect(seller).not.toHaveProperty('grossProfitTotal');
    expect(seller).not.toHaveProperty('netProfitTotal');
    expect(seller).not.toHaveProperty('costQuality');
    expect(seller.sales?.[0].items?.[0]).not.toHaveProperty('unitCostSnapshot');
    expect(seller.sales?.[0].items?.[0]).not.toHaveProperty(
      'costSubtotalSnapshot',
    );
    expect(seller.sales?.[0].items?.[0]).not.toHaveProperty(
      'costSnapshotSource',
    );
    expect(seller.lines).toEqual([
      expect.objectContaining({ id: 'line-income' }),
    ]);
  });

  it('reports route payments and unconfirmed sales as excluded operations', async () => {
    const businessDate = new Date('2026-07-17T00:00:00.000Z');
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate,
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    });
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'payment-route-1',
        amount: 250,
        paidAt: new Date('2026-07-17T10:00:00.000Z'),
        referenceNumber: 'RUTA-100',
      },
    ]);
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-draft-1',
        saleNumber: 'V-100',
        total: 80,
        createdAt: new Date('2026-07-17T11:00:00.000Z'),
        status: 'DRAFT',
      },
    ]);

    const result = await service.get('close-1', {
      id: 'admin-1',
      role: 'ADMIN',
    } as never);

    expect(result).toMatchObject({
      excludedOperations: [
        { id: 'payment-route-1', type: 'PAYMENT', reference: 'RUTA-100' },
        { id: 'sale-draft-1', type: 'SALE', reference: 'V-100' },
      ],
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ routeId: { not: null } }),
      }),
    );
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
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({
      ...close,
      cashTotal: 120,
      cardVoucherTotal: 30,
      transferTotal: 40,
      netCashExpected: 120,
      cashDifferenceTotal: -20,
    });

    const result = (await privateService.recalculate('close-1')) as {
      cashDifferenceTotal: number;
    };

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashTotal: 120,
          cardVoucherTotal: 30,
          transferTotal: 40,
          netCashExpected: 120,
          cashDifferenceTotal: -20,
        }),
      }),
    );
    expect(result.cashDifferenceTotal).toBe(-20);
  });

  it('calcula el efectivo heredado únicamente con movimientos de canal CASH', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [
        {
          type: 'CASH_IN',
          movementChannel: 'TRANSFER',
          amount: 50,
          isOpening: false,
        },
        {
          type: 'CASH_OUT',
          movementChannel: 'CARD',
          amount: 20,
          isOpening: false,
        },
        {
          type: 'CASH_IN',
          movementChannel: 'CASH',
          amount: 10,
          isOpening: false,
        },
        {
          type: 'CASH_OUT',
          movementChannel: 'CASH',
          amount: 5,
          isOpening: false,
        },
      ],
      cashShifts: [],
      sales: [],
      payments: [],
      initialCashFund: 100,
      initialCashIn: 0,
      initialCashOut: 0,
      cashCountedTotal: 105,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({
      ...close,
      netCashExpected: 105,
      cashDifferenceTotal: 0,
    });

    await privateService.recalculate('close-1');

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          netCashExpected: 105,
          cashDifferenceTotal: 0,
        }),
      }),
    );
  });

  it('does not persist recalculated totals when the final status reread is no longer draft', async () => {
    const draft = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      cashShifts: [],
      sales: [],
      payments: [],
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, status: 'REVIEWED' });

    await expect(privateService.recalculate('close-1')).rejects.toThrow(
      new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'),
    );

    expect(prisma.pointOfSaleDailyClose.update).not.toHaveBeenCalled();
  });

  it('invalida el sello de validación cuando el recálculo detecta una operación nueva', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 4,
      lastValidatedAt: new Date('2026-07-17T12:00:00.000Z'),
      validatedSourceVersion: 4,
      initialCashFund: 0,
      initialCashIn: 0,
      initialCashOut: 0,
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      cashShifts: [],
      sales: [],
      payments: [],
      cashCountedTotal: null,
      totalInputKg: 0,
      totalSoldKg: 0,
      totalRemainingKg: 0,
      totalShortageKg: 0,
      totalSurplusKg: 0,
      scaleReportedKg: 0,
      scaleDifferenceKg: 0,
      cashTotal: 0,
      cardVoucherTotal: 0,
      transferTotal: 0,
      expenseTotal: 0,
      grossSalesTotal: 0,
      netCashExpected: 0,
      cashDifferenceTotal: null,
      purchaseCostTotal: 0,
      grossProfitTotal: 0,
      netProfitTotal: 0,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    jest.spyOn(privateService, 'syncOperations').mockResolvedValue(true);
    jest.spyOn(privateService, 'syncDifferences').mockResolvedValue(false);
    jest
      .spyOn(privateService, 'reconciliationForClose')
      .mockResolvedValue({ items: [] });
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({
      ...close,
      version: 5,
    });

    await privateService.recalculate('close-1', prisma, {
      invalidateIfChanged: true,
    });

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 4 }),
        data: expect.objectContaining({
          version: { increment: 1 },
          lastValidatedAt: null,
          validatedSourceVersion: null,
        }),
      }),
    );
  });

  it('no incrementa la versión en un recálculo de lectura sin cambios', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 4,
      initialCashFund: 0,
      initialCashIn: 0,
      initialCashOut: 0,
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      cashShifts: [],
      sales: [],
      payments: [],
      cashCountedTotal: null,
      totalInputKg: 0,
      totalSoldKg: 0,
      totalRemainingKg: 0,
      totalShortageKg: 0,
      totalSurplusKg: 0,
      scaleReportedKg: 0,
      scaleDifferenceKg: 0,
      cashTotal: 0,
      cardVoucherTotal: 0,
      transferTotal: 0,
      expenseTotal: 0,
      grossSalesTotal: 0,
      netCashExpected: 0,
      cashDifferenceTotal: null,
      purchaseCostTotal: 0,
      grossProfitTotal: 0,
      netProfitTotal: 0,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    jest.spyOn(privateService, 'syncOperations').mockResolvedValue(false);
    jest.spyOn(privateService, 'syncDifferences').mockResolvedValue(false);
    jest
      .spyOn(privateService, 'reconciliationForClose')
      .mockResolvedValue({ items: [] });

    await privateService.recalculate('close-1', prisma, {
      invalidateIfChanged: true,
    });

    expect(prisma.pointOfSaleDailyClose.update).not.toHaveBeenCalled();
  });

  it('consolidates counted cash and opening funds from closed shifts', async () => {
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
      payments: [],
      cashShifts: [
        {
          id: 'shift-1',
          terminalId: 'terminal-1',
          status: 'CLOSED',
          openedAt: new Date('2026-07-17T08:00:00.000Z'),
          createdAt: new Date('2026-07-17T08:00:00.000Z'),
          initialCashFund: 100,
          initialCashIn: 20,
          initialCashOut: 0,
          cashCountedTotal: 120,
        },
        {
          id: 'shift-2',
          terminalId: 'terminal-2',
          status: 'CLOSED',
          openedAt: new Date('2026-07-17T08:00:00.000Z'),
          createdAt: new Date('2026-07-17T08:00:00.000Z'),
          initialCashFund: 200,
          initialCashIn: 0,
          initialCashOut: 10,
          cashCountedTotal: 190,
        },
      ],
      cashCountedTotal: null,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({
      ...close,
      netCashExpected: 310,
      cashCountedTotal: 310,
      cashDifferenceTotal: 0,
    });

    await privateService.recalculate('close-1');

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          netCashExpected: 310,
          cashCountedTotal: 310,
          cashDifferenceTotal: 0,
        }),
      }),
    );
  });

  it('does not double count a rolled-forward fund across sequential shifts', async () => {
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
        {
          cashShiftId: 'shift-1',
          paymentMethod: 'CASH',
          amount: 6000,
          status: 'APPLIED',
        },
        {
          cashShiftId: 'shift-2',
          paymentMethod: 'CASH',
          amount: 200,
          status: 'APPLIED',
        },
      ],
      cashShifts: [
        {
          id: 'shift-1',
          terminalId: 'terminal-1',
          status: 'CLOSED',
          openedAt: new Date('2026-07-17T08:00:00.000Z'),
          createdAt: new Date('2026-07-17T08:00:00.000Z'),
          initialCashFund: 0,
          initialCashIn: 0,
          initialCashOut: 0,
          cashCountedTotal: 6000,
        },
        {
          id: 'shift-2',
          terminalId: 'terminal-1',
          status: 'CLOSED',
          openedAt: new Date('2026-07-17T14:00:00.000Z'),
          createdAt: new Date('2026-07-17T14:00:00.000Z'),
          initialCashFund: 6000,
          initialCashIn: 0,
          initialCashOut: 0,
          cashCountedTotal: 6200,
        },
      ],
      cashCountedTotal: null,
      updatedAt: new Date(),
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close);
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({
      ...close,
      netCashExpected: 6200,
      cashCountedTotal: 6200,
      cashDifferenceTotal: 0,
    });

    await privateService.recalculate('close-1');

    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashTotal: 6200,
          netCashExpected: 6200,
          cashCountedTotal: 6200,
          cashDifferenceTotal: 0,
        }),
      }),
    );
  });

  it('persists a physical count without creating an inventory movement', async () => {
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      sales: [],
      updatedAt: new Date(),
    });
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
    prisma.dailyCloseInventoryCount.create.mockResolvedValue({ id: 'count-1' });
    jest
      .spyOn(privateService, 'recalculate')
      .mockResolvedValue({ sales: [], updatedAt: new Date() });

    await service.createInventoryCount(
      'close-1',
      {
        productId: 'product-1',
        physicalQuantityKg: 4.5,
        reason: 'Conteo de anaquel',
      },
      { id: 'seller-1', role: 'ADMIN' } as never,
      'count-key-1',
    );

    expect(prisma.dailyCloseInventoryCount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          physicalQuantityKg: 4.5,
          countedByUserId: 'seller-1',
        }),
      }),
    );
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
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.pointOfSaleDailyClose.update
      .mockResolvedValueOnce({
        ...close,
        netCashExpected: 0,
        cashDifferenceTotal: null,
      })
      .mockResolvedValueOnce(close);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.validate('close-1', {
      id: 'seller-1',
      role: 'SELLER',
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'CASH_COUNT_REQUIRED' }),
    );
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastValidationAttemptAt: expect.any(Date),
          lastValidatedAt: null,
          validatedSourceVersion: null,
        }),
      }),
    );
  });

  it('marks a source version as validated only after a successful validation', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      version: 4,
      sales: [],
      updatedAt: new Date(),
    };
    const recalculated = {
      ...close,
      lines: [],
      cashCountedTotal: 0,
      scaleDifferenceKg: 0,
      cashDifferenceTotal: 0,
    };
    jest.spyOn(privateService, 'recalculate').mockResolvedValue(recalculated);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(recalculated);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.validate('close-1', {
      id: 'seller-1',
      role: 'SELLER',
    } as never);

    expect(result.valid).toBe(true);
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastValidationAttemptAt: expect.any(Date),
          lastValidatedAt: expect.any(Date),
          validatedSourceVersion: 4,
        }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('keeps validation invalid while a non-authorized difference remains', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      version: 4,
      sales: [],
      updatedAt: new Date(),
    };
    const difference = {
      id: 'difference-1',
      code: 'SCALE_DIFFERENCE',
      referenceKey: 'SCALE',
      scope: 'SCALE',
      unit: 'KG',
      expectedValue: 20,
      recordedValue: 15,
      differenceValue: -5,
      differenceType: 'SHORTAGE',
      status: 'PENDING_JUSTIFICATION',
    };
    const recalculated = {
      ...close,
      lines: [],
      cashShifts: [],
      cashCountedTotal: 0,
      scaleDifferenceKg: -5,
      cashDifferenceTotal: 0,
      differences: [difference],
    };
    jest
      .spyOn(privateService, 'recalculate')
      .mockResolvedValue(recalculated as never);
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(recalculated);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.validate('close-1', {
      id: 'admin-1',
      role: 'ADMIN',
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DAILY_CLOSE_DIFFERENCE_UNRESOLVED' }),
      ]),
    );
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastValidatedAt: null,
          validatedSourceVersion: null,
        }),
      }),
    );
  });

  it('builds explicit cash, scale, and inventory difference definitions', () => {
    const definitions = privateService.buildDifferenceDefinitions({
      cashExpected: 100,
      cashRecorded: 80,
      scaleExpected: 20,
      scaleRecorded: 21.5,
      inventory: [
        {
          product: { id: 'product-1' },
          theoreticalQuantityKg: 10,
          physicalQuantityKg: 8.5,
          theoreticalQuantityPieces: 2,
          physicalQuantityPieces: 3,
        },
      ],
    });

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CASH_DIFFERENCE',
          expectedValue: 100,
          recordedValue: 80,
          differenceValue: -20,
          referenceKey: 'CASH',
        }),
        expect.objectContaining({
          code: 'SCALE_DIFFERENCE',
          expectedValue: 20,
          recordedValue: 21.5,
          differenceValue: 1.5,
          referenceKey: 'SCALE',
        }),
        expect.objectContaining({
          code: 'INVENTORY_DIFFERENCE',
          expectedValue: 10,
          recordedValue: 8.5,
          differenceValue: -1.5,
          referenceKey: 'product-1:KG',
        }),
        expect.objectContaining({
          code: 'INVENTORY_DIFFERENCE',
          expectedValue: 2,
          recordedValue: 3,
          differenceValue: 1,
          referenceKey: 'product-1:PIECE',
        }),
      ]),
    );
  });

  it('justifies a difference with evidence and invalidates the close version', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      version: 3,
      sales: [],
      updatedAt: new Date(),
    };
    const difference = {
      id: 'difference-1',
      pointOfSaleDailyCloseId: 'close-1',
      differenceValue: -20,
      status: 'PENDING_JUSTIFICATION',
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce({ ...close, version: 4 });
    prisma.dailyCloseDifference.findFirst.mockResolvedValue(difference);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await service.justifyDifference(
      'close-1',
      'difference-1',
      {
        version: 3,
        reason: 'Conteo validado con encargado',
        evidence: 'Folio CAJA-22',
      },
      { id: 'seller-1', role: 'SELLER' } as never,
    );

    expect(prisma.dailyCloseDifference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'difference-1' },
        data: expect.objectContaining({
          status: 'PENDING_AUTHORIZATION',
          reason: 'Conteo validado con encargado',
          evidence: 'Folio CAJA-22',
          justifiedByUserId: 'seller-1',
        }),
      }),
    );
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'close-1', version: 3, status: 'DRAFT' },
      }),
    );
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DIFFERENCE_JUSTIFIED' }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('authorizes a justified difference only with the required permission', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'DRAFT',
      version: 4,
      sales: [],
      updatedAt: new Date(),
    };
    const difference = {
      id: 'difference-1',
      pointOfSaleDailyCloseId: 'close-1',
      differenceValue: 12,
      status: 'PENDING_AUTHORIZATION',
    };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce(close)
      .mockResolvedValueOnce({ ...close, version: 5 });
    prisma.dailyCloseDifference.findFirst.mockResolvedValue(difference);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await service.authorizeDifference(
      'close-1',
      'difference-1',
      { version: 4 },
      {
        id: 'admin-1',
        role: 'ADMIN',
        permissions: [PERMISSIONS.DAILY_CLOSES_DIFFERENCES_AUTHORIZE],
      } as never,
    );

    expect(prisma.dailyCloseDifference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'difference-1' },
        data: expect.objectContaining({
          status: 'AUTHORIZED',
          authorizedByUserId: 'admin-1',
        }),
      }),
    );
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DIFFERENCE_AUTHORIZED' }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
  });

  it('commits an expense, version bump, recalculation, and audit event in one transaction', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    };
    jest.spyOn(privateService, 'requireDraft').mockResolvedValue(close);
    jest.spyOn(privateService, 'recalculate').mockResolvedValue(close);
    prisma.cashMovement.create.mockResolvedValue({ id: 'expense-1' });

    await service.addExpense(
      'close-1',
      {
        cashShiftId: 'shift-1',
        deviceId: 'device-1',
        amount: 100,
        reason: 'Hielo',
        occurredAt: '2026-07-17T10:00:00.000Z',
      },
      { id: 'seller-1', role: 'ADMIN' } as never,
      'expense-key-atomic',
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashShiftId: 'shift-1',
          idempotencyKey: 'expense-key-atomic',
        }),
      }),
    );
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
    expect(privateService.recalculate as jest.Mock).toHaveBeenCalledWith(
      'close-1',
      prisma,
    );
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'EXPENSE_RECORDED',
          idempotencyKey: 'expense-key-atomic',
        }),
      }),
    );
  });

  it('replays an idempotent expense without a second write', async () => {
    const occurredAt = new Date('2026-07-17T10:00:00.000Z');
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    };
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          closeId: 'close-1',
          cashShiftId: 'shift-1',
          amount: 100,
          reason: 'Hielo',
          reference: null,
          occurredAt: occurredAt.toISOString(),
          userId: 'seller-1',
        }),
      )
      .digest('hex');
    jest.spyOn(privateService, 'requireDraft').mockResolvedValue(close);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(close);
    prisma.cashMovement.findUnique.mockResolvedValue({
      id: 'expense-1',
      idempotencyPayloadHash: payloadHash,
    });

    await service.addExpense(
      'close-1',
      {
        cashShiftId: 'shift-1',
        deviceId: 'device-1',
        amount: 100,
        reason: 'Hielo',
        occurredAt: occurredAt.toISOString(),
      },
      { id: 'seller-1', role: 'ADMIN' } as never,
      'expense-key-replay',
    );

    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(prisma.pointOfSaleDailyClose.update).not.toHaveBeenCalled();
    expect(prisma.dailyCloseEvent.create).not.toHaveBeenCalled();
  });

  it('rolls back an expense transaction when its audit event cannot be persisted', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      sales: [],
      updatedAt: new Date(),
    };
    let persistedExpense = false;
    jest.spyOn(privateService, 'requireDraft').mockResolvedValue(close);
    jest.spyOn(privateService, 'recalculate').mockResolvedValue(close);
    prisma.cashMovement.create.mockImplementation(() => {
      persistedExpense = true;
      return { id: 'expense-1' };
    });
    prisma.dailyCloseEvent.create.mockRejectedValue(
      new Error('audit storage failed'),
    );
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => {
        try {
          return await callback(prisma);
        } catch (error) {
          persistedExpense = false;
          throw error;
        }
      },
    );

    await expect(
      service.addExpense(
        'close-1',
        {
          cashShiftId: 'shift-1',
          deviceId: 'device-1',
          amount: 100,
          reason: 'Hielo',
          occurredAt: '2026-07-17T10:00:00.000Z',
        },
        { id: 'seller-1', role: 'ADMIN' } as never,
        'expense-key-rollback',
      ),
    ).rejects.toThrow('audit storage failed');

    expect(persistedExpense).toBe(false);
  });

  it.each([
    {
      name: 'expense',
      write: prisma.cashMovement.create,
      setup: () => undefined,
      invoke: () =>
        service.addExpense(
          'close-1',
          {
            cashShiftId: 'shift-1',
            deviceId: 'device-1',
            amount: 25,
            reason: 'Hielo',
            occurredAt: '2026-07-17T10:00:00.000Z',
          },
          { id: 'seller-1', role: 'ADMIN' } as never,
          'locked-expense',
        ),
    },
    {
      name: 'cash count',
      write: prisma.pointOfSaleDailyClose.updateMany,
      setup: () => undefined,
      invoke: () =>
        service.recordCashCount('close-1', { cashCountedTotal: 100 }, {
          id: 'seller-1',
          role: 'ADMIN',
        } as never),
    },
    {
      name: 'refresh',
      write: prisma.pointOfSaleDailyClose.update,
      setup: () => undefined,
      invoke: () =>
        service.refresh('close-1', {
          id: 'seller-1',
          role: 'ADMIN',
        } as never),
    },
    {
      name: 'scale ticket',
      write: prisma.scaleTicketReference.create,
      setup: () => undefined,
      invoke: () =>
        service.addScaleTicket(
          'close-1',
          {
            physicalFolio: 'B-100',
            capturedDate: '2026-07-17',
            netWeightKg: 10,
          },
          { id: 'seller-1', role: 'ADMIN' } as never,
          'locked-scale-ticket',
        ),
    },
    {
      name: 'inventory count',
      write: prisma.dailyCloseInventoryCount.create,
      setup: () =>
        prisma.product.findUnique.mockResolvedValue({
          id: 'product-1',
          unit: 'KG',
        }),
      invoke: () =>
        service.createInventoryCount(
          'close-1',
          {
            productId: 'product-1',
            physicalQuantityKg: 10,
            reason: 'Conteo físico',
          },
          { id: 'seller-1', role: 'ADMIN' } as never,
          'locked-inventory-count',
        ),
    },
  ])(
    'rejects $name without writing when the under-lock reread is reviewed',
    async ({ write, setup, invoke }) => {
      const draft = {
        id: 'close-1',
        operationalLocationId: 'loc-1',
        businessDate: new Date('2026-07-17T00:00:00.000Z'),
        status: 'DRAFT',
        lines: [],
        scaleTicketReferences: [],
        inventoryMovements: [],
        cashMovements: [],
        cashShifts: [],
        sales: [],
        payments: [],
        updatedAt: new Date(),
      };
      jest.spyOn(privateService, 'requireDraft').mockResolvedValue(draft);
      jest
        .spyOn(privateService, 'projectDetailForRole')
        .mockImplementation((close: unknown) => Promise.resolve(close));
      prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue({
        ...draft,
        status: 'REVIEWED',
      });
      setup();

      await expect(invoke()).rejects.toThrow(
        new BadRequestException('DAILY_CLOSE_NOT_EDITABLE'),
      );

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        'daily-close-id:close-1',
      );
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('persists an immutable closed snapshot with a payload hash', async () => {
    const current = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'REVIEWED',
      version: 4,
      sales: [],
      payments: [],
      inventoryMovements: [],
      cashMovements: [],
      scaleTicketReferences: [],
      inventoryCounts: [],
      lines: [],
      updatedAt: new Date(),
    };
    const closed = { ...current, status: 'CLOSED', version: 5 };
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(closed);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    await privateService.transitionWithin(
      prisma,
      'close-1',
      4,
      'CLOSED',
      { status: 'CLOSED', closedByUserId: 'admin-1', closedAt: new Date() },
      { id: 'admin-1', role: 'ADMIN' },
    );

    expect(prisma.dailyCloseSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pointOfSaleDailyCloseId: 'close-1',
          sourceVersion: 4,
          snapshotType: 'CLOSED',
          payloadHash: expect.any(String),
        }),
      }),
    );
    expect(prisma.dailyCloseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'STATUS_CHANGED' }),
      }),
    );
  });

  it('blocks branch daily closing while any terminal shift remains open', async () => {
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue({
      id: 'close-1',
      version: 4,
      validatedSourceVersion: 4,
    });
    prisma.cashShift.count.mockResolvedValue(1);

    await expect(
      service.close('close-1', { version: 4 }, {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_HAS_OPEN_SHIFTS'));
  });

  it.each([
    'PENDING_JUSTIFICATION',
    'PENDING_AUTHORIZATION',
  ])('blocks closing a reviewed close with a %s difference', async (status) => {
    const current = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      status: 'REVIEWED',
      version: 4,
      validatedSourceVersion: 4,
      differences: [
        {
          id: 'difference-1',
          referenceKey: 'SCALE',
          differenceValue: -5,
          status,
        },
      ],
    };
    jest
      .spyOn(privateService, 'requireCloseAccess')
      .mockResolvedValue(current as never);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(current);
    prisma.cashShift.count.mockResolvedValue(0);

    await expect(
      service.close(
        'close-1',
        { version: 4 },
        { id: 'admin-1', role: 'ADMIN' } as never,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DAILY_CLOSE_DIFFERENCE_UNRESOLVED',
      }),
    });
  });

  it('acquires the daily-close lifecycle lock before checking shifts for close', async () => {
    const current = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'REVIEWED',
      version: 4,
      validatedSourceVersion: 4,
      sales: [],
      payments: [],
      inventoryMovements: [],
      cashMovements: [],
      scaleTicketReferences: [],
      inventoryCounts: [],
      lines: [],
      updatedAt: new Date(),
    };
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(current);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(current);
    prisma.cashShift.count.mockResolvedValue(1);

    await expect(
      service.close('close-1', { version: 4 }, {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_HAS_OPEN_SHIFTS'));

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.cashShift.count.mock.invocationCallOrder[0],
    );
  });

  it('acquires the daily-close lifecycle lock before review validation', async () => {
    const current = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 4,
    };
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(current);
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(current);
    const validate = jest
      .spyOn(privateService, 'validateWithin')
      .mockResolvedValue({ valid: true, close: current });
    jest.spyOn(privateService, 'transitionWithin').mockResolvedValue({
      ...current,
      status: 'REVIEWED',
      version: 5,
    });

    await service.review('close-1', { version: 4 }, {
      id: 'admin-1',
      role: 'ADMIN',
    } as never);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'daily-close-id:close-1',
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      validate.mock.invocationCallOrder[0],
    );
  });

  it('rechaza una revisión obsoleta antes de validar o mutar el cierre', async () => {
    const current = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 5,
      lastValidatedAt: new Date('2026-07-17T18:00:00.000Z'),
      validatedSourceVersion: 5,
    };
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(current);
    const validate = jest
      .spyOn(privateService, 'validateWithin')
      .mockResolvedValue({ valid: true, close: current });
    const transition = jest.spyOn(privateService, 'transitionWithin');
    prisma.pointOfSaleDailyClose.findUnique.mockReset();
    prisma.pointOfSaleDailyClose.findUnique.mockResolvedValue(current);
    prisma.pointOfSaleDailyClose.update.mockReset();
    prisma.pointOfSaleDailyClose.updateMany.mockReset();

    await expect(
      service.review('close-1', { version: 4 }, {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).rejects.toThrow(new ConflictException('DAILY_CLOSE_VERSION_CONFLICT'));

    expect(validate).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(prisma.pointOfSaleDailyClose.update).not.toHaveBeenCalled();
    expect(prisma.pointOfSaleDailyClose.updateMany).not.toHaveBeenCalled();
    expect(current).toMatchObject({
      status: 'DRAFT',
      version: 5,
      lastValidatedAt: new Date('2026-07-17T18:00:00.000Z'),
      validatedSourceVersion: 5,
    });
  });

  it('transiciona a REVIEWED usando la versión posterior a la validación', async () => {
    const draft = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
      version: 4,
      initialCashFund: 0,
      initialCashIn: 0,
      initialCashOut: 0,
      lines: [],
      scaleTicketReferences: [],
      inventoryMovements: [],
      cashMovements: [],
      cashShifts: [],
      sales: [],
      payments: [],
      cashCountedTotal: 0,
      totalInputKg: 0,
      totalSoldKg: 0,
      totalRemainingKg: 0,
      totalShortageKg: 0,
      totalSurplusKg: 0,
      scaleReportedKg: 0,
      scaleDifferenceKg: 0,
      cashTotal: 0,
      cardVoucherTotal: 0,
      transferTotal: 0,
      expenseTotal: 0,
      grossSalesTotal: 0,
      netCashExpected: 0,
      cashDifferenceTotal: 0,
      purchaseCostTotal: 0,
      grossProfitTotal: 0,
      netProfitTotal: 0,
      differences: [],
      updatedAt: new Date(),
    };
    const postValidation = {
      ...draft,
      version: 5,
      lastValidationAttemptAt: new Date(),
      lastValidatedAt: new Date(),
      validatedSourceVersion: 5,
    };
    const reviewed = { ...postValidation, status: 'REVIEWED', version: 6 };
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(draft);
    jest
      .spyOn(privateService, 'projectDetailForRole')
      .mockImplementation((close: unknown) => Promise.resolve(close));
    prisma.pointOfSaleDailyClose.findUnique.mockReset();
    prisma.pointOfSaleDailyClose.update.mockReset();
    prisma.pointOfSaleDailyClose.updateMany.mockReset();
    prisma.sale.updateMany.mockReset();
    prisma.payment.updateMany.mockReset();
    prisma.inventoryMovement.findMany.mockReset();
    prisma.inventoryMovement.updateMany.mockReset();
    prisma.dailyCloseInventoryCount.findMany.mockReset();
    prisma.dailyCloseDifference.findMany.mockReset();
    prisma.dailyCloseDifference.upsert.mockReset();
    prisma.dailyCloseDifference.update.mockReset();
    prisma.dailyCloseEvent.create.mockReset();
    prisma.dailyCloseSnapshot.create.mockReset();
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.dailyCloseInventoryCount.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.findMany.mockResolvedValue([]);
    prisma.dailyCloseDifference.upsert.mockResolvedValue({});
    prisma.dailyCloseDifference.update.mockResolvedValue({});
    prisma.dailyCloseEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.dailyCloseSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
    prisma.sale.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    prisma.inventoryMovement.updateMany.mockResolvedValue({ count: 0 });
    prisma.pointOfSaleDailyClose.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(postValidation)
      .mockResolvedValueOnce(postValidation)
      .mockResolvedValueOnce(reviewed);
    prisma.pointOfSaleDailyClose.update.mockResolvedValue(postValidation);
    prisma.pointOfSaleDailyClose.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.review('close-1', { version: 4 }, {
      id: 'admin-1',
      role: 'ADMIN',
    } as never);

    expect(result).toMatchObject({ status: 'REVIEWED', version: 6 });
    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'close-1', status: 'DRAFT', version: 4 },
        data: expect.objectContaining({
          version: { increment: 1 },
          lastValidatedAt: null,
          validatedSourceVersion: null,
        }),
      }),
    );
    expect(prisma.pointOfSaleDailyClose.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'close-1', version: 5, status: 'DRAFT' },
      data: expect.objectContaining({
        status: 'REVIEWED',
        validatedSourceVersion: 6,
        version: { increment: 1 },
      }),
    });
  });

  it('returns the reconciliation calculated inside the lifecycle transaction', async () => {
    const close = {
      id: 'close-1',
      operationalLocationId: 'loc-1',
      businessDate: new Date('2026-07-17T00:00:00.000Z'),
      status: 'DRAFT',
    };
    const recalculated = { ...close, version: 2 };
    const reconciliation = { closeId: 'close-1', items: [] };
    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(close);
    jest
      .spyOn(privateService, 'requireCloseAccessWithinTransaction')
      .mockResolvedValue(close);
    const recalculate = jest
      .spyOn(privateService, 'recalculate')
      .mockResolvedValue(recalculated);
    const reconciliationForClose = jest
      .spyOn(privateService, 'reconciliationForClose')
      .mockResolvedValue(reconciliation);

    await expect(
      service.getReconciliation('close-1', {
        id: 'admin-1',
        role: 'ADMIN',
      } as never),
    ).resolves.toBe(reconciliation);

    expect(recalculate).toHaveBeenCalledWith('close-1', prisma, {
      invalidateIfChanged: true,
    });
    expect(reconciliationForClose).toHaveBeenCalledWith(recalculated, prisma);
  });

  it('projects the closed daily close before returning it', async () => {
    const current = {
      id: 'close-1',
      version: 4,
      validatedSourceVersion: 4,
    };
    const transitioned = {
      id: 'close-1',
      status: 'CLOSED',
    };
    const projected = {
      ...transitioned,
      dataAsOf: new Date('2026-07-22T18:00:00.000Z'),
      excludedOperations: [],
    };
    const admin = { id: 'admin-1', role: 'ADMIN' } as never;

    jest.spyOn(privateService, 'requireCloseAccess').mockResolvedValue(current);
    jest
      .spyOn(privateService, 'closeWithinTransaction')
      .mockResolvedValue(transitioned);
    jest
      .spyOn(privateService, 'projectDetailForRole')
      .mockResolvedValue(projected);

    await expect(service.close('close-1', { version: 4 }, admin)).resolves.toBe(
      projected,
    );
    expect(privateService.projectDetailForRole).toHaveBeenCalledWith(
      transitioned,
      admin,
    );
  });
});
