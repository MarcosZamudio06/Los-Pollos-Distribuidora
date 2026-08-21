import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  DeliveryRouteType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryRouteNavigationService } from './delivery-route-navigation.service';
import { RoutingProvidersService } from './routing-providers.service';

const driver: AuthenticatedUser = {
  id: 'driver-1',
  email: 'driver@example.com',
  name: 'Driver One',
  role: 'DRIVER',
  mustChangePassword: false,
};

const navigationResult = {
  geometry: {
    type: 'LineString',
    coordinates: [
      [-96.14, 19.18],
      [-96.13, 19.17],
    ],
  },
  distanceMeters: 1200,
  durationSeconds: 240,
  legs: [{ distanceMeters: 1200, durationSeconds: 240 }],
  steps: [
    {
      distanceMeters: 1200,
      durationSeconds: 240,
      streetName: 'Av. Centro',
      maneuver: {
        type: 'CONTINUE' as const,
        modifier: 'STRAIGHT' as const,
        location: { latitude: 19.18, longitude: -96.14 },
        bearingBefore: 90,
        bearingAfter: 90,
        exit: null,
      },
    },
  ],
};

function saleRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    type: DeliveryRouteType.SALE_DELIVERY,
    status: DeliveryRouteStatus.IN_PROGRESS,
    logisticsStopCompletedAt: null,
    deliveryOrders: [
      {
        id: 'order-2',
        deliveryAddress: 'Av. Centro 123',
        latitude: 19.17,
        longitude: -96.13,
        stopSequence: 2,
        sale: {
          saleNumber: 'SALE-002',
          customer: { name: 'Cliente Centro' },
        },
      },
    ],
    inventoryTransfer: null,
    ...overrides,
  };
}

describe('DeliveryRouteNavigationService', () => {
  const routeFindFirst = jest.fn();
  const routeUpdate = jest.fn();
  const buildNavigationRoute = jest.fn();
  const prisma = {
    deliveryRoute: {
      findFirst: routeFindFirst,
      update: routeUpdate,
    },
  } as unknown as PrismaService;
  const providers = {
    buildNavigationRoute,
  } as unknown as RoutingProvidersService;
  const service = new DeliveryRouteNavigationService(prisma, providers);

  beforeEach(() => {
    jest.clearAllMocks();
    routeFindFirst.mockResolvedValue(saleRoute());
    buildNavigationRoute.mockResolvedValue(navigationResult);
  });

  it('returns navigation for the DRIVER assigned to the route', async () => {
    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        driver,
      ),
    ).resolves.toEqual({
      routeId: 'route-1',
      target: {
        kind: 'DELIVERY_ORDER',
        id: 'order-2',
        stopSequence: 2,
        label: 'Cliente Centro',
        address: 'Av. Centro 123',
        latitude: 19.17,
        longitude: -96.13,
      },
      geometry: navigationResult.geometry,
      distanceMeters: 1200,
      durationSeconds: 240,
      steps: navigationResult.steps,
    });
    expect(routeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'route-1', driverId: 'driver-1' },
      }),
    );
    expect(buildNavigationRoute).toHaveBeenCalledWith(
      [-96.14, 19.18],
      [-96.13, 19.17],
    );
  });

  it('does not expose a route assigned to another DRIVER', async () => {
    routeFindFirst.mockResolvedValue(null);

    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        driver,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(buildNavigationRoute).not.toHaveBeenCalled();
  });

  it('rejects ADMIN even when the service is called outside controller guards', async () => {
    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        { ...driver, role: 'ADMIN' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(routeFindFirst).not.toHaveBeenCalled();
  });

  it.each([DeliveryRouteStatus.PENDING, DeliveryRouteStatus.COMPLETED])(
    'rejects a %s route with a domain conflict',
    async (status) => {
      routeFindFirst.mockResolvedValue(saleRoute({ status }));

      await expect(
        service.navigate(
          'route-1',
          { latitude: 19.18, longitude: -96.14 },
          driver,
        ),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'ROUTE_NOT_IN_PROGRESS' }),
      });
      expect(buildNavigationRoute).not.toHaveBeenCalled();
    },
  );

  it('selects the lowest stopSequence pending order and excludes final statuses', async () => {
    await service.navigate(
      'route-1',
      { latitude: 19.18, longitude: -96.14 },
      driver,
    );

    expect(routeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          deliveryOrders: expect.objectContaining({
            where: {
              status: {
                notIn: [
                  DeliveryOrderStatus.DELIVERED,
                  DeliveryOrderStatus.NOT_DELIVERED,
                  DeliveryOrderStatus.CANCELLED,
                  DeliveryOrderStatus.PARTIALLY_REJECTED,
                  DeliveryOrderStatus.RETURNED,
                ],
              },
            },
            orderBy: [{ stopSequence: 'asc' }, { createdAt: 'asc' }],
            take: 1,
          }),
        }),
      }),
    );
  });

  it('does not allow request fields to manipulate the destination', async () => {
    await service.navigate(
      'route-1',
      {
        latitude: 19.18,
        longitude: -96.14,
        destination: { latitude: 0, longitude: 0 },
        orderId: 'attacker-order',
      } as never,
      driver,
    );

    expect(buildNavigationRoute).toHaveBeenCalledWith(
      [-96.14, 19.18],
      [-96.13, 19.17],
    );
  });

  it('uses the pending logistics transfer physical destination', async () => {
    routeFindFirst.mockResolvedValue(
      saleRoute({
        type: DeliveryRouteType.CEDIS_SUPPLY,
        deliveryOrders: [],
        inventoryTransfer: {
          id: 'transfer-1',
          transferNumber: 'TR-001',
          destinationLocation: {
            id: 'branch-1',
            name: 'Sucursal Centro',
            address: 'Calle Sucursal 45',
            latitude: 19.16,
            longitude: -96.12,
          },
        },
      }),
    );

    const result = await service.navigate(
      'route-1',
      { latitude: 19.18, longitude: -96.14 },
      driver,
    );

    expect(result.target).toEqual({
      kind: 'LOGISTICS_STOP',
      id: 'transfer-1',
      label: 'Sucursal Centro',
      address: 'Calle Sucursal 45',
      latitude: 19.16,
      longitude: -96.12,
    });
    expect(buildNavigationRoute).toHaveBeenCalledWith(
      [-96.14, 19.18],
      [-96.12, 19.16],
    );
  });

  it('returns a clear conflict when no pending target exists', async () => {
    routeFindFirst.mockResolvedValue(saleRoute({ deliveryOrders: [] }));

    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        driver,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'NO_PENDING_NAVIGATION_TARGET',
      }),
    });
  });

  it('returns a clear conflict when the target has no coordinates', async () => {
    routeFindFirst.mockResolvedValue(
      saleRoute({
        deliveryOrders: [
          {
            ...saleRoute().deliveryOrders[0],
            latitude: null,
            longitude: null,
          },
        ],
      }),
    );

    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        driver,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'NAVIGATION_TARGET_COORDINATES_MISSING',
      }),
    });
  });

  it('does not persist route changes when OSRM is unavailable', async () => {
    buildNavigationRoute.mockRejectedValue(
      new ServiceUnavailableException('OSRM routing provider is unavailable'),
    );

    await expect(
      service.navigate(
        'route-1',
        { latitude: 19.18, longitude: -96.14 },
        driver,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(routeUpdate).not.toHaveBeenCalled();
  });
});
