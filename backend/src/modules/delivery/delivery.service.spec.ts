import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CollectionStatus,
  DeliveryEvidenceType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  DeliveryRouteType,
  InventoryTransferStatus,
  InventoryMovementType,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RouteSettlementStatus,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryBalanceService } from '../inventory/inventory-balance.service';
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
  vehicle: { findFirst: jest.Mock };
  inventoryTransfer: { findUnique: jest.Mock };
  deliveryOrder: {
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  deliveryIncident: { create: jest.Mock; findUnique: jest.Mock };
  vehiclePosition: { findFirst: jest.Mock };
  deliveryRoutePlanDraft: { findFirst: jest.Mock; updateMany: jest.Mock };
  deliveryEvidence: { create: jest.Mock };
  accountReceivable: { findUnique: jest.Mock; update: jest.Mock };
  payment: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  sale: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  inventoryBalance: { upsert: jest.Mock; findUnique: jest.Mock };
  inventoryMovement: {
    create: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  routeSettlement: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  routeSettlementOpeningCommand: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
  operationalLocation: { create: jest.Mock; findFirst: jest.Mock };
  $transaction: jest.Mock;
};

type MockObjectStorage = {
  isConfigured: jest.Mock;
  putObject: jest.Mock;
  deleteObject: jest.Mock;
  getDownloadUrl: jest.Mock;
};

const admin = { id: 'admin-1', role: 'ADMIN' };
const seller = { id: 'seller-1', role: 'SELLER' };
const driver = { id: 'driver-1', role: 'DRIVER' };
const ONE_BY_ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngDataUrlWithDimensions(width: number, height: number) {
  const bytes = Buffer.from(ONE_BY_ONE_PNG_DATA_URL.split(',')[1], 'base64');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

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
    accountReceivable: {
      id: 'ar-1',
      outstandingAmount: money('500'),
      version: 1,
    },
    evidence: [],
    route: createRoute(),
    ...overrides,
  };
}

function createLogisticsTransfer(
  type: DeliveryRouteType = DeliveryRouteType.BRANCH_RETURN,
  overrides: Record<string, unknown> = {},
) {
  const isSupply = type === DeliveryRouteType.CEDIS_SUPPLY;
  const originId = isSupply ? 'cedis-1' : 'branch-1';
  const destinationId = isSupply ? 'branch-1' : 'cedis-1';
  const originType = isSupply
    ? OperationalLocationType.DISTRIBUTION_CENTER
    : OperationalLocationType.BRANCH;
  const destinationType = isSupply
    ? OperationalLocationType.BRANCH
    : OperationalLocationType.DISTRIBUTION_CENTER;
  return {
    id: 'transfer-1',
    transferNumber: 'TRF-001',
    originLocationId: originId,
    destinationLocationId: destinationId,
    originLocation: {
      id: originId,
      name: isSupply ? 'CEDIS Principal' : 'Sucursal Centro',
      type: originType,
      isActive: true,
      latitude: new Prisma.Decimal('19.170000'),
      longitude: new Prisma.Decimal('-96.130000'),
    },
    destinationLocation: {
      id: destinationId,
      name: isSupply ? 'Sucursal Centro' : 'CEDIS Principal',
      type: destinationType,
      isActive: true,
      latitude: new Prisma.Decimal('19.180000'),
      longitude: new Prisma.Decimal('-96.140000'),
    },
    deliveryRoute: null,
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
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1' }) },
    inventoryTransfer: { findUnique: jest.fn() },
    deliveryOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    deliveryIncident: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'incident-1',
        type: 'DELIVERY_FAILURE',
        status: 'OPEN',
        reason: 'Cliente devolvió producto',
        routeId: 'route-1',
        deliveryOrderId: 'order-1',
        vehicleId: null,
        driverId: 'driver-1',
        positionId: null,
        statusSnapshot: DeliveryOrderStatus.RETURNED,
        latitude: null,
        longitude: null,
        returnedItems: [],
        evidence: [],
        occurredAt: date('2026-06-19T12:15:00.000Z'),
        reportedAt: date('2026-06-19T12:15:00.000Z'),
        reportedByUserId: 'driver-1',
        createdAt: date('2026-06-19T12:15:00.000Z'),
        updatedAt: date('2026-06-19T12:15:00.000Z'),
      }),
    },
    vehiclePosition: { findFirst: jest.fn().mockResolvedValue(null) },
    deliveryRoutePlanDraft: { findFirst: jest.fn(), updateMany: jest.fn() },
    deliveryEvidence: { create: jest.fn() },
    accountReceivable: { findUnique: jest.fn(), update: jest.fn() },
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    inventoryBalance: { upsert: jest.fn(), findUnique: jest.fn() },
    inventoryMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    routeSettlement: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    routeSettlementOpeningCommand: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    operationalLocation: { create: jest.fn(), findFirst: jest.fn() },
    sale: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((callback) => callback(prisma)),
  };
  return prisma;
}

function createObjectStorage(): MockObjectStorage {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getDownloadUrl: jest
      .fn()
      .mockImplementation((key: string) => `https://objects.test/${key}`),
  };
}

function createService(
  prisma = createPrisma(),
  fleetGateway?: { emitIncidentCreated: jest.Mock },
  objectStorage = createObjectStorage(),
) {
  return {
    service: new DeliveryService(
      prisma as unknown as PrismaService,
      new InventoryBalanceService(),
      fleetGateway as never,
      objectStorage as never,
    ),
    prisma,
    objectStorage,
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

    await expect(
      service.findRoutes({ status: DeliveryRouteStatus.PENDING }, driver),
    ).resolves.toEqual({
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
      where: expect.objectContaining({
        driverId: 'driver-1',
        status: DeliveryRouteStatus.PENDING,
      }),
    });
    expect(prisma.deliveryRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driverId: 'driver-1',
          status: DeliveryRouteStatus.PENDING,
        }),
      }),
    );
  });

  it('includes assigned commercial and logistics routes in the same DRIVER listing', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.count.mockResolvedValue(2);
    prisma.deliveryRoute.findMany.mockResolvedValue([
      createRoute({ id: 'sale-route', type: DeliveryRouteType.SALE_DELIVERY }),
      createRoute({
        id: 'return-route',
        type: DeliveryRouteType.BRANCH_RETURN,
        vehicleId: 'vehicle-1',
        inventoryTransferId: 'transfer-1',
      }),
    ]);

    const result = await service.findRoutes({}, driver);

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'sale-route',
        type: DeliveryRouteType.SALE_DELIVERY,
      }),
      expect.objectContaining({
        id: 'return-route',
        type: DeliveryRouteType.BRANCH_RETURN,
        inventoryTransferId: 'transfer-1',
      }),
    ]);
    expect(prisma.deliveryRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 'driver-1' },
      }),
    );
  });

  it('exposes the explicit logistics purpose and transfer link in route listings', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.count.mockResolvedValue(1);
    prisma.deliveryRoute.findMany.mockResolvedValue([
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        vehicleId: 'vehicle-1',
        inventoryTransferId: 'transfer-1',
      }),
    ]);

    await expect(service.findRoutes({}, admin)).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            type: DeliveryRouteType.BRANCH_RETURN,
            inventoryTransferId: 'transfer-1',
            vehicleId: 'vehicle-1',
          }),
        ],
      }),
    );
  });

  it('returns a logistics stop without commercial orders, CxC, or collection data', async () => {
    const { service, prisma } = createService();
    const transfer = {
      id: 'transfer-1',
      transferNumber: 'TR-1001',
      status: InventoryTransferStatus.REQUESTED,
      originLocationId: 'branch-1',
      destinationLocationId: 'cedis-1',
      originLocation: {
        id: 'branch-1',
        name: 'Sucursal Centro',
        type: 'BRANCH',
        latitude: money('19.1700'),
        longitude: money('-96.1300'),
      },
      destinationLocation: {
        id: 'cedis-1',
        name: 'CEDIS Principal',
        type: 'DISTRIBUTION_CENTER',
        latitude: money('19.1800'),
        longitude: money('-96.1400'),
      },
      items: [
        {
          id: 'transfer-item-1',
          productId: 'product-1',
          unit: 'KG',
          quantityKg: money('10.000'),
          quantityPieces: 0,
          product: { id: 'product-1', name: 'Pollo', unit: 'KG' },
        },
      ],
    };
    prisma.deliveryRoute.findFirst
      .mockResolvedValueOnce({ type: DeliveryRouteType.BRANCH_RETURN })
      .mockResolvedValueOnce(
        createRoute({
          type: DeliveryRouteType.BRANCH_RETURN,
          inventoryTransferId: transfer.id,
          inventoryTransfer: transfer,
        }),
      );

    const result = await service.findRoute('route-1', driver);

    expect(result).toEqual(
      expect.objectContaining({
        type: DeliveryRouteType.BRANCH_RETURN,
        orders: [],
        collectionsSummary: null,
        logisticsStop: expect.objectContaining({
          status: 'PENDING',
          inventoryTransferId: transfer.id,
          origin: expect.objectContaining({ id: 'branch-1' }),
          destination: expect.objectContaining({ id: 'cedis-1' }),
          items: [expect.objectContaining({ productId: 'product-1' })],
        }),
      }),
    );

    const detailCall = prisma.deliveryRoute.findFirst.mock.calls[1]?.[0] as {
      include?: Record<string, unknown>;
    };
    expect(detailCall.include).not.toHaveProperty('payments');
    expect(detailCall.include).not.toHaveProperty('deliveryOrders');
    expect(prisma.accountReceivable.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('returns the approved map, ordered stops, and customer to the assigned DRIVER', async () => {
    const { service, prisma } = createService();
    const geometry = {
      type: 'LineString',
      coordinates: [
        [-96.14, 19.18],
        [-96.13, 19.17],
      ],
    };
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        vehicleId: 'vehicle-1',
        vehicle: {
          id: 'vehicle-1',
          code: 'UNIDAD-01',
          displayName: 'Unidad 1',
          plateNumber: 'ABC-123',
        },
        optimizationStatus: 'OPTIMIZED',
        geometry,
        distanceMeters: 8600,
        durationSeconds: 1440,
        deliveryOrders: [
          createOrder({
            stopSequence: 1,
            latitude: money('19.1738'),
            longitude: money('-96.1342'),
            legDistanceMeters: 4300,
            legDurationSeconds: 720,
            sale: {
              id: 'sale-1',
              saleNumber: 'S-1001',
              customer: { name: 'Polleria Centro' },
            },
          }),
        ],
      }),
    );

    await expect(service.findRoute('route-1', driver)).resolves.toEqual(
      expect.objectContaining({
        mapAvailable: true,
        vehicleId: 'vehicle-1',
        vehicleCode: 'UNIDAD-01',
        vehicle: expect.objectContaining({
          displayName: 'Unidad 1',
          plateNumber: 'ABC-123',
        }),
        geometry,
        distanceMeters: 8600,
        durationSeconds: 1440,
        orders: [
          expect.objectContaining({
            customerName: 'Polleria Centro',
            stopSequence: 1,
            latitude: 19.1738,
            longitude: -96.1342,
            legDistanceMeters: 4300,
            legDurationSeconds: 720,
          }),
        ],
      }),
    );

    expect(prisma.deliveryRoute.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1', driverId: 'driver-1' },
        include: expect.objectContaining({
          deliveryOrders: expect.objectContaining({
            orderBy: [{ stopSequence: 'asc' }, { createdAt: 'asc' }],
          }),
        }),
      }),
    );
  });

  it('creates a route with confirmed non-cancelled sales and a ROUTE_STOCK location', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        accountReceivable: { id: 'ar-1' },
      },
    ]);
    prisma.operationalLocation.create.mockResolvedValue({
      id: 'route-stock-1',
    });
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
          orders: [
            {
              saleId: 'sale-1',
              accountReceivableId: 'ar-1',
              deliveryAddress: 'Av Centro 123',
            },
          ],
        },
        admin,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'route-1',
        routeStockLocationId: 'route-stock-1',
        orders: [
          expect.objectContaining({
            saleId: 'sale-1',
            accountReceivableId: 'ar-1',
          }),
        ],
      }),
    );

    expect(prisma.operationalLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: OperationalLocationType.ROUTE_STOCK,
        }),
      }),
    );
    expect(prisma.deliveryRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeStockLocationId: 'route-stock-1',
          deliveryOrders: {
            create: [expect.objectContaining({ saleId: 'sale-1' })],
          },
        }),
      }),
    );
    expect(prisma.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sale-1'] } },
      data: { routeId: 'route-1' },
    });
    expect(prisma.sale.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'locationId',
    );
  });

  it.each([
    {
      type: DeliveryRouteType.CEDIS_SUPPLY,
      originType: OperationalLocationType.DISTRIBUTION_CENTER,
      destinationType: OperationalLocationType.BRANCH,
      originId: 'cedis-1',
      destinationId: 'branch-1',
    },
    {
      type: DeliveryRouteType.BRANCH_RETURN,
      originType: OperationalLocationType.BRANCH,
      destinationType: OperationalLocationType.DISTRIBUTION_CENTER,
      originId: 'branch-1',
      destinationId: 'cedis-1',
    },
  ])(
    'creates a $type route from the transfer locations with a validated driver and vehicle',
    async ({ type, originType, destinationType, originId, destinationId }) => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValue({ id: 'driver-1' });
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
      prisma.inventoryTransfer.findUnique.mockResolvedValue({
        id: 'transfer-1',
        transferNumber: 'TRF-001',
        originLocationId: originId,
        destinationLocationId: destinationId,
        originLocation: {
          id: originId,
          name: 'Origen',
          type: originType,
          isActive: true,
          latitude: new Prisma.Decimal('19.170000'),
          longitude: new Prisma.Decimal('-96.130000'),
        },
        destinationLocation: {
          id: destinationId,
          name: 'Destino',
          type: destinationType,
          isActive: true,
          latitude: new Prisma.Decimal('19.180000'),
          longitude: new Prisma.Decimal('-96.140000'),
        },
        deliveryRoute: null,
      });
      prisma.operationalLocation.create.mockResolvedValue({
        id: 'route-stock-1',
      });
      prisma.deliveryRoute.create.mockResolvedValue(
        createRoute({
          type,
          inventoryTransferId: 'transfer-1',
          vehicleId: 'vehicle-1',
        }),
      );

      await service.createLogisticsRoute(
        prisma as unknown as Prisma.TransactionClient,
        {
          inventoryTransferId: 'transfer-1',
          type,
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          scheduledDate: date('2026-08-05T00:00:00.000Z'),
        },
      );

      expect(prisma.deliveryRoute.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type,
          inventoryTransferId: 'transfer-1',
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          originLocationId: originId,
          routeStockLocationId: 'route-stock-1',
        }),
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          isActive: true,
          role: { name: 'DRIVER' },
        },
        select: { id: true },
      });
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: { id: 'vehicle-1', isActive: true },
        select: { id: true },
      });
      expect(prisma.deliveryRoute.findFirst).toHaveBeenCalledWith({
        where: {
          vehicleId: 'vehicle-1',
          status: DeliveryRouteStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      expect(prisma.operationalLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: OperationalLocationType.ROUTE_STOCK,
          }),
        }),
      );
    },
  );

  it('rejects a logistics route assigned to a missing, inactive, or non-DRIVER user', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createLogisticsTransfer(),
    );
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.createLogisticsRoute(
        prisma as unknown as Prisma.TransactionClient,
        {
          inventoryTransferId: 'transfer-1',
          type: DeliveryRouteType.BRANCH_RETURN,
          driverId: 'not-a-driver',
          vehicleId: 'vehicle-1',
          scheduledDate: date('2026-08-05T00:00:00.000Z'),
        },
      ),
    ).rejects.toThrow('Assigned driver must be an active DRIVER user');

    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('rejects a logistics route with an inactive or unknown vehicle', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createLogisticsTransfer(DeliveryRouteType.CEDIS_SUPPLY),
    );
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1' });
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      service.createLogisticsRoute(
        prisma as unknown as Prisma.TransactionClient,
        {
          inventoryTransferId: 'transfer-1',
          type: DeliveryRouteType.CEDIS_SUPPLY,
          driverId: 'driver-1',
          vehicleId: 'inactive-vehicle',
          scheduledDate: date('2026-08-05T00:00:00.000Z'),
        },
      ),
    ).rejects.toThrow('Assigned vehicle must be an active fleet vehicle');

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('rejects a logistics route when the assigned vehicle is already in progress', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createLogisticsTransfer(),
    );
    prisma.user.findFirst.mockResolvedValue({ id: 'driver-1' });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.deliveryRoute.findFirst.mockResolvedValue({ id: 'busy-route' });

    await expect(
      service.createLogisticsRoute(
        prisma as unknown as Prisma.TransactionClient,
        {
          inventoryTransferId: 'transfer-1',
          type: DeliveryRouteType.BRANCH_RETURN,
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          scheduledDate: date('2026-08-05T00:00:00.000Z'),
        },
      ),
    ).rejects.toThrow('The selected vehicle already has an in-progress route');

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it.each([
    ['origin', DeliveryRouteType.BRANCH_RETURN],
    ['destination', DeliveryRouteType.CEDIS_SUPPLY],
  ] as const)(
    'rejects a logistics route when the canonical %s location lacks coordinates',
    async (location, type) => {
      const { service, prisma } = createService();
      const validTransfer = createLogisticsTransfer(type);
      const transfer = {
        ...validTransfer,
        ...(location === 'origin'
          ? {
              originLocation: {
                ...validTransfer.originLocation,
                latitude: null,
              },
            }
          : {
              destinationLocation: {
                ...validTransfer.destinationLocation,
                longitude: null,
              },
            }),
      };
      prisma.inventoryTransfer.findUnique.mockResolvedValue({
        ...transfer,
      });

      await expect(
        service.createLogisticsRoute(
          prisma as unknown as Prisma.TransactionClient,
          {
            inventoryTransferId: 'transfer-1',
            type,
            driverId: 'driver-1',
            vehicleId: 'vehicle-1',
            scheduledDate: date('2026-08-05T00:00:00.000Z'),
          },
        ),
      ).rejects.toThrow(
        `LOGISTICS_ROUTE_${location.toUpperCase()}_COORDINATES_REQUIRED`,
      );
      expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
    },
  );

  it('does not expose a logistics route to another DRIVER', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);

    await expect(
      service.findRoute('route-1', { ...driver, id: 'driver-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.deliveryRoute.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1', driverId: 'driver-2' },
      }),
    );
  });

  it('derives the sale account receivable when manual route creation omits it', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        accountReceivable: { id: 'ar-1' },
      },
    ]);
    prisma.operationalLocation.create.mockResolvedValue({
      id: 'route-stock-1',
    });
    prisma.deliveryRoute.create.mockResolvedValue(
      createRoute({ deliveryOrders: [createOrder()] }),
    );

    await service.createRoute(
      {
        name: 'Ruta Centro',
        driverId: 'driver-1',
        scheduledDate: '2026-06-19',
        originLocationId: 'origin-1',
        orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }],
      },
      admin,
    );

    expect(prisma.deliveryRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryOrders: {
            create: [
              expect.objectContaining({
                saleId: 'sale-1',
                accountReceivableId: 'ar-1',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('requires SELLER route creation to consume an owned optimized plan', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createRoute(
        {
          name: 'Ruta manual no autorizada',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }],
        },
        seller,
      ),
    ).rejects.toThrow('Delivery route plan not found');

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('atomically consumes an optimized route plan with idempotency', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);
    prisma.deliveryRoutePlanDraft.findFirst.mockResolvedValue({
      id: 'plan-1',
      createdByUserId: 'seller-1',
      sourceRouteId: null,
      consumedAt: null,
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      scheduledDate: date('2026-06-19T00:00:00.000Z'),
      originLocationId: 'origin-1',
      expiresAt: date('2099-06-19T10:30:00.000Z'),
      orderedStops: [
        {
          saleId: 'sale-1',
          accountReceivableId: 'ar-1',
          deliveryAddress: 'Av Centro 123',
          latitude: 19.1738,
          longitude: -96.1342,
          sequence: 1,
          legDistanceMeters: 4300,
          legDurationSeconds: 720,
        },
      ],
      geometry: {
        type: 'LineString',
        coordinates: [
          [-96.14, 19.18],
          [-96.13, 19.17],
          [-96.14, 19.18],
        ],
      },
      distanceMeters: 8600,
      durationSeconds: 1440,
      routingProfile: 'driving',
      routingDataVersion: 'mx-2026-06',
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        routeId: null,
        accountReceivable: { id: 'ar-1' },
      },
    ]);
    prisma.operationalLocation.findFirst.mockResolvedValue({ id: 'origin-1' });
    prisma.operationalLocation.create.mockResolvedValue({
      id: 'route-stock-1',
    });
    prisma.deliveryRoutePlanDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.deliveryRoute.create.mockResolvedValue(
      createRoute({
        optimizationStatus: 'OPTIMIZED',
        geometry: { type: 'LineString', coordinates: [] },
        deliveryOrders: [
          createOrder({
            latitude: money('19.1738'),
            longitude: money('-96.1342'),
            stopSequence: 1,
          }),
        ],
      }),
    );

    await service.createRoute(
      {
        name: 'Ruta Centro',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        scheduledDate: '2026-06-19',
        originLocationId: 'origin-1',
        routePlanId: 'plan-1',
        orders: [],
      },
      seller,
      'key-1',
    );

    expect(prisma.deliveryRoute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: 'vehicle-1',
          optimizationStatus: 'OPTIMIZED',
          creationIdempotencyKey: 'key-1',
          deliveryOrders: {
            create: [
              expect.objectContaining({
                saleId: 'sale-1',
                stopSequence: 1,
                latitude: 19.1738,
              }),
            ],
          },
        }),
      }),
    );
    expect(prisma.deliveryRoutePlanDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'plan-1', consumedAt: null }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
  });

  it('allows multiple PENDING routes for the same vehicle', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.operationalLocation.findFirst.mockResolvedValue({
      id: 'route-stock-1',
      type: OperationalLocationType.ROUTE_STOCK,
      isActive: true,
    });
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        routeId: null,
        accountReceivable: null,
      },
    ]);
    prisma.deliveryRoute.create
      .mockResolvedValueOnce(
        createRoute({ id: 'route-1', vehicleId: 'vehicle-1' }),
      )
      .mockResolvedValueOnce(
        createRoute({ id: 'route-2', vehicleId: 'vehicle-1' }),
      );

    const payload = {
      name: 'Ruta Centro',
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      scheduledDate: '2026-06-19',
      routeStockLocationId: 'route-stock-1',
      orders: [
        {
          saleId: 'sale-1',
          deliveryAddress: 'Av Centro 123',
        },
      ],
    };

    await service.createRoute(payload, admin);
    await service.createRoute({ ...payload, name: 'Ruta Centro tarde' }, admin);

    expect(prisma.deliveryRoute.create).toHaveBeenCalledTimes(2);
    expect(prisma.deliveryRoute.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 'vehicle-1' }),
      }),
    );
  });

  it('rejects optimized route creation when the body vehicle differs from the plan', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoutePlanDraft.findFirst.mockResolvedValue({
      id: 'plan-1',
      createdByUserId: 'admin-1',
      sourceRouteId: null,
      consumedAt: null,
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      scheduledDate: date('2026-06-19T00:00:00.000Z'),
      originLocationId: 'origin-1',
      expiresAt: date('2099-06-19T10:30:00.000Z'),
    });

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          vehicleId: 'vehicle-2',
          scheduledDate: '2026-06-19',
          originLocationId: 'origin-1',
          routePlanId: 'plan-1',
          orders: [],
        },
        admin,
        'key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('assigns confirmed orders to an existing route before settlement is opened', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [createOrder({ id: 'order-1', saleId: 'sale-1' })],
        settlement: null,
      }),
    );
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-2',
        status: SaleStatus.CONFIRMED,
        routeId: null,
        accountReceivable: { id: 'ar-2' },
      },
    ]);
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ id: 'order-1', saleId: 'sale-1' }),
          createOrder({
            id: 'order-2',
            saleId: 'sale-2',
            accountReceivableId: 'ar-2',
            deliveryAddress: 'Av Norte 456',
          }),
        ],
      }),
    );

    await expect(
      service.assignOrdersToRoute(
        'route-1',
        {
          orders: [
            {
              saleId: 'sale-2',
              accountReceivableId: 'ar-2',
              deliveryAddress: 'Av Norte 456',
            },
          ],
        },
        admin,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'route-1',
        orders: expect.arrayContaining([
          expect.objectContaining({
            saleId: 'sale-2',
            accountReceivableId: 'ar-2',
          }),
        ]),
      }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1' },
        data: {
          deliveryOrders: {
            create: [expect.objectContaining({ saleId: 'sale-2' })],
          },
        },
      }),
    );
    expect(prisma.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sale-2'] } },
      data: { routeId: 'route-1' },
    });
  });

  it('derives the sale account receivable when assigning to a route without it', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [createOrder({ id: 'order-1', saleId: 'sale-1' })],
        settlement: null,
      }),
    );
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-2',
        status: SaleStatus.CONFIRMED,
        routeId: null,
        accountReceivable: { id: 'ar-2' },
      },
    ]);
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ id: 'order-1', saleId: 'sale-1' }),
          createOrder({
            id: 'order-2',
            saleId: 'sale-2',
            accountReceivableId: 'ar-2',
            deliveryAddress: 'Av Norte 456',
          }),
        ],
      }),
    );

    await service.assignOrdersToRoute(
      'route-1',
      {
        orders: [{ saleId: 'sale-2', deliveryAddress: 'Av Norte 456' }],
      },
      admin,
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          deliveryOrders: {
            create: [
              expect.objectContaining({
                saleId: 'sale-2',
                accountReceivableId: 'ar-2',
              }),
            ],
          },
        },
      }),
    );
  });

  it('reoptimizes an optimized route when assigning a combined route plan', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst
      .mockResolvedValueOnce(
        createRoute({
          optimizationStatus: 'OPTIMIZED',
          deliveryOrders: [createOrder({ saleId: 'sale-1', stopSequence: 1 })],
          settlement: null,
        }),
      )
      .mockResolvedValueOnce(null);
    prisma.deliveryRoutePlanDraft.findFirst.mockResolvedValue({
      id: 'plan-2',
      sourceRouteId: 'route-1',
      createdByUserId: 'admin-1',
      consumedAt: null,
      vehicleId: 'vehicle-1',
      expiresAt: date('2099-06-19T10:30:00.000Z'),
      driverId: 'driver-1',
      originLocationId: 'origin-1',
      scheduledDate: date('2026-06-19T00:00:00.000Z'),
      orderedStops: [
        {
          saleId: 'sale-1',
          deliveryAddress: 'Av Centro 123',
          latitude: 19.17,
          longitude: -96.13,
          sequence: 2,
          legDistanceMeters: 2000,
          legDurationSeconds: 300,
        },
        {
          saleId: 'sale-2',
          deliveryAddress: 'Av Norte 456',
          latitude: 19.19,
          longitude: -96.12,
          sequence: 1,
          legDistanceMeters: 3000,
          legDurationSeconds: 500,
        },
      ],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 10000,
      durationSeconds: 1600,
      routingProfile: 'driving',
      routingDataVersion: 'mx-2026-06',
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        routeId: 'route-1',
        accountReceivable: null,
      },
      {
        id: 'sale-2',
        status: SaleStatus.CONFIRMED,
        routeId: null,
        accountReceivable: null,
      },
    ]);
    prisma.deliveryOrder.update.mockResolvedValue(createOrder());
    prisma.deliveryRoutePlanDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({ optimizationStatus: 'OPTIMIZED', deliveryOrders: [] }),
    );

    await service.assignOrdersToRoute(
      'route-1',
      { routePlanId: 'plan-2', orders: [] },
      admin,
    );

    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleId: 'sale-1' },
        data: expect.objectContaining({ stopSequence: 2 }),
      }),
    );
    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          distanceMeters: 10000,
          deliveryOrders: {
            create: [
              expect.objectContaining({ saleId: 'sale-2', stopSequence: 1 }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects assigning duplicate or settled route orders to an existing route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [createOrder({ saleId: 'sale-1' })],
        settlement: null,
      }),
    );

    await expect(
      service.assignOrdersToRoute(
        'route-1',
        { orders: [{ saleId: 'sale-1', deliveryAddress: 'Av Centro 123' }] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ settlement: { id: 'settlement-1' } }),
    );
    await expect(
      service.assignOrdersToRoute(
        'route-1',
        { orders: [{ saleId: 'sale-2', deliveryAddress: 'Av Norte 456' }] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects assigning a cancelled or non-confirmed sale to a route', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.sale.findMany.mockResolvedValue([
      { id: 'sale-1', status: SaleStatus.CANCELLED },
    ]);

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
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        accountReceivable: { id: 'ar-sale-1' },
      },
    ]);

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          orders: [
            {
              saleId: 'sale-1',
              accountReceivableId: 'ar-other-sale',
              deliveryAddress: 'Av Centro 123',
            },
          ],
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
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      role: { name: 'DRIVER' },
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: SaleStatus.CONFIRMED,
        accountReceivable: { id: 'ar-1' },
      },
    ]);
    prisma.operationalLocation.findFirst.mockResolvedValue({
      id: 'route-stock-1',
    });
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ id: 'route-existing' }),
    );

    await expect(
      service.createRoute(
        {
          name: 'Ruta Centro',
          driverId: 'driver-1',
          scheduledDate: '2026-06-19',
          routeStockLocationId: 'route-stock-1',
          orders: [
            {
              saleId: 'sale-1',
              accountReceivableId: 'ar-1',
              deliveryAddress: 'Av Centro 123',
            },
          ],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.create).not.toHaveBeenCalled();
  });

  it('blocks route completion while assigned orders are still pending', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [createOrder({ status: DeliveryOrderStatus.PENDING })],
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.COMPLETED },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('allows a DRIVER to complete an own route after all orders reach final status', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        status: DeliveryRouteStatus.IN_PROGRESS,
        deliveryOrders: [
          createOrder({ id: 'order-1', status: DeliveryOrderStatus.DELIVERED }),
          createOrder({
            id: 'order-2',
            status: DeliveryOrderStatus.DELIVERED,
          }),
        ],
      }),
    );
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        status: DeliveryRouteStatus.COMPLETED,
        completedAt: date('2026-06-19T14:00:00.000Z'),
        deliveryOrders: [
          createOrder({ id: 'order-1', status: DeliveryOrderStatus.DELIVERED }),
          createOrder({
            id: 'order-2',
            status: DeliveryOrderStatus.DELIVERED,
          }),
        ],
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.COMPLETED },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ status: DeliveryRouteStatus.COMPLETED }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1' },
        data: expect.objectContaining({
          status: DeliveryRouteStatus.COMPLETED,
        }),
      }),
    );
  });

  it('requires the logistics stop before completing a BRANCH_RETURN route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        deliveryOrders: [],
        logisticsStopCompletedAt: null,
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.COMPLETED },
        driver,
      ),
    ).rejects.toThrow(
      'Cannot complete logistics route before completing its stop',
    );

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
    expect(prisma.accountReceivable.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('completes a logistics route after the transport stop without settlement or CxC checks', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        deliveryOrders: [],
        logisticsStopCompletedAt: date('2026-06-19T12:00:00.000Z'),
        logisticsStopCompletedByUserId: driver.id,
      }),
    );
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        status: DeliveryRouteStatus.COMPLETED,
        inventoryTransferId: 'transfer-1',
        deliveryOrders: [],
        logisticsStopCompletedAt: date('2026-06-19T12:00:00.000Z'),
        logisticsStopCompletedByUserId: driver.id,
        completedAt: date('2026-06-19T13:00:00.000Z'),
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.COMPLETED },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        status: DeliveryRouteStatus.COMPLETED,
        pendingStopsCount: 0,
      }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalled();
    expect(prisma.accountReceivable.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('confirms a logistics transport stop through DeliveryRoute, not DeliveryOrder or inventory accounting', async () => {
    const { service, prisma } = createService();
    const transfer = {
      id: 'transfer-1',
      transferNumber: 'TR-1002',
      status: InventoryTransferStatus.IN_TRANSIT,
      originLocationId: 'cedis-1',
      destinationLocationId: 'branch-1',
      originLocation: {
        id: 'cedis-1',
        name: 'CEDIS Principal',
        type: 'DISTRIBUTION_CENTER',
        latitude: money('19.1800'),
        longitude: money('-96.1400'),
      },
      destinationLocation: {
        id: 'branch-1',
        name: 'Sucursal Centro',
        type: 'BRANCH',
        latitude: money('19.1700'),
        longitude: money('-96.1300'),
      },
      items: [],
    };
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: transfer.id,
        vehicleId: 'vehicle-1',
        inventoryTransfer: {
          id: transfer.id,
          status: transfer.status,
          destinationLocation: transfer.destinationLocation,
        },
        deliveryOrders: [],
      }),
    );
    prisma.vehiclePosition.findFirst.mockResolvedValue({
      latitude: money('19.1700'),
      longitude: money('-96.1300'),
      accuracyMeters: money('10'),
      recordedAt: new Date(Date.now() - 10_000),
      receivedAt: new Date(Date.now() - 5_000),
    });
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: transfer.id,
        inventoryTransfer: transfer,
        logisticsStopCompletedAt: date('2026-06-19T12:30:00.000Z'),
        logisticsStopCompletedByUserId: driver.id,
        logisticsStopNotes: 'Recibido por almacén de sucursal',
        deliveryOrders: [],
      }),
    );

    await expect(
      service.completeLogisticsStop(
        'route-1',
        { notes: 'Recibido por almacén de sucursal' },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        logisticsStop: expect.objectContaining({
          status: 'COMPLETED',
          completedByUserId: driver.id,
          notes: 'Recibido por almacén de sucursal',
        }),
      }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1' },
        data: expect.objectContaining({
          logisticsStopCompletedByUserId: driver.id,
          logisticsStopNotes: 'Recibido por almacén de sucursal',
        }),
      }),
    );
    expect(prisma.vehiclePosition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          routeId: 'route-1',
          driverId: driver.id,
          vehicleId: 'vehicle-1',
        },
      }),
    );
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    expect(prisma.accountReceivable.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a logistics stop without a recent persisted GPS position', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        inventoryTransfer: {
          id: 'transfer-1',
          status: InventoryTransferStatus.IN_TRANSIT,
          destinationLocation: {
            latitude: money('19.1700'),
            longitude: money('-96.1300'),
          },
        },
        deliveryOrders: [],
      }),
    );

    await expect(
      service.completeLogisticsStop('route-1', {}, driver),
    ).rejects.toThrow(
      'A recent accurate GPS position at the logistics destination is required',
    );

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects a logistics stop when persisted GPS accuracy is above the limit', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        inventoryTransfer: {
          id: 'transfer-1',
          status: InventoryTransferStatus.IN_TRANSIT,
          destinationLocation: {
            latitude: money('19.1700'),
            longitude: money('-96.1300'),
          },
        },
        deliveryOrders: [],
      }),
    );
    prisma.vehiclePosition.findFirst.mockResolvedValue({
      latitude: money('19.1700'),
      longitude: money('-96.1300'),
      accuracyMeters: money('100.01'),
      recordedAt: new Date(Date.now() - 10_000),
      receivedAt: new Date(Date.now() - 5_000),
    });

    await expect(
      service.completeLogisticsStop('route-1', {}, driver),
    ).rejects.toThrow('GPS accuracy must be 100 meters or less');

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects a logistics stop when persisted GPS is stale', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        inventoryTransfer: {
          id: 'transfer-1',
          status: InventoryTransferStatus.IN_TRANSIT,
          destinationLocation: {
            latitude: money('19.1700'),
            longitude: money('-96.1300'),
          },
        },
        deliveryOrders: [],
      }),
    );
    prisma.vehiclePosition.findFirst.mockResolvedValue({
      latitude: money('19.1700'),
      longitude: money('-96.1300'),
      accuracyMeters: money('10'),
      recordedAt: new Date(Date.now() - 61_000),
      receivedAt: new Date(Date.now() - 5_000),
    });

    await expect(
      service.completeLogisticsStop('route-1', {}, driver),
    ).rejects.toThrow('GPS position is stale');

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects a logistics stop when persisted GPS is outside the destination radius', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        type: DeliveryRouteType.BRANCH_RETURN,
        status: DeliveryRouteStatus.IN_PROGRESS,
        inventoryTransferId: 'transfer-1',
        inventoryTransfer: {
          id: 'transfer-1',
          status: InventoryTransferStatus.IN_TRANSIT,
          destinationLocation: {
            latitude: money('19.1700'),
            longitude: money('-96.1300'),
          },
        },
        deliveryOrders: [],
      }),
    );
    prisma.vehiclePosition.findFirst.mockResolvedValue({
      latitude: money('19.1800'),
      longitude: money('-96.1300'),
      accuracyMeters: money('10'),
      recordedAt: new Date(Date.now() - 10_000),
      receivedAt: new Date(Date.now() - 5_000),
    });

    await expect(
      service.completeLogisticsStop('route-1', {}, driver),
    ).rejects.toThrow(
      'GPS position must be within 150 meters of the destination',
    );

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects route collections on a logistics order context before touching Payment or CxC', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        route: createRoute({ type: DeliveryRouteType.BRANCH_RETURN }),
      }),
    );

    await expect(
      service.registerCollection(
        'order-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
          expectedVersion: 1,
        },
        driver,
        'logistics-collection-key',
      ),
    ).rejects.toThrow('Logistics routes do not support collections');

    expect(prisma.accountReceivable.findUnique).not.toHaveBeenCalled();
    expect(prisma.accountReceivable.update).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rejects commercial order status updates on a logistics route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        route: createRoute({ type: DeliveryRouteType.CEDIS_SUPPLY }),
      }),
    );

    await expect(
      service.updateOrderStatus(
        'order-1',
        { status: DeliveryOrderStatus.IN_ROUTE },
        driver,
      ),
    ).rejects.toThrow('Logistics routes use logistics stop confirmation');

    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    expect(prisma.accountReceivable.update).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('allows a DRIVER to start an own route', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ status: DeliveryRouteStatus.PENDING }),
    );
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        status: DeliveryRouteStatus.IN_PROGRESS,
        startedAt: date('2026-06-19T09:00:00.000Z'),
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.IN_PROGRESS },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ status: DeliveryRouteStatus.IN_PROGRESS }),
    );

    expect(prisma.deliveryRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeliveryRouteStatus.IN_PROGRESS,
        }),
      }),
    );
  });

  it('allows a vehicle route to start when no other route uses that vehicle', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst
      .mockResolvedValueOnce(
        createRoute({
          vehicleId: 'vehicle-1',
          status: DeliveryRouteStatus.PENDING,
        }),
      )
      .mockResolvedValueOnce(null);
    prisma.deliveryRoute.update.mockResolvedValue(
      createRoute({
        vehicleId: 'vehicle-1',
        status: DeliveryRouteStatus.IN_PROGRESS,
        startedAt: date('2026-06-19T09:00:00.000Z'),
      }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.IN_PROGRESS },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        vehicleId: 'vehicle-1',
        status: DeliveryRouteStatus.IN_PROGRESS,
      }),
    );
  });

  it('rejects a second in-progress route for the same vehicle with conflict', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst
      .mockResolvedValueOnce(
        createRoute({
          vehicleId: 'vehicle-1',
          status: DeliveryRouteStatus.PENDING,
        }),
      )
      .mockResolvedValueOnce({ id: 'route-in-progress' });

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.IN_PROGRESS },
        driver,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('rejects DRIVER route transitions to CANCELLED or PENDING', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({ status: DeliveryRouteStatus.IN_PROGRESS }),
    );

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.CANCELLED },
        driver,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.updateRouteStatus(
        'route-1',
        { status: DeliveryRouteStatus.PENDING },
        driver,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.deliveryRoute.update).not.toHaveBeenCalled();
  });

  it('derives route detail expected collections from linked order receivable outstanding amounts', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({
            id: 'order-1',
            accountReceivable: { id: 'ar-1', outstandingAmount: money('500') },
          }),
          createOrder({
            id: 'order-2',
            accountReceivableId: 'ar-2',
            accountReceivable: {
              id: 'ar-2',
              outstandingAmount: money('125.50'),
            },
          }),
        ],
        payments: [
          { amount: money('200'), paymentMethod: 'CASH', collectionPass: 1 },
        ],
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

  it('returns the current balance and Payment-derived collection for each route order', async () => {
    const { service, prisma } = createService();
    const capturedAt = date('2026-06-19T12:05:00.000Z');
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({
            id: 'order-1',
            accountReceivable: { id: 'ar-1', outstandingAmount: money('300') },
            evidence: [
              {
                type: DeliveryEvidenceType.PHOTO,
                value: ONE_BY_ONE_PNG_DATA_URL,
                capturedAt,
                storageKey: null,
                mimeType: 'image/png',
                sha256:
                  '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
                sizeBytes: 68,
                receivedAt: date('2026-06-19T12:06:00.000Z'),
                capturedByUserId: driver.id,
                metadata: { source: 'data-url', width: 1, height: 1 },
              },
            ],
          }),
          createOrder({
            id: 'order-2',
            accountReceivableId: 'ar-2',
            accountReceivable: {
              id: 'ar-2',
              outstandingAmount: money('75.50'),
            },
          }),
        ],
        payments: [
          {
            accountReceivableId: 'ar-1',
            amount: money('200'),
            paymentMethod: PaymentMethod.CASH,
            collectionPass: 1,
            status: PaymentStatus.APPLIED,
          },
          {
            accountReceivableId: 'ar-2',
            amount: money('25.50'),
            paymentMethod: PaymentMethod.TRANSFER,
            collectionPass: 2,
            status: PaymentStatus.APPLIED,
          },
        ],
      }),
    );

    const result = await service.findRoute('route-1', driver);

    expect(result.orders).toEqual([
      expect.objectContaining({
        id: 'order-1',
        outstandingAmount: 300,
        derivedCollectedAmount: 200,
      }),
      expect.objectContaining({
        id: 'order-2',
        outstandingAmount: 75.5,
        derivedCollectedAmount: 25.5,
      }),
    ]);
    expect(result.evidenceSummary).toEqual([
      expect.objectContaining({
        deliveryOrderId: 'order-1',
        type: DeliveryEvidenceType.PHOTO,
        value: ONE_BY_ONE_PNG_DATA_URL,
        capturedAt: capturedAt.toISOString(),
        storageKey: null,
        mimeType: 'image/png',
        sha256:
          '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
        sizeBytes: 68,
        receivedAt: '2026-06-19T12:06:00.000Z',
        capturedByUserId: driver.id,
        metadata: { source: 'data-url', width: 1, height: 1 },
      }),
    ]);
    expect(result.collectionsSummary).toEqual(
      expect.objectContaining({
        derivedCollectedAmount: 225.5,
        firstPassAmount: 200,
        secondPassAmount: 25.5,
      }),
    );
  });

  it('uses the included receivable relation when the order foreign key is absent', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({
            accountReceivableId: null,
            accountReceivable: {
              id: 'ar-1',
              outstandingAmount: money('300'),
            },
          }),
        ],
        payments: [
          {
            accountReceivableId: 'ar-1',
            amount: money('200'),
            paymentMethod: PaymentMethod.CASH,
            collectionPass: 1,
            status: PaymentStatus.APPLIED,
          },
        ],
      }),
    );

    const result = await service.findRoute('route-1', driver);

    expect(result.orders).toEqual([
      expect.objectContaining({
        accountReceivableId: 'ar-1',
        outstandingAmount: 300,
        derivedCollectedAmount: 200,
      }),
    ]);
    expect(result.collectionsSummary).toEqual(
      expect.objectContaining({ expectedAmount: 300 }),
    );
  });

  it('exposes a signed read URL for object-backed delivery photos', async () => {
    const { service, prisma, objectStorage } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({
            evidence: [
              {
                id: 'evidence-1',
                type: DeliveryEvidenceType.PHOTO,
                value: null,
                storageKey: 'evidence/2026/08/15/order-1/evidence-1.jpg',
                mimeType: 'image/jpeg',
                sha256: 'a'.repeat(64),
                sizeBytes: 64,
                capturedAt: date('2026-08-15T12:00:00.000Z'),
              },
            ],
          }),
        ],
      }),
    );

    const result = await service.findRoute('route-1', driver);

    expect(result.evidenceSummary).toEqual([
      expect.objectContaining({
        id: 'evidence-1',
        value: null,
        storageKey: 'evidence/2026/08/15/order-1/evidence-1.jpg',
        contentUrl: expect.stringContaining('https://objects.test/evidence/'),
      }),
    ]);
    expect(objectStorage.getDownloadUrl).toHaveBeenCalledWith(
      'evidence/2026/08/15/order-1/evidence-1.jpg',
    );
  });

  it('lets a DRIVER deliver only an assigned order and stores deliveredAt and deliveredByUserId', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        evidence: [{ type: DeliveryEvidenceType.PHOTO }],
      }),
    );
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
        {
          status: DeliveryOrderStatus.DELIVERED,
          deliveredAt: '2026-06-19T12:00:00.000Z',
        },
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
      expect.objectContaining({
        where: { id: 'order-1', route: { driverId: 'driver-1' } },
      }),
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

  it('rejects DELIVERED when required delivery evidence is missing', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.updateOrderStatus(
        'order-1',
        {
          status: DeliveryOrderStatus.DELIVERED,
          deliveredAt: '2026-06-19T12:00:00.000Z',
        },
        driver,
      ),
    ).rejects.toThrow('DELIVERED requires PHOTO evidence');

    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it('requires notes for return, partial rejection, or non-delivery incident statuses', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.updateOrderStatus(
        'order-1',
        { status: DeliveryOrderStatus.RETURNED },
        driver,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({
        status: DeliveryOrderStatus.PARTIALLY_REJECTED,
        notes: 'Cliente rechazó una parte',
      }),
    );

    await expect(
      service.updateOrderStatus(
        'order-1',
        {
          status: DeliveryOrderStatus.PARTIALLY_REJECTED,
          notes: 'Cliente rechazó una parte',
        },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: DeliveryOrderStatus.PARTIALLY_REJECTED,
      }),
    );
  });

  it('throws not found when a DRIVER tries to update another driver order', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.updateOrderStatus(
        'order-2',
        { status: DeliveryOrderStatus.IN_ROUTE },
        driver,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('captures an allowed delivery evidence record', async () => {
    const { service, prisma, objectStorage } = createService();
    const capturedAt = new Date(Date.now() - 60_000);
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryEvidence.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'evidence-1',
          ...data,
        }),
    );

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: ONE_BY_ONE_PNG_DATA_URL,
          capturedAt: capturedAt.toISOString(),
        },
        driver,
      ),
    ).resolves.toEqual({
      id: 'evidence-1',
      deliveryOrderId: 'order-1',
      type: DeliveryEvidenceType.PHOTO,
      value: null,
      mimeType: 'image/png',
      sha256:
        '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
      sizeBytes: 68,
      storageKey: expect.stringMatching(
        /^evidence\/\d{4}\/\d{2}\/\d{2}\/order-1\/.+\.png$/,
      ),
      contentUrl: expect.stringContaining('https://objects.test/evidence/'),
      receivedAt: expect.any(String),
      capturedByUserId: driver.id,
      metadata: { source: 'data-url', width: 1, height: 1 },
      capturedAt: capturedAt.toISOString(),
    });

    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', route: { driverId: 'driver-1' } },
      }),
    );
    expect(prisma.deliveryEvidence.create).toHaveBeenCalledWith({
      data: {
        deliveryOrderId: 'order-1',
        type: DeliveryEvidenceType.PHOTO,
        value: null,
        mimeType: 'image/png',
        sha256:
          '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
        sizeBytes: 68,
        storageKey: expect.stringMatching(
          /^evidence\/\d{4}\/\d{2}\/\d{2}\/order-1\/.+\.png$/,
        ),
        receivedAt: expect.any(Date),
        capturedByUserId: driver.id,
        metadata: { source: 'data-url', width: 1, height: 1 },
        capturedAt,
      },
    });
    expect(objectStorage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^evidence\/\d{4}\/\d{2}\/\d{2}\/order-1\/.+\.png$/,
        ),
        body: Buffer.from(ONE_BY_ONE_PNG_DATA_URL.split(',')[1], 'base64'),
        contentType: 'image/png',
        checksumSha256: expect.any(String),
      }),
    );
    expect(objectStorage.getDownloadUrl).toHaveBeenCalled();
  });

  it('rejects PHOTO evidence that is not a real image data URL', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: 'esto-no-es-una-foto',
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow('PHOTO evidence must be a valid image data URL');

    expect(prisma.deliveryEvidence.create).not.toHaveBeenCalled();
  });

  it('fails closed when Object Storage is not configured for a PHOTO', async () => {
    const objectStorage = createObjectStorage();
    objectStorage.isConfigured.mockReturnValue(false);
    const { service, prisma } = createService(
      undefined,
      undefined,
      objectStorage,
    );
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: ONE_BY_ONE_PNG_DATA_URL,
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow('Delivery evidence storage is not configured');

    expect(prisma.deliveryEvidence.create).not.toHaveBeenCalled();
    expect(objectStorage.putObject).not.toHaveBeenCalled();
  });

  it('cleans up the object when the evidence row cannot be created', async () => {
    const { service, prisma, objectStorage } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryEvidence.create.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: ONE_BY_ONE_PNG_DATA_URL,
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow('database unavailable');

    expect(objectStorage.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(
        /^evidence\/\d{4}\/\d{2}\/\d{2}\/order-1\/.+\.png$/,
      ),
    );
  });

  it('captures non-photo evidence without photo integrity fields', async () => {
    const { service, prisma } = createService();
    const capturedAt = new Date(Date.now() - 60_000);
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryEvidence.create.mockResolvedValue({
      id: 'evidence-note-1',
      deliveryOrderId: 'order-1',
      type: DeliveryEvidenceType.NOTE,
      value: 'Cliente recibió el pedido',
      mimeType: null,
      sha256: null,
      sizeBytes: null,
      storageKey: null,
      receivedAt: new Date(),
      capturedByUserId: driver.id,
      metadata: null,
      capturedAt,
    });

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.NOTE,
          value: 'Cliente recibió el pedido',
          capturedAt: capturedAt.toISOString(),
        },
        driver,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        type: DeliveryEvidenceType.NOTE,
        mimeType: null,
        sha256: null,
        sizeBytes: null,
        capturedByUserId: driver.id,
      }),
    );

    expect(prisma.deliveryEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: DeliveryEvidenceType.NOTE,
        value: 'Cliente recibió el pedido',
        mimeType: null,
        sha256: null,
        sizeBytes: null,
        storageKey: null,
        capturedByUserId: driver.id,
        metadata: Prisma.JsonNull,
        capturedAt,
      }),
    });
  });

  it('rejects PHOTO evidence when the declared MIME differs from its bytes', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: ONE_BY_ONE_PNG_DATA_URL.replace('image/png', 'image/jpeg'),
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow(
      'PHOTO evidence MIME type does not match its binary content',
    );

    expect(prisma.deliveryEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects PHOTO evidence outside the server dimension limit', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.PHOTO,
          value: pngDataUrlWithDimensions(4097, 1),
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow(
      'PHOTO evidence dimensions must be between 1 and 4096 pixels',
    );

    expect(prisma.deliveryEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects evidence captured too far in the future', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());

    await expect(
      service.captureEvidence(
        'order-1',
        {
          type: DeliveryEvidenceType.NOTE,
          value: 'Cliente recibió el pedido',
          capturedAt: new Date(Date.now() + 6 * 60_000).toISOString(),
        },
        driver,
      ),
    ).rejects.toThrow('capturedAt cannot be more than 5 minutes in the future');

    expect(prisma.deliveryEvidence.create).not.toHaveBeenCalled();
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
      version: 1,
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
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ collectedByUserId: 'driver-1', collectionPass: 1 }),
    );
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
          expectedVersion: 1,
        },
        driver,
        'route-collection-key',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        payment: expect.objectContaining({
          id: 'payment-1',
          accountReceivableId: 'ar-1',
          routeId: 'route-1',
        }),
        deliveryOrder: expect.objectContaining({
          id: 'order-1',
          derivedCollectedAmount: 200,
        }),
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

  it('requires idempotent serializable route collection writes', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      outstandingAmount: money('500'),
      status: CollectionStatus.UNPAID,
      dueDate: date('2026-06-01T00:00:00.000Z'),
      version: 1,
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-serializable',
      accountReceivableId: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      routeId: 'route-1',
      routeSettlementId: null,
      amount: money('200'),
      paymentMethod: PaymentMethod.TRANSFER,
      status: PaymentStatus.APPLIED,
      paidAt: date('2026-06-19T12:10:00.000Z'),
    });
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('300'),
      status: CollectionStatus.PARTIALLY_PAID,
      version: 2,
    });
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ collectedByUserId: 'driver-1', collectionPass: 1 }),
    );
    prisma.sale.update.mockResolvedValue({ id: 'sale-1' });

    await service.registerCollection(
      'order-1',
      {
        accountReceivableId: 'ar-1',
        amount: 200,
        paymentMethod: PaymentMethod.TRANSFER,
        expectedVersion: 1,
        paidAt: '2026-06-19T12:10:00.000Z',
      },
      driver,
      'route-collection-key',
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'route-collection-key',
          idempotencyPayloadHash: expect.any(String),
        }),
      }),
    );
  });

  it('replays the persisted route payment for the same idempotency key', async () => {
    const { service, prisma } = createService();
    const dto = {
      accountReceivableId: 'ar-1',
      amount: 200,
      paymentMethod: PaymentMethod.CASH,
      expectedVersion: 1,
      paidAt: '2026-06-19T12:10:00.000Z',
    };
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      outstandingAmount: money('500'),
      status: CollectionStatus.UNPAID,
      dueDate: date('2026-06-01T00:00:00.000Z'),
      version: 1,
    });
    prisma.payment.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'payment-replayed',
        ...data,
      }),
    );
    prisma.accountReceivable.update.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('300'),
      status: CollectionStatus.PARTIALLY_PAID,
      version: 2,
    });
    prisma.deliveryOrder.update.mockResolvedValue(createOrder());
    prisma.sale.update.mockResolvedValue({ id: 'sale-1' });

    const first = await service.registerCollection(
      'order-1',
      dto,
      driver,
      'route-replay-key',
    );
    const persistedPayment = {
      id: 'payment-replayed',
      ...prisma.payment.create.mock.calls[0][0].data,
    };
    prisma.payment.findFirst.mockResolvedValue(persistedPayment);

    await expect(
      service.registerCollection('order-1', dto, driver, 'route-replay-key'),
    ).resolves.toEqual(first);
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale route collection version before creating a payment', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      customerId: 'customer-1',
      saleId: 'sale-1',
      outstandingAmount: money('500'),
      status: CollectionStatus.UNPAID,
      dueDate: date('2026-06-01T00:00:00.000Z'),
      version: 2,
    });

    await expect(
      service.registerCollection(
        'order-1',
        {
          accountReceivableId: 'ar-1',
          amount: 200,
          paymentMethod: PaymentMethod.CASH,
          expectedVersion: 1,
        },
        driver,
        'route-stale-version-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rejects route collections without a matching collectible receivable or over the outstanding balance', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({ accountReceivableId: 'ar-1' }),
    );

    await expect(
      service.registerCollection(
        'order-1',
        {
          accountReceivableId: 'ar-other',
          amount: 10,
          paymentMethod: PaymentMethod.CASH,
          expectedVersion: 1,
        },
        driver,
        'route-mismatch-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.accountReceivable.findUnique.mockResolvedValue({
      id: 'ar-1',
      outstandingAmount: money('50'),
      status: CollectionStatus.UNPAID,
      dueDate: date('2026-06-01T00:00:00.000Z'),
      version: 1,
    });

    await expect(
      service.registerCollection(
        'order-1',
        {
          accountReceivableId: 'ar-1',
          amount: 60,
          paymentMethod: PaymentMethod.CASH,
          expectedVersion: 1,
        },
        driver,
        'route-overbalance-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records returned items as traceable ROUTE_STOCK inventory movements for incidents that affect stock', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({
        status: DeliveryOrderStatus.RETURNED,
        notes: 'Cliente devolvió producto',
      }),
    );
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'route-stock-1',
        quantityKg: money('6'),
        quantityPieces: 4,
        reservedQuantityKg: money('1'),
        reservedQuantityPieces: 1,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'route-stock-1',
        quantityKg: money('8.5'),
        quantityPieces: 4,
        reservedQuantityKg: money('1'),
        reservedQuantityPieces: 1,
      });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
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
          returnedItems: [
            {
              productId: 'product-1',
              quantityKg: 2.5,
              quantityPieces: 0,
              reason: 'Cliente devolvió producto',
            },
          ],
        },
        driver,
        'incident-return-key',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        deliveryOrder: expect.objectContaining({
          status: DeliveryOrderStatus.RETURNED,
        }),
        inventoryMovements: [
          expect.objectContaining({
            id: 'movement-1',
            locationId: 'route-stock-1',
          }),
        ],
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
          previousQuantityKg: 6,
          newQuantityKg: 8.5,
          previousQuantityPieces: 4,
          newQuantityPieces: 4,
        }),
      }),
    );
    expect(prisma.deliveryIncident.create).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(1);
  });

  it('replays a returned-item incident without increasing route stock twice', async () => {
    const fleetGateway = { emitIncidentCreated: jest.fn() };
    const { service, prisma } = createService(undefined, fleetGateway);
    const persistedIncident = {
      id: 'incident-1',
      type: 'DELIVERY_FAILURE',
      status: 'OPEN',
      reason: 'Cliente devolvió producto',
      routeId: 'route-1',
      deliveryOrderId: 'order-1',
      vehicleId: null,
      driverId: 'driver-1',
      positionId: null,
      statusSnapshot: DeliveryOrderStatus.RETURNED,
      latitude: null,
      longitude: null,
      returnedItems: [
        {
          productId: 'product-1',
          quantityKg: 2.5,
          quantityPieces: 0,
          reason: 'Cliente devolvió producto',
        },
      ],
      evidence: [],
      occurredAt: date('2026-06-19T12:15:00.000Z'),
      reportedAt: date('2026-06-19T12:15:00.000Z'),
      reportedByUserId: 'driver-1',
      createdAt: date('2026-06-19T12:15:00.000Z'),
      updatedAt: date('2026-06-19T12:15:00.000Z'),
    };
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ status: DeliveryOrderStatus.RETURNED }),
    );
    let storedIncident: Record<string, unknown> | null = null;
    prisma.deliveryIncident.findUnique.mockImplementation(() =>
      Promise.resolve(storedIncident),
    );
    prisma.deliveryIncident.create.mockImplementation(({ data }) => {
      storedIncident = { ...persistedIncident, ...data };
      return Promise.resolve(storedIncident);
    });
    prisma.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'route-stock-1',
      quantityKg: money('6'),
      quantityPieces: 4,
      reservedQuantityKg: money('0'),
      reservedQuantityPieces: 0,
    });
    prisma.inventoryMovement.create.mockResolvedValue({
      id: 'movement-1',
      productId: 'product-1',
      locationId: 'route-stock-1',
      type: InventoryMovementType.RETURN,
      quantityKg: money('2.5'),
      quantityPieces: 0,
      reason: 'Cliente devolvió producto',
    });
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        productId: 'product-1',
        locationId: 'route-stock-1',
        type: InventoryMovementType.RETURN,
        quantityKg: money('2.5'),
        quantityPieces: 0,
        reason: 'Cliente devolvió producto',
      },
    ]);
    const command = {
      status: DeliveryOrderStatus.RETURNED,
      reason: 'Cliente devolvió producto',
      returnedItems: [
        {
          productId: 'product-1',
          quantityKg: 2.5,
          quantityPieces: 0,
          reason: 'Cliente devolvió producto',
        },
      ],
    };

    const first = await service.registerIncident(
      'order-1',
      command,
      driver,
      'incident-retry-key',
    );
    const replay = await service.registerIncident(
      'order-1',
      command,
      driver,
      'incident-retry-key',
    );
    await expect(
      service.registerIncident(
        'order-1',
        {
          ...command,
          reason: 'Cliente rechazó el pedido completo',
        },
        driver,
        'incident-retry-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(first.incident.id).toBe('incident-1');
    expect(replay.incident.id).toBe('incident-1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(prisma.deliveryIncident.create).toHaveBeenCalledTimes(1);
    expect(fleetGateway.emitIncidentCreated).toHaveBeenCalledTimes(1);
  });

  it('persists the incident context and publishes only after the transaction commits', async () => {
    const fleetGateway = { emitIncidentCreated: jest.fn() };
    const { service, prisma } = createService(undefined, fleetGateway);
    const committed = { value: false };
    fleetGateway.emitIncidentCreated.mockImplementation(() => {
      expect(committed.value).toBe(true);
    });
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        latitude: money('19.1738'),
        longitude: money('-96.1342'),
        route: createRoute({
          vehicleId: 'vehicle-1',
          originLocationId: 'origin-1',
        }),
      }),
    );
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({
        status: DeliveryOrderStatus.NOT_DELIVERED,
        notes: 'Cliente no localizado',
        latitude: money('19.1738'),
        longitude: money('-96.1342'),
        route: createRoute({
          vehicleId: 'vehicle-1',
          originLocationId: 'origin-1',
        }),
      }),
    );
    prisma.vehiclePosition.findFirst.mockResolvedValue({
      id: 'position-1',
      latitude: money('19.1737'),
      longitude: money('-96.1341'),
      recordedAt: date('2026-06-19T12:14:30.000Z'),
    });
    prisma.deliveryIncident.create.mockResolvedValue({
      id: 'incident-1',
      type: 'DELIVERY_FAILURE',
      status: 'OPEN',
      reason: 'Cliente no localizado',
      routeId: 'route-1',
      deliveryOrderId: 'order-1',
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      positionId: 'position-1',
      statusSnapshot: DeliveryOrderStatus.NOT_DELIVERED,
      latitude: money('19.1737'),
      longitude: money('-96.1341'),
      returnedItems: [],
      evidence: [],
      occurredAt: date('2026-06-19T12:15:00.000Z'),
      reportedAt: date('2026-06-19T12:15:00.000Z'),
      reportedByUserId: 'driver-1',
      createdAt: date('2026-06-19T12:15:00.000Z'),
      updatedAt: date('2026-06-19T12:15:00.000Z'),
    });
    prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(prisma);
      committed.value = true;
      return result;
    });

    const result = await service.registerIncident(
      'order-1',
      {
        status: DeliveryOrderStatus.NOT_DELIVERED,
        reason: 'Cliente no localizado',
      },
      driver,
      'incident-position-key',
    );

    expect(prisma.deliveryIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: 'route-1',
          deliveryOrderId: 'order-1',
          vehicleId: 'vehicle-1',
          driverId: 'driver-1',
          positionId: 'position-1',
          statusSnapshot: DeliveryOrderStatus.NOT_DELIVERED,
          latitude: expect.anything(),
          longitude: expect.anything(),
        }),
      }),
    );
    expect(result.incident).toEqual(
      expect.objectContaining({
        id: 'incident-1',
        position: { latitude: 19.1737, longitude: -96.1341 },
        stop: { latitude: 19.1738, longitude: -96.1342 },
      }),
    );
    expect(fleetGateway.emitIncidentCreated).toHaveBeenCalledTimes(1);
    expect(fleetGateway.emitIncidentCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: 'incident-1',
        deliveryOrderId: 'order-1',
        routeId: 'route-1',
        vehicleId: 'vehicle-1',
        driverId: 'driver-1',
        position: { latitude: 19.1737, longitude: -96.1341 },
        stop: { latitude: 19.1738, longitude: -96.1342 },
      }),
      'origin-1',
    );
  });

  it('keeps a committed incident valid and logs non-sensitive context when realtime publication fails', async () => {
    const fleetGateway = {
      emitIncidentCreated: jest.fn(() => {
        throw new Error('socket unavailable');
      }),
    };
    const { service, prisma } = createService(undefined, fleetGateway);
    const loggerError = jest
      .spyOn(
        (
          service as unknown as {
            logger: { error: (...args: unknown[]) => void };
          }
        ).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        route: createRoute({
          vehicleId: 'vehicle-1',
          originLocationId: 'origin-1',
        }),
      }),
    );
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({
        status: DeliveryOrderStatus.NOT_DELIVERED,
        route: createRoute({
          vehicleId: 'vehicle-1',
          originLocationId: 'origin-1',
        }),
      }),
    );
    prisma.deliveryIncident.create.mockResolvedValue({
      id: 'incident-1',
      type: 'DELIVERY_FAILURE',
      status: 'OPEN',
      reason: 'Cliente no localizado',
      routeId: 'route-1',
      deliveryOrderId: 'order-1',
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      positionId: null,
      statusSnapshot: DeliveryOrderStatus.NOT_DELIVERED,
      latitude: null,
      longitude: null,
      returnedItems: [],
      evidence: [],
      occurredAt: date('2026-06-19T12:15:00.000Z'),
      reportedAt: date('2026-06-19T12:15:00.000Z'),
      reportedByUserId: 'driver-1',
      createdAt: date('2026-06-19T12:15:00.000Z'),
      updatedAt: date('2026-06-19T12:15:00.000Z'),
    });

    await expect(
      service.registerIncident(
        'order-1',
        {
          status: DeliveryOrderStatus.NOT_DELIVERED,
          reason: 'Cliente no localizado',
        },
        driver,
        'incident-realtime-failure-key',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        incident: expect.objectContaining({ id: 'incident-1' }),
      }),
    );

    expect(prisma.deliveryIncident.create).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Realtime incident publication failed',
      {
        incidentId: 'incident-1',
        routeId: 'route-1',
        deliveryOrderId: 'order-1',
      },
    );
    expect(JSON.stringify(loggerError.mock.calls)).not.toMatch(
      /jwt|cookie|authorization|evidence/i,
    );
  });

  it('stores an incident without GPS when the route has no recent persisted position', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(
      createOrder({
        latitude: money('19.1738'),
        longitude: money('-96.1342'),
      }),
    );
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ status: DeliveryOrderStatus.NOT_DELIVERED }),
    );

    const result = await service.registerIncident(
      'order-1',
      {
        status: DeliveryOrderStatus.NOT_DELIVERED,
        reason: 'Cliente no localizado',
      },
      driver,
      'incident-no-position-key',
    );

    expect(result.incident).toEqual(
      expect.objectContaining({
        position: null,
        stop: { latitude: 19.1738, longitude: -96.1342 },
      }),
    );
    expect(prisma.deliveryIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          positionId: null,
          latitude: null,
          longitude: null,
        }),
      }),
    );
  });

  it('does not publish an incident when the transaction cannot persist it', async () => {
    const fleetGateway = { emitIncidentCreated: jest.fn() };
    const { service, prisma } = createService(undefined, fleetGateway);
    prisma.deliveryOrder.findFirst.mockResolvedValue(createOrder());
    prisma.deliveryOrder.update.mockResolvedValue(
      createOrder({ status: DeliveryOrderStatus.NOT_DELIVERED }),
    );
    prisma.deliveryIncident.create.mockRejectedValue(
      new Error('incident write failed'),
    );

    await expect(
      service.registerIncident(
        'order-1',
        {
          status: DeliveryOrderStatus.NOT_DELIVERED,
          reason: 'Cliente no localizado',
        },
        driver,
        'incident-failure-key',
      ),
    ).rejects.toThrow('incident write failed');
    expect(fleetGateway.emitIncidentCreated).not.toHaveBeenCalled();
  });

  it('keeps DRIVER incident registration scoped to the assigned order', async () => {
    const { service, prisma } = createService();
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.registerIncident(
        'order-foreign',
        {
          status: DeliveryOrderStatus.NOT_DELIVERED,
          reason: 'Cliente no localizado',
        },
        driver,
        'incident-foreign-key',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-foreign', route: { driverId: 'driver-1' } },
      }),
    );
    expect(prisma.deliveryIncident.create).not.toHaveBeenCalled();
  });

  it('opens a route settlement that derives collected totals from Payment and marks differences for review', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({
            status: DeliveryOrderStatus.DELIVERED,
            accountReceivable: { id: 'ar-1', outstandingAmount: money('500') },
          }),
          createOrder({
            id: 'order-2',
            status: DeliveryOrderStatus.RETURNED,
            accountReceivable: { id: 'ar-2', outstandingAmount: money('100') },
          }),
        ],
        payments: [
          {
            amount: money('200'),
            paymentMethod: PaymentMethod.CASH,
            collectionPass: 1,
            status: PaymentStatus.APPLIED,
          },
          {
            amount: money('50'),
            paymentMethod: PaymentMethod.TRANSFER,
            collectionPass: 2,
            status: PaymentStatus.APPLIED,
          },
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

    await expect(
      service.openSettlement('route-1', admin, 'settlement-open-key'),
    ).resolves.toEqual(
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
    expect(prisma.routeSettlementOpeningCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'settlement-open-key',
        routeId: 'route-1',
        settlementId: 'settlement-1',
        createdByUserId: 'admin-1',
        payloadHash: expect.any(String),
        responseSnapshot: expect.objectContaining({ id: 'settlement-1' }),
      }),
    });
  });

  it('replays the same opening command without duplicating the settlement or command', async () => {
    const { service, prisma } = createService();
    let command: Record<string, unknown> | null = null;
    prisma.routeSettlementOpeningCommand.findUnique.mockImplementation(() =>
      Promise.resolve(command),
    );
    prisma.routeSettlementOpeningCommand.create.mockImplementation(
      ({ data }) => {
        command = data;
        return Promise.resolve(data);
      },
    );
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        settlement: { id: 'settlement-1' },
        deliveryOrders: [
          createOrder({ status: DeliveryOrderStatus.DELIVERED }),
        ],
        payments: [
          {
            amount: money('500'),
            paymentMethod: PaymentMethod.CASH,
            collectionPass: 1,
            status: PaymentStatus.APPLIED,
          },
        ],
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

    const first = await service.openSettlement(
      'route-1',
      admin,
      'settlement-retry-key',
    );
    const replay = await service.openSettlement(
      'route-1',
      admin,
      'settlement-retry-key',
    );

    expect(replay).toEqual(first);
    expect(prisma.routeSettlement.create).not.toHaveBeenCalled();
    expect(prisma.routeSettlementOpeningCommand.create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects reuse of an opening Idempotency-Key for an incompatible command', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(createRoute());
    prisma.routeSettlementOpeningCommand.findUnique.mockResolvedValue({
      idempotencyKey: 'settlement-conflict-key',
      payloadHash: 'incompatible-payload-hash',
      responseSnapshot: { id: 'settlement-foreign' },
    });

    await expect(
      service.openSettlement('route-1', admin, 'settlement-conflict-key'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.routeSettlement.create).not.toHaveBeenCalled();
  });

  it('does not replay an opening snapshot when the route is outside the current access scope', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);
    prisma.routeSettlementOpeningCommand.findUnique.mockResolvedValue({
      idempotencyKey: 'settlement-scoped-key',
      payloadHash: 'stored-hash',
      responseSnapshot: { id: 'settlement-foreign' },
    });

    await expect(
      service.openSettlement('route-foreign', admin, 'settlement-scoped-key'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      prisma.routeSettlementOpeningCommand.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('persists one opening effect for concurrent requests with the same Idempotency-Key', async () => {
    const { service, prisma } = createService();
    let settlement: Record<string, unknown> | null = null;
    let command: Record<string, unknown> | null = null;
    let persistentSettlementEffects = 0;
    prisma.routeSettlementOpeningCommand.findUnique.mockImplementation(() =>
      Promise.resolve(command),
    );
    prisma.routeSettlementOpeningCommand.create.mockImplementation(
      ({ data }) => {
        command = data;
        return Promise.resolve(data);
      },
    );
    prisma.deliveryRoute.findFirst.mockResolvedValue(
      createRoute({
        deliveryOrders: [
          createOrder({ status: DeliveryOrderStatus.DELIVERED }),
        ],
      }),
    );
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.routeSettlement.create.mockImplementation(() => {
      if (settlement) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      settlement = {
        id: 'settlement-1',
        routeId: 'route-1',
        driverId: 'driver-1',
        status: RouteSettlementStatus.OPEN,
        version: 1,
        expectedCashAmount: money('500'),
        expectedTransferAmount: money('0'),
        differenceAmount: money('500'),
        paidAtDeliveryAmount: money('0'),
        overdueAmount: money('500'),
        secondPassCollectionsAmount: money('0'),
      };
      persistentSettlementEffects += 1;
      return Promise.resolve(settlement);
    });

    const [first, retry] = await Promise.all([
      service.openSettlement('route-1', admin, 'settlement-concurrent-key'),
      service.openSettlement('route-1', admin, 'settlement-concurrent-key'),
    ]);

    expect(retry).toEqual(first);
    expect(persistentSettlementEffects).toBe(1);
    expect(prisma.routeSettlementOpeningCommand.create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('closes a route settlement with expectedVersion after all route orders are final', async () => {
    const { service, prisma } = createService();
    prisma.routeSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      routeId: 'route-1',
      driverId: 'driver-1',
      status: RouteSettlementStatus.OPEN,
      version: 3,
      route: {
        deliveryOrders: [
          createOrder({ status: DeliveryOrderStatus.DELIVERED }),
        ],
      },
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
      service.closeSettlement(
        'settlement-1',
        { expectedVersion: 3, notes: 'Liquidación revisada' },
        admin,
        'close-idem-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'settlement-1',
        status: RouteSettlementStatus.CLOSED,
        version: 4,
      }),
    );

    expect(prisma.routeSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'settlement-1', version: 3 },
        data: expect.objectContaining({
          status: RouteSettlementStatus.CLOSED,
          notes: 'Liquidación revisada',
          routeCollectionsSummary: expect.objectContaining({
            idempotency: expect.objectContaining({
              close: expect.objectContaining({ key: 'close-idem-1' }),
            }),
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
          payloadHash:
            '46a2e3ff85e0665fb79c45b09600f7419bf14475d39447fdad7597ba0eecdd55',
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
      service.closeSettlement(
        'settlement-1',
        { expectedVersion: 3, notes: 'Liquidación revisada' },
        admin,
        'close-idem-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'settlement-1',
        status: RouteSettlementStatus.CLOSED,
      }),
    );

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
      service.reopenSettlement(
        'settlement-1',
        { expectedVersion: 4, reason: 'Revisar diferencia' },
        admin,
        'reopen-idem-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'settlement-1',
        status: RouteSettlementStatus.OPEN,
        version: 5,
      }),
    );

    expect(prisma.routeSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'settlement-1', version: 4 },
        data: expect.objectContaining({
          status: RouteSettlementStatus.OPEN,
          reopenedByUserId: 'admin-1',
          reopenedReason: 'Revisar diferencia',
          routeCollectionsSummary: expect.objectContaining({
            idempotency: expect.objectContaining({
              reopen: expect.objectContaining({ key: 'reopen-idem-1' }),
            }),
          }),
          version: { increment: 1 },
        }),
      }),
    );
  });
});
