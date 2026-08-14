import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryRoutePlanningService } from './delivery-route-planning.service';
import { RoutingProvidersService } from './routing-providers.service';

describe('DeliveryRoutePlanningService', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' };
  const seller = { id: 'seller-1', role: 'SELLER' };
  const prisma = {
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    vehicle: { findFirst: jest.fn(), findMany: jest.fn() },
    operationalLocation: { findFirst: jest.fn() },
    sale: { findMany: jest.fn(), count: jest.fn() },
    deliveryRoutePlanDraft: { create: jest.fn() },
    deliveryRoute: { findFirst: jest.fn() },
  };
  const providers = {
    optimizeStops: jest.fn(),
    buildRoute: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns dedicated active DRIVER and vehicle catalogs', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'driver-1' }]);
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1' }]);
    const service = new DeliveryRoutePlanningService(
      prisma as unknown as PrismaService,
      providers as unknown as RoutingProvidersService,
    );

    await expect(service.findActiveDrivers()).resolves.toEqual([
      { id: 'driver-1' },
    ]);
    await expect(service.findActiveVehicles()).resolves.toEqual([
      { id: 'vehicle-1' },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, role: { name: 'DRIVER' } },
      }),
    );
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('validates, optimizes and persists a 30-minute consumable plan', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      role: { name: 'DRIVER' },
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      isActive: true,
    });
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);
    prisma.operationalLocation.findFirst.mockResolvedValue({
      id: 'origin-1',
      latitude: '19.1802',
      longitude: '-96.1421',
      isActive: true,
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: 'CONFIRMED',
        cancelledAt: null,
        routeId: null,
        accountReceivable: { id: 'ar-1' },
      },
    ]);
    providers.optimizeStops.mockResolvedValue([
      { saleId: 'sale-1', sequence: 1 },
    ]);
    providers.buildRoute.mockResolvedValue({
      geometry: {
        type: 'LineString',
        coordinates: [
          [-96.1421, 19.1802],
          [-96.1342, 19.1738],
          [-96.1421, 19.1802],
        ],
      },
      distanceMeters: 8600,
      durationSeconds: 1440,
      legs: [
        { distanceMeters: 4300, durationSeconds: 720 },
        { distanceMeters: 4300, durationSeconds: 720 },
      ],
    });
    prisma.deliveryRoutePlanDraft.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'plan-1', ...data }),
    );

    const service = new DeliveryRoutePlanningService(
      prisma as unknown as PrismaService,
      providers as unknown as RoutingProvidersService,
    );
    const result = await service.createPlan(
      {
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        scheduledDate: '2026-06-19',
        originLocationId: 'origin-1',
        stops: [
          {
            saleId: 'sale-1',
            accountReceivableId: 'ar-1',
            deliveryAddress: 'Av Centro 123',
            latitude: 19.1738,
            longitude: -96.1342,
          },
        ],
      },
      seller,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'plan-1',
        vehicleId: 'vehicle-1',
        distanceMeters: 8600,
        durationSeconds: 1440,
        routingProfile: 'driving',
      }),
    );
    expect(result.orderedStops[0]).toEqual(
      expect.objectContaining({
        saleId: 'sale-1',
        sequence: 1,
        legDistanceMeters: 4300,
        legDurationSeconds: 720,
      }),
    );
    expect(prisma.deliveryRoutePlanDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdByUserId: 'seller-1',
        vehicleId: 'vehicle-1',
        consumedAt: null,
      }),
    });
  });

  it('rejects an ineligible sale without creating a draft', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      role: { name: 'DRIVER' },
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      isActive: true,
    });
    prisma.deliveryRoute.findFirst.mockResolvedValue(null);
    prisma.operationalLocation.findFirst.mockResolvedValue({
      id: 'origin-1',
      latitude: '19.1802',
      longitude: '-96.1421',
      isActive: true,
    });
    prisma.sale.findMany.mockResolvedValue([]);
    const service = new DeliveryRoutePlanningService(
      prisma as unknown as PrismaService,
      providers as unknown as RoutingProvidersService,
    );

    await expect(
      service.createPlan(
        {
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          scheduledDate: '2026-06-19',
          originLocationId: 'origin-1',
          stops: [
            {
              saleId: 'sale-1',
              deliveryAddress: 'Av Centro 123',
              latitude: 19.1738,
              longitude: -96.1342,
            },
          ],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.deliveryRoutePlanDraft.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive vehicle before calling routing providers', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      role: { name: 'DRIVER' },
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const service = new DeliveryRoutePlanningService(
      prisma as unknown as PrismaService,
      providers as unknown as RoutingProvidersService,
    );

    await expect(
      service.createPlan(
        {
          driverId: 'driver-1',
          vehicleId: 'vehicle-inactive',
          scheduledDate: '2026-06-19',
          originLocationId: 'origin-1',
          stops: [
            {
              saleId: 'sale-1',
              deliveryAddress: 'Av Centro 123',
              latitude: 19.1738,
              longitude: -96.1342,
            },
          ],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(providers.optimizeStops).not.toHaveBeenCalled();
  });

  it('rejects planning while the selected vehicle is already in progress', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      role: { name: 'DRIVER' },
    });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.deliveryRoute.findFirst.mockResolvedValue({ id: 'route-1' });
    prisma.operationalLocation.findFirst.mockResolvedValue({
      id: 'origin-1',
      latitude: '19.1802',
      longitude: '-96.1421',
      isActive: true,
    });
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        status: 'CONFIRMED',
        cancelledAt: null,
        routeId: null,
        accountReceivable: { id: 'ar-1' },
      },
    ]);

    const service = new DeliveryRoutePlanningService(
      prisma as unknown as PrismaService,
      providers as unknown as RoutingProvidersService,
    );

    await expect(
      service.createPlan(
        {
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          scheduledDate: '2026-06-19',
          originLocationId: 'origin-1',
          stops: [
            {
              saleId: 'sale-1',
              deliveryAddress: 'Av Centro 123',
              latitude: 19.1738,
              longitude: -96.1342,
            },
          ],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.deliveryRoutePlanDraft.create).not.toHaveBeenCalled();
  });
});
