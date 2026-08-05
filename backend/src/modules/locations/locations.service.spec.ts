import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchSupplyCycleStatus,
  InventoryTransferStatus,
  OperationalLocationType,
  PointOfSaleDailyCloseStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LocationsService } from './locations.service';

type LocationRecord = {
  id: string;
  name: string;
  code: string | null;
  type: OperationalLocationType;
  parentId: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrisma = {
  $transaction: jest.Mock;
  operationalLocation: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  inventoryTransfer: { findFirst: jest.Mock };
  pointOfSaleDailyClose: { findFirst: jest.Mock };
  deliveryRoute: { findFirst: jest.Mock };
  branchSupplyCycle: { findFirst: jest.Mock };
};

const now = new Date('2026-06-29T12:00:00.000Z');

function createLocation(
  overrides: Partial<LocationRecord> = {},
): LocationRecord {
  return {
    id: 'location-1',
    name: 'Almacén Principal',
    code: 'ALM-001',
    type: OperationalLocationType.WAREHOUSE,
    parentId: null,
    address: 'Dirección operativa',
    latitude: '19.173800',
    longitude: '-96.134200',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  const prisma = {
    $transaction: jest.fn(),
    operationalLocation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryTransfer: { findFirst: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn() },
    deliveryRoute: { findFirst: jest.fn() },
    branchSupplyCycle: { findFirst: jest.fn() },
  } as MockPrisma;

  prisma.$transaction.mockImplementation(
    (callback: (transaction: MockPrisma) => unknown) => callback(prisma),
  );

  return prisma;
}

function createService(prisma = createPrisma()): {
  service: LocationsService;
  prisma: MockPrisma;
} {
  return {
    service: new LocationsService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('LocationsService', () => {
  it('lists operational locations with active-by-default filters and no required hierarchy', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([
      createLocation(),
      createLocation({
        id: 'location-2',
        name: 'Pollería externa',
        code: 'EXT-001',
        type: OperationalLocationType.EXTERNAL_POINT_OF_SALE,
        parentId: null,
      }),
    ]);

    await expect(
      service.findAll(
        { role: 'ADMIN' },
        {
          page: 2,
          limit: 5,
          search: 'alm',
          type: OperationalLocationType.WAREHOUSE,
          parentId: 'parent-1',
        },
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'location-1',
          type: OperationalLocationType.WAREHOUSE,
          parentId: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          latitude: 19.1738,
          longitude: -96.1342,
        }),
        expect.objectContaining({
          id: 'location-2',
          type: OperationalLocationType.EXTERNAL_POINT_OF_SALE,
          parentId: null,
        }),
      ],
    });

    expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isActive: true,
        type: OperationalLocationType.WAREHOUSE,
        parentId: 'parent-1',
        OR: [
          { name: { contains: 'alm', mode: 'insensitive' } },
          { code: { contains: 'alm', mode: 'insensitive' } },
          { address: { contains: 'alm', mode: 'insensitive' } },
        ],
      }),
      orderBy: { name: 'asc' },
      skip: 5,
      take: 5,
    });
  });

  it('limits SELLER location listings to the assigned operational location', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([
      createLocation({
        id: 'location-2',
        type: OperationalLocationType.BRANCH,
      }),
    ]);

    await service.findAll(
      { role: 'SELLER', operationalLocationId: 'location-2' },
      { limit: 50 },
    );

    expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'location-2',
          isActive: true,
        }),
      }),
    );
  });

  it('keeps WAREHOUSE scope when a location search is applied', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([]);

    await service.findAll(
      { role: 'WAREHOUSE', operationalLocationId: 'cedis-1' },
      { search: 'Veracruz' },
    );

    expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          AND: [
            {
              OR: [
                { id: 'cedis-1' },
                {
                  parentId: 'cedis-1',
                  type: OperationalLocationType.BRANCH,
                  isActive: true,
                },
              ],
            },
            {
              OR: [
                { name: { contains: 'Veracruz', mode: 'insensitive' } },
                { code: { contains: 'Veracruz', mode: 'insensitive' } },
                { address: { contains: 'Veracruz', mode: 'insensitive' } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('does not expose locations when SELLER has no assigned location', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([]);

    await service.findAll({ role: 'SELLER' }, { limit: 50 });

    expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: '__seller_without_operational_location__',
        }),
      }),
    );
  });

  it('creates a root distribution center and a branch directly below it', async () => {
    const { service, prisma } = createService();
    const cedis = createLocation({
      id: 'cedis-1',
      type: OperationalLocationType.DISTRIBUTION_CENTER,
      parentId: null,
    });
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cedis);
    prisma.operationalLocation.create.mockImplementation(
      ({ data }: { data: unknown }) =>
        Promise.resolve(createLocation(data as Partial<LocationRecord>)),
    );

    await expect(
      service.create({
        name: 'CEDIS Veracruz',
        code: 'CEDIS-VER',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        latitude: 19.183,
        longitude: -96.134,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        parentId: null,
        latitude: 19.183,
        longitude: -96.134,
      }),
    );

    await expect(
      service.create({
        name: 'Sucursal Veracruz',
        code: 'VER',
        type: OperationalLocationType.BRANCH,
        parentId: 'cedis-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        type: OperationalLocationType.BRANCH,
        parentId: 'cedis-1',
      }),
    );

    expect(prisma.operationalLocation.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        name: 'Sucursal Veracruz',
        code: 'VER',
        type: OperationalLocationType.BRANCH,
        parentId: 'cedis-1',
        isActive: true,
      }),
    });
  });

  it('rejects invalid CEDIS hierarchy parents and a self parent', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create({
        name: 'CEDIS con padre',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        parentId: 'branch-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation({
        id: 'warehouse-1',
        type: OperationalLocationType.WAREHOUSE,
      }),
    );
    await expect(
      service.create({
        name: 'Sucursal con almacén',
        type: OperationalLocationType.BRANCH,
        parentId: 'warehouse-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation({
        id: 'branch-1',
        type: OperationalLocationType.WAREHOUSE,
      }),
    );
    await expect(
      service.update('branch-1', { parentId: 'branch-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a multi-level cycle before updating an otherwise compatible parent', async () => {
    const { service, prisma } = createService();
    const root = createLocation({
      id: 'root-warehouse',
      type: OperationalLocationType.WAREHOUSE,
      parentId: null,
    });
    const child = createLocation({
      id: 'child-warehouse',
      type: OperationalLocationType.WAREHOUSE,
      parentId: 'grandchild-warehouse',
    });
    const grandchild = createLocation({
      id: 'grandchild-warehouse',
      type: OperationalLocationType.WAREHOUSE,
      parentId: 'root-warehouse',
    });
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(root)
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce(grandchild)
      .mockResolvedValueOnce(root);

    await expect(
      service.update('root-warehouse', { parentId: 'child-warehouse' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('does not change a CEDIS type while active children depend on it', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({
        id: 'cedis-1',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        parentId: null,
      }),
    );
    prisma.operationalLocation.findFirst.mockResolvedValue({ id: 'branch-1' });

    await expect(
      service.update('cedis-1', { type: OperationalLocationType.WAREHOUSE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('rejects branch hierarchy changes while a CEDIS cycle is open', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({
        id: 'branch-1',
        type: OperationalLocationType.BRANCH,
        parentId: 'cedis-1',
      }),
    );
    prisma.branchSupplyCycle.findFirst.mockResolvedValue({ id: 'cycle-1' });

    await expect(
      service.update('branch-1', { parentId: 'cedis-2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('rejects reactivation under an inactive CEDIS before the database write', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(
        createLocation({
          id: 'branch-1',
          type: OperationalLocationType.BRANCH,
          parentId: 'cedis-1',
          isActive: false,
        }),
      )
      .mockResolvedValueOnce(
        createLocation({
          id: 'cedis-1',
          type: OperationalLocationType.DISTRIBUTION_CENTER,
          parentId: null,
          isActive: false,
        }),
      );

    await expect(
      service.update('branch-1', { isActive: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('requires paired in-range coordinates before writing', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create({
        name: 'Solo latitud',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        latitude: 19.183,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Latitud inválida',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        latitude: 91,
        longitude: -96.134,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.create).not.toHaveBeenCalled();
  });

  it('returns only active direct branches for an authorized CEDIS', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({
        id: 'cedis-1',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
      }),
    );
    prisma.operationalLocation.findMany.mockResolvedValue([
      createLocation({
        id: 'branch-1',
        type: OperationalLocationType.BRANCH,
        parentId: 'cedis-1',
      }),
    ]);

    await expect(
      service.findActiveBranches('cedis-1', {
        role: 'WAREHOUSE',
        operationalLocationId: 'cedis-1',
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: 'branch-1', parentId: 'cedis-1' })],
    });
    expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith({
      where: {
        parentId: 'cedis-1',
        type: OperationalLocationType.BRANCH,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  });

  it('prevents scope leaks on individual location reads and CEDIS branch queries', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({ id: 'branch-2', type: OperationalLocationType.BRANCH }),
    );

    await expect(
      service.findOne('branch-2', {
        role: 'SELLER',
        operationalLocationId: 'branch-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.findActiveBranches('cedis-1', {
        role: 'SELLER',
        operationalLocationId: 'branch-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not disclose a non-CEDIS identifier through the active branches query', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({ id: 'branch-1', type: OperationalLocationType.BRANCH }),
    );

    await expect(
      service.findActiveBranches('branch-1', { role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.operationalLocation.findMany).not.toHaveBeenCalled();
  });

  it('enforces unique codes and existing parent locations before writing', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation({ id: 'duplicate-location' }),
    );

    await expect(
      service.create({
        name: 'Almacén duplicado',
        code: 'ALM-001',
        type: OperationalLocationType.WAREHOUSE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      service.create({
        name: 'Almacén hijo',
        code: 'ALM-002',
        type: OperationalLocationType.WAREHOUSE,
        parentId: 'missing-parent',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.operationalLocation.create).not.toHaveBeenCalled();
  });

  it('updates administrative data and soft-deactivates without physical delete', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation(),
    );
    prisma.operationalLocation.update.mockResolvedValueOnce(
      createLocation({ address: 'Nueva dirección' }),
    );

    await expect(
      service.update('location-1', { address: 'Nueva dirección' }),
    ).resolves.toEqual(expect.objectContaining({ address: 'Nueva dirección' }));
    expect(prisma.operationalLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: { address: 'Nueva dirección' },
    });

    prisma.operationalLocation.findFirst.mockResolvedValueOnce(
      createLocation(),
    );
    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
    prisma.deliveryRoute.findFirst.mockResolvedValueOnce(null);
    prisma.branchSupplyCycle.findFirst.mockResolvedValueOnce(null);
    prisma.operationalLocation.update.mockResolvedValueOnce(
      createLocation({ isActive: false }),
    );

    await expect(service.deactivate('location-1')).resolves.toEqual(
      expect.objectContaining({ isActive: false }),
    );
    expect(prisma.operationalLocation.update).toHaveBeenLastCalledWith({
      where: { id: 'location-1' },
      data: { isActive: false },
    });
    expect(prisma.operationalLocation).not.toHaveProperty('delete');
  });

  it('blocks deactivation when open operational dependencies still use the location', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findFirst.mockResolvedValue(createLocation());
    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce({
      id: 'transfer-1',
      status: InventoryTransferStatus.IN_TRANSIT,
    });

    await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce({
      id: 'close-1',
      status: PointOfSaleDailyCloseStatus.DRAFT,
    });

    await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
    prisma.deliveryRoute.findFirst.mockResolvedValueOnce({
      id: 'route-1',
    });

    await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
    prisma.deliveryRoute.findFirst.mockResolvedValueOnce(null);
    prisma.branchSupplyCycle.findFirst.mockResolvedValueOnce({
      id: 'cycle-1',
      status: BranchSupplyCycleStatus.OPEN,
    });

    await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('does not orphan active branches when deactivating a CEDIS', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findFirst.mockResolvedValue(
      createLocation({
        id: 'cedis-1',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        parentId: null,
      }),
    );
    prisma.operationalLocation.findMany.mockResolvedValue([
      { id: 'branch-1', isActive: true },
    ]);

    await expect(service.deactivate('cedis-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.inventoryTransfer.findFirst).not.toHaveBeenCalled();
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('returns a controlled error when a branch still has active child locations', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findFirst.mockResolvedValue(
      createLocation({ type: OperationalLocationType.BRANCH }),
    );
    prisma.operationalLocation.findMany.mockResolvedValue([
      { id: 'route-stock-1', isActive: true },
    ]);

    await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
  });

  it('runs the same dependency guard when PATCH deactivates a location', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation(),
    );
    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce({
      id: 'transfer-1',
      status: InventoryTransferStatus.IN_TRANSIT,
    });

    await expect(
      service.update('location-1', { isActive: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operationalLocation.update).not.toHaveBeenCalled();

    prisma.operationalLocation.findUnique.mockResolvedValueOnce(
      createLocation(),
    );
    prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
    prisma.deliveryRoute.findFirst.mockResolvedValueOnce(null);
    prisma.branchSupplyCycle.findFirst.mockResolvedValueOnce(null);
    prisma.operationalLocation.update.mockResolvedValueOnce(
      createLocation({ isActive: false }),
    );

    await expect(
      service.update('location-1', { isActive: false }),
    ).resolves.toEqual(expect.objectContaining({ isActive: false }));
  });

  it.each([
    BranchSupplyCycleStatus.OPEN,
    BranchSupplyCycleStatus.READY_FOR_REVIEW,
  ])(
    'blocks deactivation while a %s supply cycle remains open',
    async (status) => {
      const { service, prisma } = createService();
      prisma.operationalLocation.findFirst.mockResolvedValue(createLocation());
      prisma.inventoryTransfer.findFirst.mockResolvedValue(null);
      prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
      prisma.deliveryRoute.findFirst.mockResolvedValue(null);
      prisma.branchSupplyCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status,
      });

      await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
    },
  );

  it('blocks inactive locations from new sales, purchases, adjustments, and transfers', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(
      createLocation({ isActive: false }),
    );

    await expect(
      service.assertLocationCanBeUsedForSale('location-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertLocationCanBeUsedForPurchase('location-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertLocationCanBeUsedForAdjustment('location-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertLocationsCanBeUsedForTransfer('location-1', 'location-2'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.operationalLocation.findUnique).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      select: { id: true, isActive: true },
    });
  });

  it('returns NotFoundException for missing location reads or operational usage checks', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing-location', { role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.assertLocationCanBeUsedForSale('missing-location'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
