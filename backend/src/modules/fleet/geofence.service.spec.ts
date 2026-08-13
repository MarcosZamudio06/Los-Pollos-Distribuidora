import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { GeofenceService } from './geofence.service';

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-96.2, 19.1],
      [-96.1, 19.1],
      [-96.1, 19.2],
      [-96.2, 19.2],
      [-96.2, 19.1],
    ],
  ],
};

const admin = {
  id: 'admin-1',
  role: 'ADMIN',
  permissions: [PERMISSIONS.FLEET_ZONES_MANAGE, PERMISSIONS.FLEET_VIEW],
};

function createPrisma() {
  const prisma = {
    operationalLocation: { findFirst: jest.fn() },
    deliveryZone: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    geofenceEvent: { findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  };
  return prisma;
}

function asClient(prisma: ReturnType<typeof createPrisma>) {
  return prisma as unknown as Prisma.TransactionClient;
}

describe('GeofenceService', () => {
  it('rejects a non-Polygon, open, empty, or inverted-out-of-range geometry before PostGIS', async () => {
    const prisma = createPrisma();
    const service = new GeofenceService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          name: 'Zona',
          originLocationId: 'origin-1',
          geometry: { type: 'Point' },
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.create(
        {
          name: 'Zona',
          originLocationId: 'origin-1',
          geometry: {
            ...polygon,
            coordinates: [[...polygon.coordinates[0].slice(0, -1)]],
          },
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.create(
        {
          name: 'Zona',
          originLocationId: 'origin-1',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [19.1, -96.2],
                [19.1, -96.1],
                [19.2, -96.1],
                [19.1, -96.2],
              ],
            ],
          },
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires zone management permission and validates the origin location', async () => {
    const prisma = createPrisma();
    prisma.operationalLocation.findFirst.mockResolvedValue(null);
    const service = new GeofenceService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        { name: 'Zona', originLocationId: 'origin-1', geometry: polygon },
        { id: 'driver-1', role: 'DRIVER', permissions: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.create(
        { name: 'Zona', originLocationId: 'origin-1', geometry: polygon },
        admin,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('stores the validated JSON and PostGIS polygon without retroactive events', async () => {
    const prisma = createPrisma();
    prisma.operationalLocation.findFirst.mockResolvedValue({ id: 'origin-1' });
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          isValid: true,
          isEmpty: false,
          geometryType: 'ST_Polygon',
          srid: 4326,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'zone-1',
          name: 'Zona Norte',
          originLocationId: 'origin-1',
          geometry: polygon,
          isActive: true,
          createdByUserId: 'admin-1',
          updatedByUserId: 'admin-1',
          createdAt: new Date('2026-08-12T16:00:00.000Z'),
          updatedAt: new Date('2026-08-12T16:00:00.000Z'),
        },
      ]);

    const result = await new GeofenceService(
      prisma as unknown as PrismaService,
    ).create(
      { name: ' Zona Norte ', originLocationId: 'origin-1', geometry: polygon },
      admin,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'zone-1',
        name: 'Zona Norte',
        geometry: polygon,
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const insert = prisma.$queryRaw.mock.calls[1][0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(insert.sql).toContain('ST_GeomFromGeoJSON');
    expect(insert.values).toEqual(
      expect.arrayContaining([JSON.stringify(polygon)]),
    );
  });

  it.each([
    {
      name: 'outside to inside emits ENTER',
      inside: true,
      previous: false,
      expected: 'ENTER',
    },
    {
      name: 'inside to inside emits nothing',
      inside: true,
      previous: true,
      expected: undefined,
    },
    {
      name: 'inside to outside emits EXIT',
      inside: false,
      previous: true,
      expected: 'EXIT',
    },
    {
      name: 'outside to outside emits nothing',
      inside: false,
      previous: false,
      expected: undefined,
    },
  ])('$name', async ({ inside, previous, expected }) => {
    const prisma = createPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'zone-1', name: 'Zona', isInside: inside }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          vehicleId: 'vehicle-1',
          zoneId: 'zone-1',
          isInside: previous,
          lastPositionId: 'position-previous',
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce(
        expected
          ? [
              {
                id: 'event-1',
                zoneId: 'zone-1',
                vehicleId: 'vehicle-1',
                routeId: 'route-1',
                positionId: 'position-1',
                type: expected,
                occurredAt: new Date('2026-08-12T16:00:00.000Z'),
              },
            ]
          : [],
      );

    const result = await new GeofenceService(
      prisma as unknown as PrismaService,
    ).evaluatePosition(
      asClient(prisma),
      {
        id: 'position-1',
        vehicleId: 'vehicle-1',
        routeId: 'route-1',
        recordedAt: new Date('2026-08-12T16:00:00.000Z'),
      },
      { originLocationId: 'origin-1' },
    );

    expect(result[0]?.type).toBe(expected);
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain('ST_Covers');
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain(
      '"isActive" = TRUE',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('treats a boundary as inside and does not duplicate a transition when the unique insert conflicts', async () => {
    const prisma = createPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'zone-1', name: 'Zona', isInside: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          vehicleId: 'vehicle-1',
          zoneId: 'zone-1',
          isInside: false,
          lastPositionId: 'position-old',
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await new GeofenceService(
      prisma as unknown as PrismaService,
    ).evaluatePosition(
      asClient(prisma),
      {
        id: 'position-1',
        vehicleId: 'vehicle-1',
        routeId: 'route-1',
        recordedAt: new Date('2026-08-12T16:00:00.000Z'),
      },
      { originLocationId: 'origin-1' },
    );

    expect(result).toEqual([]);
    expect(prisma.$queryRaw.mock.calls[3][0].sql).toContain(
      'ON CONFLICT ("zoneId", "positionId", "type") DO NOTHING',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not evaluate inactive zones and never creates an initial EXIT', async () => {
    const inactivePrisma = createPrisma();
    inactivePrisma.$queryRaw.mockResolvedValueOnce([]);
    const service = new GeofenceService(
      inactivePrisma as unknown as PrismaService,
    );

    await expect(
      service.evaluatePosition(
        asClient(inactivePrisma),
        {
          id: 'position-1',
          vehicleId: 'vehicle-1',
          routeId: 'route-1',
          recordedAt: new Date(),
        },
        { originLocationId: 'origin-1' },
      ),
    ).resolves.toEqual([]);
    expect(inactivePrisma.$queryRaw).toHaveBeenCalledTimes(1);

    const initialOutsidePrisma = createPrisma();
    initialOutsidePrisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'zone-1', name: 'Zona', isInside: false }])
      .mockResolvedValueOnce([
        {
          vehicleId: 'vehicle-1',
          zoneId: 'zone-1',
          isInside: false,
          lastPositionId: 'position-1',
          updatedAt: new Date(),
        },
      ]);

    await expect(
      new GeofenceService(
        initialOutsidePrisma as unknown as PrismaService,
      ).evaluatePosition(
        asClient(initialOutsidePrisma),
        {
          id: 'position-1',
          vehicleId: 'vehicle-1',
          routeId: 'route-1',
          recordedAt: new Date(),
        },
        { originLocationId: 'origin-1' },
      ),
    ).resolves.toEqual([]);
    expect(initialOutsidePrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not evaluate any zone when the route has no origin', async () => {
    const prisma = createPrisma();
    const result = await new GeofenceService(
      prisma as unknown as PrismaService,
    ).evaluatePosition(
      asClient(prisma),
      {
        id: 'position-1',
        vehicleId: 'vehicle-1',
        routeId: 'route-1',
        recordedAt: new Date(),
      },
      { originLocationId: null },
    );

    expect(result).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('enforces defensive pagination limits in the service layer', async () => {
    const prisma = createPrisma();
    const service = new GeofenceService(prisma as unknown as PrismaService);

    await expect(service.findAll({ limit: 101 }, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.findEvents({ limit: 501 }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryZone.findMany).not.toHaveBeenCalled();
    expect(prisma.geofenceEvent.findMany).not.toHaveBeenCalled();
  });
});
