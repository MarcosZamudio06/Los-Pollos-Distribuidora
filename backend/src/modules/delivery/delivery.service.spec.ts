import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  OperationalLocationType,
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
  operationalLocation: { create: jest.Mock; findFirst: jest.Mock };
  sale: { findMany: jest.Mock; updateMany: jest.Mock };
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
    operationalLocation: { create: jest.fn(), findFirst: jest.fn() },
    sale: { findMany: jest.fn(), updateMany: jest.fn() },
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
});
