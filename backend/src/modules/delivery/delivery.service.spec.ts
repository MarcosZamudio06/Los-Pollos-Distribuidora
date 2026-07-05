import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CollectionStatus,
  DeliveryEvidenceType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  InventoryMovementType,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  RouteSettlementStatus,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryService } from './delivery.service';

type MockPrisma = {
  user: { findFirst: jest.Mock };
  deliveryRoute: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  deliveryOrder: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  deliveryEvidence: { create: jest.Mock };
  accountReceivable: { findUnique: jest.Mock; update: jest.Mock };
  payment: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  sale: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  inventoryBalance: { upsert: jest.Mock; findUnique: jest.Mock };
  inventoryMovement: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  routeSettlement: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  operationalLocation: { create: jest.Mock; findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const admin = { id: 'admin-1', role: 'ADMIN' };
const driver = { id: 'driver-1', role: 'DRIVER' };

function date(value: string) {
  return new Date(value);
}

function money(value: string) {
  return { toString: () => value };
}

function createRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    name: 'Ruta Centro',
    driverId: 'driver-1',
    driver: { id: 'driver-1', name: 'Driver One' },
    status: DeliveryRouteStatus.PENDING,
    scheduledDate: date('2026-06-19T00:00:00.000Z'),
    originLocationId: 'origin-1',
    routeStockLocationId: 'route-stock-1',
    startedAt: null,
    completedAt: null,
    createdAt: date('2026-06-18T10:00:00.000Z'),
    deliveryOrders: [],
    settlement: null,
    payments: [],
    ...overrides,
  };
}

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    routeId: 'route-1',
    saleId: 'sale-1',
    accountReceivableId: 'ar-1',
    status: DeliveryOrderStatus.PENDING,
    deliveryAddress: 'Av Centro 123',
    deliveredAt: null,
    deliveredByUserId: null,
    collectedByUserId: null,
    collectionPass: null,
    notes: null,
    sale: { id: 'sale-1', saleNumber: 'S-1001' },
    accountReceivable: { id: 'ar-1', outstandingAmount: money('500') },
    evidence: [],
    route: createRoute(),
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  const prisma: MockPrisma = {
    user: { findFirst: jest.fn() },
    deliveryRoute: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    deliveryOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    deliveryEvidence: { create: jest.fn() },
    accountReceivable: { findUnique: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    inventoryBalance: { upsert: jest.fn(), findUnique: jest.fn() },
    inventoryMovement: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    routeSettlement: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    operationalLocation: { create: jest.fn(), findFirst: jest.fn() },
    sale: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  return {
    service: new DeliveryService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('DeliveryService', () => {
  it('limits delivery route listing to the current DRIVER routes', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.count.mockResolvedValue(1);
    prisma.deliveryRoute.findMany.mockResolvedValue([
      createRoute({
        deliveryOrders: [
          createOrder({ id: 'order-1', status: DeliveryOrderStatus.PENDING }),
          createOrder({ id: 'order-2', status: DeliveryOrderStatus.DELIVERED }),
        ],
        settlement: { id: 'settlement-1' },
      }),
    ]);

    await expect(service.findRoutes({ status: DeliveryRouteStatus.PENDING }, driver)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'route-1',
          driverId: 'driver-1',
          ordersCount: 2,
          pendingOrdersCount: 1,
          routeSettlementId: 'settlement-1',
        }),
      ],
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    });

    expect(prisma.deliveryRoute.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ driverId: 'driver-1', status: DeliveryRouteStatus.PENDING }),
    });
    expect(prisma.deliveryRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ driverId: 'driver-1', status: DeliveryRouteStatus.PENDING }),
      }),
    );
  });

  it('creates a route with confirmed non-cancelled sales and a ROUTE_STOCK location', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1', role: { name: 'DRIVER' } });
    prisma.sale.findMany.mockResolvedValue([
      { id: 'sale-1', status: SaleStatus.CONFIRMED, accountReceivable: { id: 'ar-1' } },
    ]);
    prisma.operationalLocation.create.mockResolvedValue({ id: 'route-stock-1' });
    prisma.deliveryRoute.create.mockResolvedValue(
      createRoute({ deliveryOrders: [createOrder()], settlement: null }),
    );

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          originLocationId: 'origin-1',
          orders: [{ saleId: 'sale-1', accountReceivableId: 'ar-1', deliveryAddress: 'Av Centro 123' }],
        },
        admin,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'route-1',
        routeStockLocationId: 'route-stock-1',
        orders: [expect.objectContaining({ saleId: 'sale-1', accountReceivableId: 'ar-1' })],
      }),
    );

    expect(prisma.operationalLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: OperationalLocationType.ROUTE_STOCK }) }),
    );
    expect(prisma.deliveryRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeStockLocationId: 'route-stock-1',
          deliveryOrders: { create: [expect.objectContaining({ saleId: 'sale-1' })] },
        }),
      }),
    );
    expect(prisma.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sale-1'] } },
      data: { routeId: 'route-1' },
    });
    expect(prisma.sale.updateMany.mock.calls[0][0].data).not.toHaveProperty('locationId');
  });

  it('assigns confirmed orders to an existing route before settlement is opened', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ deliveryOrders: [createOrder({ id: 'order-1', saleId: 'sale-1' })], settlement: null }),
    );
    prisma.sale.findMany.mockResolvedValue([
      { id: 'sale-2', status: SaleStatus.CONFIRMED, routeId: null, accountReceivable: { id: 'ar-2' } },
    ]);
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ id: 'order-1', saleId: 'sale-1' }),
          createOrder({ id: 'order-2', saleId: 'sale-2', accountReceivableId: 'ar-2', deliveryAddress: 'Av Norte 456' }),
        ],
      }),
    );

    await expect(
      service.assignOrdersToRoute(
        'route-1',
        { orders: [{ saleId: 'sale-2', accountReceivableId: 'ar-2', deliveryAddress: 'Av Norte 456' }] },
        admin,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'route-1',
        orders: expect.arrayContaining([expect.objectContaining({ saleId: 'sale-2', accountReceivableId: 'ar-2' })]),
      }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1' },
        data: { deliveryOrders: { create: [expect.objectContaining({ saleId: 'sale-2' })] } },
      }),
    );
    expect(prisma.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sale-2'] } },
      data: { routeId: 'route-1' },
    });
  });

  it('rejects assigning duplicate or settled route orders to an existing route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ deliveryOrders: [createOrder({ saleId: 'sale-1' })], settlement: null }),
    );

    await expect(
      service.assignOrdersToRoute('route-1', { orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.deliveryRoute.findFirst.mockResolvedValue(createRoute({ settlement: { id: 'settlement-1' } }));
    await expect(
      service.assignOrdersToRoute('route-1', { orders: [{ saleId: 'sale-2', deliveryAddress: 'Av Norte 456' }] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects assigning a cancelled or non-confirmed sale to a route', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1', role: { name: 'DRIVER' } });
    prisma.sale.findMany.mockResolvedValue([{ id: 'sale-1', status: SaleStatus.CANCELLED }]);

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('rejects an accountReceivableId that belongs to a different sale', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1', role: { name: 'DRIVER' } });
    prisma.sale.findMany.mockResolvedValue([
      { id: 'sale-1', status: SaleStatus.CONFIRMED, accountReceivable: { id: 'ar-sale-1' } },
    ]);

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          orders: [{ saleId: 'sale-1', accountReceivableId: 'ar-other-sale', deliveryAddress: 'Av Centro 123' }],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('rejects route creation when the assigned user is not an active DRIVER', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'seller-1',
          scheduledDate: '2026-06-19',
          orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.sale.findMany).not.toHaveBeenCalled();
    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('rejects a provided ROUTE_STOCK location already assigned to another route', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1', role: { name: 'DRIVER' } });
    prisma.sale.findMany.mockResolvedValue([
      { id: 'sale-1', status: SaleStatus.CONFIRMED, accountReceivable: { id: 'ar-1' } },
    ]);
    prisma.operationalLocation.findFirst.mockResolvedValue({ id: 'route-stock-1' });
    prisma.deliveryRoute.findFirst.mockResolvedValue(createRoute({ id: 'route-existing' }));

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          routeStockLocationId: 'route-stock-1',
          orders: [{ saleId: 'sale-1', accountReceivableId: 'ar-1', deliveryAddress: 'Av Centro 123' }],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('blocks route completion while assigned orders are still pending', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ deliveryOrders: [createOrder({ status: DeliveryOrderStatus.PENDING })] }),
    );

    await expect(
      service.updateRouteStatus('route-1', { status: DeliveryRouteStatus.COMPLETED }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('allows a DRIVER to start an own route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(createRoute({ status: DeliveryRouteStatus.PENDING }));
    prisma.deliveryRoute.update.mockResolvedValue(createRoute({ status: DeliveryRouteStatus.IN_PROGRESS, startedAt: date('2026-06-19T09:00:00.000Z') }));

    await expect(
      service.updateRouteStatus('route-1', { status: DeliveryRouteStatus.IN_PROGRESS }, driver),
    ).resolves.toEqual(expect.objectContaining({ status: DeliveryRouteStatus.IN_PROGRESS }));

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeliveryRouteStatus.IN_PROGRESS }),
      }),
    );
  });

  it('rejects DRIVER route transitions to CANCELLED or PENDING', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(createRoute({ status: DeliveryRouteStatus.IN_PROGRESS }));

    await expect(
      service.updateRouteStatus('route-1', { status: DeliveryRouteStatus.CANCELLED }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.updateRouteStatus('route-1', { status: DeliveryRouteStatus.PENDING }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('derives route detail expected collections from linked order receivable outstanding amounts', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ id: 'order-1', accountReceivable: { id: 'ar-1', outstandingAmount: money('500') } }),
          createOrder({ id: 'order-2', accountReceivableId: 'ar-2', accountReceivable: { id: 'ar-2', outstandingAmount: money('125.50') } }),
        ],
        payments: [{ amount: money('200'), paymentMethod: 'CASH', collectionPass: 1 }],
      }),
    );

    await expect(service.findRoute('route-1', admin)).resolves.toEqual(
      expect.objectContaining({
        collectionsSummary: expect.objectContaining({
          expectedAmount: 625.5,
          totalCollectedAmount: 200,
        }),
      }),
    );
  });

  it('lets a DRIVER deliver only an assigned order and stores deliveredAt and deliveredByUserId', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({
        status: DeliveryOrderStatus.DELIVERED,
        deliveredAt: date('2026-06-19T12:00:00.000Z'),
        deliveredByUserId: 'driver-1',
      }),
    );

    await expect(
      service.updateOrderStatus(
        'order-1',
        { status: DeliveryOrderStatus.DELIVERED, deliveredAt: '2026-06-19T12:00:00.000Z' },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'order-1',
        status: DeliveryOrderStatus.DELIVERED,
        deliveredAt: '2026-06-19T12:00:00.000Z',
        deliveredByUserId: 'driver-1',
      }),
    );

    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1', route: { driverId: 'driver-1' } } }),
    );
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeliveryOrderStatus.DELIVERED,
          deliveredAt: date('2026-06-19T12:00:00.000Z'),
          deliveredByUserId: 'driver-1',
        }),
      }),
    );
  });

  it('requires notes for return, partial rejection, or non-delivery incident statuses', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.updateOrderStatus('order-1', { status: DeliveryOrderStatus.RETURNED }, driver),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ status: DeliveryOrderStatus.PARTIALLY_REJECTED, notes: 'Cliente rechazó una parte' }),
    );

    await expect(
      service.updateOrderStatus(
        'order-1',
        { status: DeliveryOrderStatus.PARTIALLY_REJECTED, notes: 'Cliente rechazó una parte' },
        driver,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: DeliveryOrderStatus.PARTIALLY_REJECTED }));
  });

  it('throws not found when a DRIVER tries to update another driver order', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.updateOrderStatus('order-2', { status: DeliveryOrderStatus.IN_ROUTE }, driver),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('captures optional delivery evidence without imposing a pending business-required combination', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryEvidence.create.mockResolvedValue({
      id: 'evidence-1',
      deliveryOrderId: 'order-1',
      type: DeliveryEvidenceType.PHOTO,
      value: 'internal-photo-ref',
      capturedAt: date('2026-06-19T12:05:00.000Z'),
    });

    await expect(
      service.captureEvidence(
        'order-1',
        { type: DeliveryEvidenceType.PHOTO, value: 'internal-photo-ref', capturedAt: '2026-06-19T12:05:00.000Z' },
        driver,
      ),
    ).resolves.toEqual({
      id: 'evidence-1',
      deliveryOrderId: 'order-1',
      type: DeliveryEvidenceType.PHOTO,
      value: 'internal-photo-ref',
      capturedAt: '2026-06-19T12:05:00.000Z',
    });

    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1', route: { driverId: 'driver-1' } } }),
    );
    expect(prisma.deliveryEvidence.create).toHaveBeenCalledWith({
      data: {
        deliveryOrderId: 'order-1',
        type: DeliveryEvidenceType.PHOTO,
        value: 'internal-photo-ref',
        capturedAt: date('2026-06-19T12:05:00.000Z'),
      },
    });
  });

  it('registers a route collection only against the order receivable and applies the payment to one account', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      outstandingAmount: money('500'),
      status: CollectionStatus.UNPAID,
      dueDate: date('2026-06-01T00:00:00.000Z'),
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      userId: 'driver-1',
      collectedByUserId: 'driver-1',
      collectionPass: 1,
      routeId: 'route-1',
      routeSettlementId: null,
      amount: money('200'),
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.APPLIED,
      paidAt: date('2026-06-19T12:10:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('300'),
      status: CollectionStatus.PARTIALLY_PAID,
    });
    prisma.deliveryOrder.update.mockResolvedValue(createOrder({ collectedByUserId: 'driver-1', collectionPass: 1 }));
    prisma.sale.update.mockResolvedValue({ id: 'sale-1' });

    await expect(
      service.registerCollection(
        'order-1',
        {
          accountReceivableId: 'ar-1',
          amount: 200,
          paymentMethod: PaymentMethod.CASH,
          reference: 'Cobro en ruta',
          paidAt: '2026-06-19T12:10:00.000Z',
          collectionPass: 1,
        },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        payment: expect.objectContaining({ id: 'payment-1', accountReceivableId: 'ar-1', routeId: 'route-1' }),
        deliveryOrder: expect.objectContaining({ id: 'order-1', derivedCollectedAmount: 200 }),
      }),
    );

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountReceivableId: 'ar-1',
          routeId: 'route-1',
          routeSettlementId: null,
          status: PaymentStatus.APPLIED,
        }),
      }),
    );
  });

  it('rejects route collections without a matching collectible receivable or over the outstanding balance', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder({ accountReceivableId: 'ar-1' }));

    await expect(
      service.registerCollection('order-1', { accountReceivableId: 'ar-other', amount: 10, paymentMethod: PaymentMethod.CASH }, driver),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('50'),
      status: CollectionStatus.UNPAID,
    });

    await expect(
      service.registerCollection('order-1', { accountReceivableId: 'ar-1', amount: 60, paymentMethod: PaymentMethod.CASH }, driver),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records returned items as traceable ROUTE_STOCK inventory movements for incidents that affect stock', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryOrder.update.mockResolvedValue(createOrder({ status: DeliveryOrderStatus.RETURNED, notes: 'Cliente devolvió producto' }));
    prisma.inventoryBalance.upsert.mockResolvedValue({ quantityKg: money('8.5'), quantityPieces: 4 });
    prisma.inventoryMovement.create.mockResolvedValue({
      id: 'movement-1',
      productId: 'product-1',
      locationId: 'route-stock-1',
      type: InventoryMovementType.RETURN,
      quantityKg: money('2.5'),
      quantityPieces: 0,
      reason: 'Cliente devolvió producto',
    });

    await expect(
      service.registerIncident(
        'order-1',
        {
          status: DeliveryOrderStatus.RETURNED,
          reason: 'Cliente devolvió producto',
          returnedItems: [{ productId: 'product-1', quantityKg: 2.5, quantityPieces: 0, reason: 'Cliente devolvió producto' }],
        },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        deliveryOrder: expect.objectContaining({ status: DeliveryOrderStatus.RETURNED }),
        inventoryMovements: [expect.objectContaining({ id: 'movement-1', locationId: 'route-stock-1' })],
      }),
    );

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          locationId: 'route-stock-1',
          type: InventoryMovementType.RETURN,
          referenceType: 'DeliveryOrder',
          referenceId: 'order-1',
        }),
      }),
    );
  });

  it('opens a route settlement that derives collected totals from Payment and marks differences for review', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ status: DeliveryOrderStatus.DELIVERED, accountReceivable: { id: 'ar-1', outstandingAmount: money('500') } }),
          createOrder({ id: 'order-2', status: DeliveryOrderStatus.RETURNED, accountReceivable: { id: 'ar-2', outstandingAmount: money('100') } }),
        ],
        payments: [
          { amount: money('200'), paymentMethod: PaymentMethod.CASH, collectionPass: 1, status: PaymentStatus.APPLIED },
          { amount: money('50'), paymentMethod: PaymentMethod.TRANSFER, collectionPass: 2, status: PaymentStatus.APPLIED },
        ],
      }),
    );
    prisma.inventoryMovement.findMany.mockResolvedValue([{ id: 'movement-1' }]);
    prisma.routeSettlement.create.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.REVIEW_REQUIRED,
      version: 1,
      expectedCashAmount: money('600'),
      expectedTransferAmount: money('0'),
      differenceAmount: money('350'),
      paidAtDeliveryAmount: money('200'),
      overdueAmount: money('350'),
      secondPassCollectionsAmount: money('50'),
      routeCollectionsSummary: {},
      createdAt: date('2026-06-19T13:00:00.000Z'),
      updatedAt: date('2026-06-19T13:00:00.000Z'),
    });

    await expect(service.openSettlement('route-1', admin)).resolves.toEqual(
      expect.objectContaining({
        id: 'settlement-1',
        status: RouteSettlementStatus.REVIEW_REQUIRED,
        expectedCashAmount: 600,
        derivedCollectedCashAmount: 200,
        derivedCollectedTransferAmount: 50,
        differenceAmount: 350,
      }),
    );

    expect(prisma.routeSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: 'route-1',
          driverId: 'driver-1',
          status: RouteSettlementStatus.REVIEW_REQUIRED,
          differenceAmount: 350,
        }),
      }),
    );
  });

  it('returns the existing route settlement instead of creating a duplicate on recalculation retry', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        settlement: { id: 'settlement-1' },
        deliveryOrders: [createOrder({ status: DeliveryOrderStatus.DELIVERED })],
        payments: [{ amount: money('500'), paymentMethod: PaymentMethod.CASH, collectionPass: 1, status: PaymentStatus.APPLIED }],
      }),
    );
    prisma.routeSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.OPEN,
      version: 1,
      expectedCashAmount: money('500'),
      expectedTransferAmount: money('0'),
      differenceAmount: money('0'),
      paidAtDeliveryAmount: money('500'),
      overdueAmount: money('0'),
      secondPassCollectionsAmount: money('0'),
      closedAt: null,
    });

    await expect(service.openSettlement('route-1', admin)).resolves.toEqual(
      expect.objectContaining({ id: 'settlement-1', status: RouteSettlementStatus.OPEN }),
    );

    expect(prisma.routeSettlement.create).not.toHaveBeenCalled();
  });

  it('closes a route settlement with expectedVersion after all route orders are final', async () => {
    const { service, prisma } = createService();
    prisma.routeSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.OPEN,
      version: 3,
      route: { deliveryOrders: [createOrder({ status: DeliveryOrderStatus.DELIVERED })] },
    });
    prisma.routeSettlement.update.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.CLOSED,
      version: 4,
      expectedCashAmount: money('500'),
      expectedTransferAmount: money('0'),
      differenceAmount: money('0'),
      paidAtDeliveryAmount: money('500'),
      overdueAmount: money('0'),
      secondPassCollectionsAmount: money('0'),
      closedAt: date('2026-06-19T14:00:00.000Z'),
    });

    await expect(
      service.closeSettlement('settlement-1', { expectedVersion: 3, notes: 'Liquidación revisada' }, admin, 'close-idem-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'settlement-1', status: RouteSettlementStatus.CLOSED, version: 4 }));

    expect(prisma.routeSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'settlement-1', version: 3 },
        data: expect.objectContaining({
          status: RouteSettlementStatus.CLOSED,
          notes: 'Liquidación revisada',
          routeCollectionsSummary: expect.objectContaining({
            idempotency: expect.objectContaining({ close: expect.objectContaining({ key: 'close-idem-1' }) }),
          }),
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('deduplicates route settlement close retries with the same Idempotency-Key', async () => {
    const { service, prisma } = createService();
    const routeCollectionsSummary = {
      idempotency: {
        close: {
          key: 'close-idem-1',
          payloadHash: '46a2e3ff85e0665fb79c45b09600f7419bf14475d39447fdad7597ba0eecdd55',
        },
      },
    };
    prisma.routeSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.CLOSED,
      version: 4,
      expectedCashAmount: money('500'),
      expectedTransferAmount: money('0'),
      differenceAmount: money('0'),
      paidAtDeliveryAmount: money('500'),
      overdueAmount: money('0'),
      secondPassCollectionsAmount: money('0'),
      closedAt: date('2026-06-19T14:00:00.000Z'),
      routeCollectionsSummary,
    });

    await expect(
      service.closeSettlement('settlement-1', { expectedVersion: 3, notes: 'Liquidación revisada' }, admin, 'close-idem-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'settlement-1', status: RouteSettlementStatus.CLOSED }));

    expect(prisma.routeSettlement.update).not.toHaveBeenCalled();
  });

  it('reopens a closed route settlement with reason, actor, and expectedVersion', async () => {
    const { service, prisma } = createService();
    prisma.routeSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.CLOSED,
      version: 4,
    });
    prisma.routeSettlement.update.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.OPEN,
      version: 5,
      expectedCashAmount: money('500'),
      expectedTransferAmount: money('0'),
      differenceAmount: money('0'),
      paidAtDeliveryAmount: money('500'),
      overdueAmount: money('0'),
      secondPassCollectionsAmount: money('0'),
      reopenedAt: date('2026-06-19T15:00:00.000Z'),
    });

    await expect(
      service.reopenSettlement('settlement-1', { expectedVersion: 4, reason: 'Revisar diferencia' }, admin, 'reopen-idem-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'settlement-1', status: RouteSettlementStatus.OPEN, version: 5 }));

    expect(prisma.routeSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'settlement-1', version: 4 },
        data: expect.objectContaining({
          status: RouteSettlementStatus.OPEN,
          reopenedByUserId: 'admin-1',
          reopenedReason: 'Revisar diferencia',
          routeCollectionsSummary: expect.objectContaining({
            idempotency: expect.objectContaining({ reopen: expect.objectContaining({ key: 'reopen-idem-1' }) }),
          }),
          version: { increment: 1 },
        }),
      }),
    );
  });
});
