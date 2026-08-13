import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VehicleService } from './vehicle.service';

const vehicle = (overrides: Record<string, unknown> = {}) => ({
  id: 'vehicle-1',
  code: 'UNIDAD-01',
  displayName: 'Unidad 1',
  plateNumber: null,
  homeLocationId: null,
  isActive: true,
  createdAt: new Date('2026-06-19T10:00:00.000Z'),
  updatedAt: new Date('2026-06-19T10:00:00.000Z'),
  ...overrides,
});

function createPrisma() {
  const prisma = {
    vehicle: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    operationalLocation: { findFirst: jest.fn() },
    deliveryRoute: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  };
  return prisma;
}

function uniqueError(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: [target] },
  });
}

describe('VehicleService', () => {
  it('lists vehicles using active, location, search, and pagination filters', async () => {
    const prisma = createPrisma();
    prisma.vehicle.findMany.mockResolvedValue([vehicle()]);
    prisma.vehicle.count.mockResolvedValue(1);

    const result = await new VehicleService(
      prisma as unknown as PrismaService,
    ).findAll({
      active: true,
      homeLocationId: 'location-1',
      search: 'unidad',
      page: 2,
      limit: 10,
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        homeLocationId: 'location-1',
        OR: [
          { code: { contains: 'unidad', mode: 'insensitive' } },
          { displayName: { contains: 'unidad', mode: 'insensitive' } },
          { plateNumber: { contains: 'unidad', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      items: [expect.objectContaining({ code: 'UNIDAD-01' })],
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
    });
  });

  it('creates a vehicle and validates its active home location', async () => {
    const prisma = createPrisma();
    prisma.operationalLocation.findFirst.mockResolvedValue({ id: 'location-1' });
    prisma.vehicle.create.mockResolvedValue(
      vehicle({ homeLocationId: 'location-1', plateNumber: 'ABC-123' }),
    );

    await new VehicleService(prisma as unknown as PrismaService).create({
      code: ' UNIDAD-01 ',
      displayName: ' Unidad 1 ',
      plateNumber: ' ABC-123 ',
      homeLocationId: 'location-1',
    });

    expect(prisma.vehicle.create).toHaveBeenCalledWith({
      data: {
        code: 'UNIDAD-01',
        displayName: 'Unidad 1',
        plateNumber: 'ABC-123',
        homeLocationId: 'location-1',
        isActive: true,
      },
    });
  });

  it('rejects an inactive or missing home location', async () => {
    const prisma = createPrisma();
    prisma.operationalLocation.findFirst.mockResolvedValue(null);

    await expect(
      new VehicleService(prisma as unknown as PrismaService).create({
        code: 'UNIDAD-01',
        displayName: 'Unidad 1',
        homeLocationId: 'location-inactive',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it.each(['code', 'plateNumber'])('maps duplicate %s to conflict', async (field) => {
    const prisma = createPrisma();
    prisma.vehicle.create.mockRejectedValue(uniqueError(field));

    await expect(
      new VehicleService(prisma as unknown as PrismaService).create({
        code: 'UNIDAD-01',
        displayName: 'Unidad 1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates mutable vehicle fields without a delete operation', async () => {
    const prisma = createPrisma();
    prisma.vehicle.findUnique.mockResolvedValue(vehicle());
    prisma.vehicle.update.mockResolvedValue(
      vehicle({ displayName: 'Unidad Centro', isActive: false }),
    );

    await new VehicleService(prisma as unknown as PrismaService).update(
      'vehicle-1',
      { displayName: ' Unidad Centro ', isActive: false },
    );

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      data: { displayName: 'Unidad Centro', isActive: false },
    });
  });

  it('rejects deactivation while the vehicle has an in-progress route', async () => {
    const prisma = createPrisma();
    prisma.vehicle.findUnique.mockResolvedValue(vehicle());
    prisma.deliveryRoute.findFirst.mockResolvedValue({ id: 'route-1' });

    await expect(
      new VehicleService(prisma as unknown as PrismaService).update(
        'vehicle-1',
        { isActive: false },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown vehicle', async () => {
    const prisma = createPrisma();
    prisma.vehicle.findUnique.mockResolvedValue(null);

    await expect(
      new VehicleService(prisma as unknown as PrismaService).update(
        'missing',
        { displayName: 'Unidad' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
