import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryRouteStatus } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { FleetService } from './fleet.service';
import { FleetHeatmapMetric } from './dto';

const activeRoute = (overrides: Record<string, unknown> = {}) => ({
  id: 'route-1',
  driverId: 'driver-1',
  vehicleId: 'vehicle-1',
  status: DeliveryRouteStatus.IN_PROGRESS,
  vehicle: {
    id: 'vehicle-1',
    code: 'UNIDAD-01',
    displayName: 'Unidad 1',
    plateNumber: 'ABC-123',
    isActive: true,
  },
  ...overrides,
});

const positionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'position-1',
  clientEventId: 'event-1',
  vehicleId: 'vehicle-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  latitude: 19.1738,
  longitude: -96.1342,
  accuracyMeters: 12.5,
  speedKph: 32.2,
  headingDegrees: 185,
  recordedAt: new Date('2026-08-12T16:00:00.000Z'),
  receivedAt: new Date('2026-08-12T16:00:01.000Z'),
  ...overrides,
});

const driver = (overrides: Record<string, unknown> = {}) => ({
  id: 'driver-1',
  role: 'DRIVER',
  permissions: [PERMISSIONS.FLEET_POSITION_PUBLISH],
  ...overrides,
});

function createPrisma() {
  const routeLookup = jest.fn();
  const prisma = {
    deliveryRoute: {
      findUnique: routeLookup,
      findMany: routeLookup,
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  };
  return prisma;
}

function createConfig(values: Record<string, number> = {}) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function serviceWith(
  prisma: ReturnType<typeof createPrisma>,
  values: Record<string, number> = {},
  fleetGateway?: {
    emitPositionUpdated: jest.Mock;
    emitGeofenceEntered?: jest.Mock;
    emitGeofenceExited?: jest.Mock;
  },
  geofenceService?: { evaluatePosition: jest.Mock },
) {
  return new FleetService(
    prisma as unknown as PrismaService,
    createConfig(values),
    fleetGateway as never,
    geofenceService as never,
  );
}

describe('FleetService', () => {
  describe('getLive', () => {
    it('loads active vehicles, routes, latest positions, and stops with one set-based query', async () => {
      const prisma = createPrisma();
      prisma.$queryRaw.mockResolvedValue([
        {
          vehicleId: 'vehicle-1',
          vehicleCode: 'UNIDAD-01',
          vehicleDisplayName: 'Unidad 1',
          vehiclePlateNumber: null,
          driverId: 'driver-1',
          driverName: 'Driver One',
          routeId: 'route-1',
          routeName: 'Ruta Centro',
          routeStatus: DeliveryRouteStatus.IN_PROGRESS,
          scheduledDate: new Date('2026-08-12T00:00:00.000Z'),
          originLocationId: 'origin-1',
          routeGeometry: null,
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          speedKph: null,
          headingDegrees: null,
          positionRecordedAt: null,
          nextStop: null,
          deliveryStops: [],
          totalOrdersCount: 20,
          deliveredOrdersCount: 5,
          incidentCountActive: 0,
          incidents: [],
        },
      ]);

      const result = await serviceWith(prisma).getLive(
        { originLocationId: 'origin-1' },
        { id: 'admin-1', role: 'ADMIN', permissions: [] },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].route.totalOrders).toBe(20);
      expect(result.items[0].position).toBeNull();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.deliveryRoute.findMany).not.toHaveBeenCalled();
      const query = prisma.$queryRaw.mock.calls[0][0] as {
        strings?: string[];
      };
      expect(query.strings?.join(' ')).toContain('LEFT JOIN LATERAL');
      expect(query.strings?.join(' ')).toContain('ORDER BY vp');
    });
  });

  describe('getHeatmap', () => {
    const admin = { id: 'admin-1', role: 'ADMIN', permissions: [] } as const;

    it('aggregates delivered orders into valid GeoJSON cells and applies filters', async () => {
      const prisma = createPrisma();
      prisma.$queryRaw.mockResolvedValue([
        { longitude: '-96.1342', latitude: '19.1738', count: 3, weight: 3 },
      ]);

      const result = await serviceWith(prisma, {
        FLEET_ANALYTICS_MAX_RANGE_DAYS: 31,
      }).getHeatmap(
        {
          metric: FleetHeatmapMetric.DELIVERIES,
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-02T23:59:59.999Z',
          originLocationId: 'origin-1',
          vehicleId: 'vehicle-1',
          routeId: 'route-1',
        },
        admin,
      );

      expect(result).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-96.1342, 19.1738] },
            properties: { weight: 3, count: 3, metric: 'DELIVERIES' },
          },
        ],
      });
      const query = prisma.$queryRaw.mock.calls[0][0] as {
        values?: unknown[];
        strings?: string[];
      };
      expect(query.values).toEqual(
        expect.arrayContaining([
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-02T23:59:59.999Z'),
          'origin-1',
          'vehicle-1',
          'route-1',
        ]),
      );
      expect(query.strings?.join(' ')).toContain('deliveredAt');
      expect(query.strings?.join(' ')).toContain('DELIVERED');
      expect(query.strings?.join(' ')).toContain('ST_SnapToGrid');
    });

    it('uses persisted incidents and excludes records outside the requested occurredAt range', async () => {
      const prisma = createPrisma();
      prisma.$queryRaw.mockResolvedValue([
        { longitude: -96.13, latitude: 19.17, count: '2', weight: '2' },
      ]);

      const result = await serviceWith(prisma).getHeatmap(
        {
          metric: FleetHeatmapMetric.INCIDENTS,
          from: '2026-08-12T15:00:00.000Z',
          to: '2026-08-12T17:00:00.000Z',
          originLocationId: 'origin-1',
        },
        admin,
      );

      expect(result.features[0]).toEqual(
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [-96.13, 19.17] },
          properties: { weight: 2, count: 2, metric: 'INCIDENTS' },
        }),
      );
      const query = prisma.$queryRaw.mock.calls[0][0] as {
        values?: unknown[];
        strings?: string[];
      };
      expect(query.values).toEqual(
        expect.arrayContaining([
          new Date('2026-08-12T15:00:00.000Z'),
          new Date('2026-08-12T17:00:00.000Z'),
          'origin-1',
        ]),
      );
      expect(query.strings?.join(' ')).toContain('occurredAt');
      expect(query.strings?.join(' ')).toContain('DeliveryIncident');
    });

    it('rejects unauthorized access, invalid ranges, and ranges over the configured maximum', async () => {
      const prisma = createPrisma();
      const service = serviceWith(prisma, {
        FLEET_ANALYTICS_MAX_RANGE_DAYS: 7,
      });

      await expect(
        service.getHeatmap(
          {
            metric: 'POSITIONS' as never,
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-02T00:00:00.000Z',
          },
          { id: 'driver-1', role: 'DRIVER', permissions: [] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        service.getHeatmap(
          {
            metric: 'POSITIONS' as never,
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-02T00:00:00.000Z',
          },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.getHeatmap(
          {
            metric: FleetHeatmapMetric.DELIVERIES,
            from: '2026-08-03T00:00:00.000Z',
            to: '2026-08-02T00:00:00.000Z',
          },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.getHeatmap(
          {
            metric: FleetHeatmapMetric.INCIDENTS,
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-10T00:00:00.000Z',
          },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('publishPosition', () => {
    it('rejects a route belonging to another driver before writing', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(
        activeRoute({ driverId: 'driver-2' }),
      );

      await expect(
        serviceWith(prisma).publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it.each([
      DeliveryRouteStatus.PENDING,
      DeliveryRouteStatus.COMPLETED,
      DeliveryRouteStatus.CANCELLED,
    ])('rejects a %s route', async (status) => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(
        activeRoute({ status }),
      );

      await expect(
        serviceWith(prisma).publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects an inactive vehicle and derives the vehicle from the route', async () => {
      const inactivePrisma = createPrisma();
      inactivePrisma.deliveryRoute.findUnique.mockResolvedValue(
        activeRoute({ vehicle: { ...activeRoute().vehicle, isActive: false } }),
      );
      await expect(
        serviceWith(inactivePrisma).publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(activeRoute());
      prisma.$queryRaw.mockResolvedValue([positionRow()]);
      const result = await serviceWith(prisma).publishPosition(
        {
          clientEventId: 'event-1',
          latitude: 19.1738,
          longitude: -96.1342,
          recordedAt: new Date().toISOString(),
        },
        driver(),
      );

      expect(result.vehicleId).toBe('vehicle-1');
      const query = prisma.$queryRaw.mock.calls[0][0] as {
        values?: unknown[];
      };
      expect(query.values).toEqual(expect.arrayContaining([-96.1342, 19.1738]));
    });

    it('replays a duplicate clientEventId without inserting a second row', async () => {
      const prisma = createPrisma();
      const fleetGateway = { emitPositionUpdated: jest.fn() };
      prisma.deliveryRoute.findUnique.mockResolvedValue(activeRoute());
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([positionRow()]);

      const result = await serviceWith(
        prisma,
        {},
        fleetGateway,
      ).publishPosition(
        {
          clientEventId: 'event-1',
          latitude: 19.1738,
          longitude: -96.1342,
          recordedAt: new Date().toISOString(),
        },
        driver(),
      );

      expect(result).toEqual({
        id: 'position-1',
        vehicleId: 'vehicle-1',
        routeId: 'route-1',
        recordedAt: '2026-08-12T16:00:00.000Z',
        receivedAt: '2026-08-12T16:00:01.000Z',
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(fleetGateway.emitPositionUpdated).not.toHaveBeenCalled();
    });

    it('publishes position.updated once after a successful insert', async () => {
      const prisma = createPrisma();
      const fleetGateway = { emitPositionUpdated: jest.fn() };
      prisma.deliveryRoute.findUnique.mockResolvedValue(
        activeRoute({ originLocationId: 'origin-1' }),
      );
      prisma.$queryRaw.mockResolvedValue([positionRow()]);

      await serviceWith(prisma, {}, fleetGateway).publishPosition(
        {
          clientEventId: 'event-1',
          latitude: 19.1738,
          longitude: -96.1342,
          accuracyMeters: 12.5,
          speedKph: 32.2,
          headingDegrees: 185,
          recordedAt: new Date().toISOString(),
        },
        driver(),
      );

      expect(fleetGateway.emitPositionUpdated).toHaveBeenCalledTimes(1);
      expect(fleetGateway.emitPositionUpdated).toHaveBeenCalledWith({
        vehicleId: 'vehicle-1',
        vehicleCode: 'UNIDAD-01',
        routeId: 'route-1',
        driverId: 'driver-1',
        originLocationId: 'origin-1',
        latitude: 19.1738,
        longitude: -96.1342,
        accuracyMeters: 12.5,
        speedKph: 32.2,
        headingDegrees: 185,
        recordedAt: '2026-08-12T16:00:00.000Z',
      });
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        fleetGateway.emitPositionUpdated.mock.invocationCallOrder[0],
      );
    });

    it('does not publish when position persistence fails', async () => {
      const prisma = createPrisma();
      const fleetGateway = { emitPositionUpdated: jest.fn() };
      prisma.deliveryRoute.findUnique.mockResolvedValue(activeRoute());
      prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

      await expect(
        serviceWith(prisma, {}, fleetGateway).publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toThrow('database unavailable');
      expect(fleetGateway.emitPositionUpdated).not.toHaveBeenCalled();
    });

    it('evaluates geofences inside the persistence flow and emits the transition after it succeeds', async () => {
      const prisma = createPrisma();
      const fleetGateway = {
        emitPositionUpdated: jest.fn(),
        emitGeofenceEntered: jest.fn(),
        emitGeofenceExited: jest.fn(),
      };
      const geofenceService = { evaluatePosition: jest.fn() };
      geofenceService.evaluatePosition.mockResolvedValue([
        {
          id: 'event-1',
          zoneId: 'zone-1',
          zoneName: 'Zona Norte',
          vehicleId: 'vehicle-1',
          vehicleCode: 'UNIDAD-01',
          routeId: 'route-1',
          positionId: 'position-1',
          type: 'ENTER',
          latitude: 19.1738,
          longitude: -96.1342,
          occurredAt: new Date('2026-08-12T16:00:00.000Z'),
        },
      ]);
      prisma.deliveryRoute.findUnique.mockResolvedValue(
        activeRoute({ originLocationId: 'origin-1' }),
      );
      prisma.$queryRaw.mockResolvedValue([positionRow()]);

      await serviceWith(
        prisma,
        {},
        fleetGateway,
        geofenceService,
      ).publishPosition(
        {
          clientEventId: 'event-1',
          latitude: 19.1738,
          longitude: -96.1342,
          recordedAt: new Date().toISOString(),
        },
        driver(),
      );

      expect(geofenceService.evaluatePosition).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'position-1',
          vehicleId: 'vehicle-1',
          routeId: 'route-1',
        }),
        expect.objectContaining({ originLocationId: 'origin-1' }),
      );
      expect(fleetGateway.emitGeofenceEntered).toHaveBeenCalledWith(
        {
          eventId: 'event-1',
          type: 'ENTER',
          zoneId: 'zone-1',
          zoneName: 'Zona Norte',
          vehicleId: 'vehicle-1',
          vehicleCode: 'UNIDAD-01',
          routeId: 'route-1',
          latitude: 19.1738,
          longitude: -96.1342,
          occurredAt: '2026-08-12T16:00:00.000Z',
        },
        'origin-1',
      );
      expect(fleetGateway.emitGeofenceExited).not.toHaveBeenCalled();
    });

    it('rejects replay of a clientEventId from another assignment', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(activeRoute());
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([positionRow({ routeId: 'route-2' })]);

      await expect(
        serviceWith(prisma).publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects invalid coordinates, metrics, and far-future captures', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(activeRoute());
      const service = serviceWith(prisma, {
        FLEET_POSITION_FUTURE_TOLERANCE_SECONDS: 1,
      });

      await expect(
        service.publishPosition(
          {
            clientEventId: 'event-1',
            latitude: 91,
            longitude: -96.1342,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.publishPosition(
          {
            clientEventId: 'event-2',
            latitude: 19.1738,
            longitude: -96.1342,
            accuracyMeters: -1,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.publishPosition(
          {
            clientEventId: 'event-3',
            latitude: 19.1738,
            longitude: -96.1342,
            headingDegrees: 360,
            recordedAt: new Date().toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.publishPosition(
          {
            clientEventId: 'event-4',
            latitude: 19.1738,
            longitude: -96.1342,
            recordedAt: new Date(Date.now() + 60_000).toISOString(),
          },
          driver(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getLive', () => {
    it('returns the latest persisted position per vehicle and computes stale server-side', async () => {
      const prisma = createPrisma();
      prisma.$queryRaw.mockResolvedValue([
        {
          vehicleId: 'vehicle-1',
          vehicleCode: 'UNIDAD-01',
          vehicleDisplayName: 'Unidad 1',
          vehiclePlateNumber: 'ABC-123',
          driverId: 'driver-1',
          driverName: 'Driver',
          routeId: 'route-1',
          routeName: 'Ruta Centro',
          routeStatus: DeliveryRouteStatus.IN_PROGRESS,
          scheduledDate: new Date('2026-08-12T00:00:00.000Z'),
          originLocationId: 'location-1',
          latitude: 19.1738,
          longitude: -96.1342,
          accuracyMeters: 12.5,
          speedKph: 32.2,
          headingDegrees: 185,
          positionRecordedAt: new Date(Date.now() - 120_000),
          nextStop: { id: 'order-1', stopSequence: 1 },
          incidentCountActive: 2,
          incidents: [
            {
              incidentId: 'incident-1',
              deliveryOrderId: 'order-1',
              routeId: 'route-1',
              vehicleId: 'vehicle-1',
              driverId: 'driver-1',
              status: 'OPEN',
              reason: 'Cliente no localizado',
              occurredAt: '2026-08-12T16:00:00.000Z',
              position: null,
              stop: null,
            },
          ],
        },
        {
          vehicleId: 'vehicle-2',
          vehicleCode: 'UNIDAD-02',
          vehicleDisplayName: 'Unidad 2',
          vehiclePlateNumber: null,
          driverId: 'driver-2',
          driverName: 'Driver 2',
          routeId: 'route-2',
          routeName: 'Ruta Norte',
          routeStatus: DeliveryRouteStatus.IN_PROGRESS,
          scheduledDate: new Date('2026-08-12T00:00:00.000Z'),
          originLocationId: 'location-1',
          latitude: 19.18,
          longitude: -96.13,
          accuracyMeters: null,
          speedKph: null,
          headingDegrees: null,
          positionRecordedAt: new Date(),
          nextStop: null,
        },
      ]);

      const result = await serviceWith(prisma).getLive(
        { originLocationId: 'location-1', routeId: 'route-1' },
        { id: 'admin-1', role: 'ADMIN' },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          vehicle: expect.objectContaining({ id: 'vehicle-1' }),
          route: expect.objectContaining({ id: 'route-1' }),
          position: expect.objectContaining({
            latitude: 19.1738,
            longitude: -96.1342,
          }),
          stale: true,
          nextStop: { id: 'order-1', stopSequence: 1 },
          incidentCountActive: 2,
          incidents: [expect.objectContaining({ incidentId: 'incident-1' })],
        }),
      );
      expect(result.items[1].stale).toBe(false);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const query = prisma.$queryRaw.mock.calls[0][0] as {
        values?: unknown[];
      };
      expect(query.values).toEqual(
        expect.arrayContaining(['location-1', 'route-1']),
      );
    });

    it('denies live fleet reads without fleet.view', async () => {
      const prisma = createPrisma();
      await expect(
        serviceWith(prisma).getLive(
          {},
          {
            id: 'driver-1',
            role: 'DRIVER',
            permissions: [PERMISSIONS.FLEET_POSITION_PUBLISH],
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('keeps an in-progress route visible when it has no persisted position', async () => {
      const prisma = createPrisma();
      prisma.$queryRaw.mockResolvedValue([
        {
          vehicleId: 'vehicle-1',
          vehicleCode: 'UNIDAD-01',
          vehicleDisplayName: 'Unidad 1',
          vehiclePlateNumber: null,
          driverId: 'driver-1',
          driverName: 'Driver',
          routeId: 'route-1',
          routeName: 'Ruta Centro',
          routeStatus: DeliveryRouteStatus.IN_PROGRESS,
          scheduledDate: new Date('2026-08-12T00:00:00.000Z'),
          originLocationId: 'location-1',
          routeGeometry: {
            type: 'LineString',
            coordinates: [
              [-96.2, 19.1],
              [-96.15, 19.15],
            ],
          },
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          speedKph: null,
          headingDegrees: null,
          positionRecordedAt: null,
          nextStop: null,
          deliveryStops: [],
          totalOrdersCount: 2,
          deliveredOrdersCount: 0,
        },
      ]);

      const result = await serviceWith(prisma).getLive(
        {},
        { id: 'admin-1', role: 'ADMIN' },
      );

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          position: null,
          stale: true,
          route: expect.objectContaining({
            geometry: {
              type: 'LineString',
              coordinates: [
                [-96.2, 19.1],
                [-96.15, 19.15],
              ],
            },
            totalOrders: 2,
            deliveredOrders: 0,
          }),
        }),
      );
    });
  });

  describe('getRoutePositions', () => {
    it('returns bounded history in ascending recordedAt order', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue({
        id: 'route-1',
        driverId: 'driver-1',
      });
      prisma.$queryRaw.mockResolvedValue([
        positionRow({
          id: 'position-1',
          positionPoint: { type: 'Point', coordinates: [-96.1342, 19.1738] },
        }),
      ]);

      const result = await serviceWith(prisma).getRoutePositions(
        'route-1',
        {
          from: '2026-08-12T15:00:00.000Z',
          to: '2026-08-12T17:00:00.000Z',
          limit: 10,
        },
        { id: 'admin-1', role: 'ADMIN' },
      );

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          positionPoint: { type: 'Point', coordinates: [-96.1342, 19.1738] },
          latitude: 19.1738,
          longitude: -96.1342,
        }),
      );
      expect(result.limit).toBe(10);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('rejects unbounded history limits and unauthorized routes', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue({
        id: 'route-1',
        driverId: 'driver-2',
      });
      await expect(
        serviceWith(prisma).getRoutePositions(
          'route-1',
          { limit: 1001 },
          { id: 'driver-1', role: 'DRIVER', permissions: [] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();

      prisma.deliveryRoute.findUnique.mockResolvedValue({
        id: 'route-1',
        driverId: 'driver-1',
      });
      await expect(
        serviceWith(prisma).getRoutePositions(
          'route-1',
          { limit: 1001 },
          { id: 'admin-1', role: 'ADMIN' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns not found before querying history for an unknown route', async () => {
      const prisma = createPrisma();
      prisma.deliveryRoute.findUnique.mockResolvedValue(null);
      await expect(
        serviceWith(prisma).getRoutePositions(
          'missing',
          {},
          { id: 'admin-1', role: 'ADMIN' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
