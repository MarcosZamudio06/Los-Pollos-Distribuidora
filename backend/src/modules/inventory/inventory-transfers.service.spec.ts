import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { InventoryTransfersService } from './inventory-transfers.service';

type MockPrisma = {
  $transaction: jest.Mock;
  operationalLocation: { findUnique: jest.Mock };
  product: { findUnique: jest.Mock };
  inventoryTransfer: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  inventoryBalance: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
    findUnique: jest.Mock;
  };
  inventoryMovement: { create: jest.Mock };
  branchSupplyCycle: { findUnique: jest.Mock; updateMany: jest.Mock };
  branchSupplyCycleEvent: { create: jest.Mock };
  pointOfSaleDailyClose: { update: jest.Mock };
};

const now = new Date('2026-06-29T12:00:00.000Z');

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function idempotencyMarker(
  action: 'CONFIRM' | 'CANCEL',
  idempotencyKey: string,
  payload: Record<string, unknown>,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ action, idempotencyKey, payload }))
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();

  return `[idempotency:${action}:${digest}]`;
}

function createPrisma(): MockPrisma {
  const prisma = {
    $transaction: jest.fn(),
    operationalLocation: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, name: where.id, isActive: true }),
      ),
    },
    product: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          name: 'Pollo mixto',
          unit: ProductUnit.KG_AND_PIECE,
          isActive: true,
        }),
      ),
    },
    inventoryTransfer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryBalance: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    inventoryMovement: { create: jest.fn() },
    branchSupplyCycle: { findUnique: jest.fn(), updateMany: jest.fn() },
    branchSupplyCycleEvent: { create: jest.fn() },
    pointOfSaleDailyClose: { update: jest.fn() },
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: MockPrisma) => unknown) => callback(prisma),
  );
  return prisma;
}

function expectMovementEquations(
  prisma: MockPrisma,
  expectedGlobalDelta: { quantityKg: number; quantityPieces: number },
) {
  const movements = prisma.inventoryMovement.create.mock.calls.map(
    ([args]) =>
      args.data as {
        quantityKg: number;
        quantityPieces: number;
        previousQuantityKg: number;
        newQuantityKg: number;
        previousQuantityPieces: number;
        newQuantityPieces: number;
      },
  );

  for (const movement of movements) {
    expect(Math.abs(movement.newQuantityKg - movement.previousQuantityKg)).toBe(
      movement.quantityKg,
    );
    expect(
      Math.abs(movement.newQuantityPieces - movement.previousQuantityPieces),
    ).toBe(movement.quantityPieces);
  }
  expect(
    movements.reduce(
      (sum, movement) =>
        sum + movement.newQuantityKg - movement.previousQuantityKg,
      0,
    ),
  ).toBe(expectedGlobalDelta.quantityKg);
  expect(
    movements.reduce(
      (sum, movement) =>
        sum + movement.newQuantityPieces - movement.previousQuantityPieces,
      0,
    ),
  ).toBe(expectedGlobalDelta.quantityPieces);
}

function createService(prisma = createPrisma()) {
  return {
    service: new InventoryTransfersService(
      prisma as unknown as PrismaService,
      new InventoryBalanceService(),
    ),
    prisma,
  };
}

function createTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transfer-1',
    transferNumber: 'TRF-20260629-000001',
    originLocationId: 'origin-1',
    destinationLocationId: 'destination-1',
    userId: 'warehouse-1',
    status: InventoryTransferStatus.REQUESTED,
    notes: 'Route load',
    requestedAt: now,
    confirmedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
    originLocation: { id: 'origin-1', name: 'Matriz' },
    destinationLocation: { id: 'destination-1', name: 'Sucursal Centro' },
    items: [
      {
        id: 'item-1',
        transferId: 'transfer-1',
        productId: 'product-1',
        quantityKg: decimal(12.5),
        quantityPieces: 3,
        unit: ProductUnit.KG_AND_PIECE,
        createdAt: now,
        updatedAt: now,
        product: {
          id: 'product-1',
          name: 'Pollo mixto',
          unit: ProductUnit.KG_AND_PIECE,
        },
      },
    ],
    inventoryMovements: [],
    ...overrides,
  };
}

describe('InventoryTransfersService', () => {
  it('creates a requested transfer with active different locations, responsible user, and kilo/piece items', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
      .mockResolvedValueOnce({
        id: 'destination-1',
        name: 'Sucursal Centro',
        isActive: true,
      });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG_AND_PIECE,
      isActive: true,
    });
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(20),
        quantityPieces: 5,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      },
    ]);
    prisma.inventoryBalance.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.inventoryTransfer.create.mockResolvedValue(createTransfer());

    const result = await service.create(
      {
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        notes: ' Route load ',
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.KG_AND_PIECE,
            quantityKg: 12.5,
            quantityPieces: 3,
          },
        ],
      },
      'warehouse-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: { gte: 12.5 },
        quantityPieces: { gte: 3 },
        reservedQuantityKg: 0,
        reservedQuantityPieces: 0,
      },
      data: {
        reservedQuantityKg: { increment: 12.5 },
        reservedQuantityPieces: { increment: 3 },
      },
    });
    expect(prisma.inventoryTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        userId: 'warehouse-1',
        status: InventoryTransferStatus.REQUESTED,
        notes: 'Route load',
        requestedAt: expect.any(Date),
        items: {
          create: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG_AND_PIECE,
              quantityKg: 12.5,
              quantityPieces: 3,
            },
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'transfer-1',
        status: InventoryTransferStatus.REQUESTED,
        itemsCount: 1,
        items: [
          expect.objectContaining({
            productId: 'product-1',
            productName: 'Pollo mixto',
            unit: ProductUnit.KG_AND_PIECE,
            quantityKg: 12.5,
            quantityPieces: 3,
          }),
        ],
      }),
    );
  });

  it('returns a stable direction error for a branch outside its CEDIS parent', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({
        id: 'origin-1',
        type: 'DISTRIBUTION_CENTER',
        parentId: null,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'destination-1',
        type: 'BRANCH',
        parentId: 'another-cedis',
        isActive: true,
      });

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG,
              quantityKg: 1,
              quantityPieces: 0,
            },
          ],
        },
        'warehouse-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID',
      }),
    });
    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('aggregates repeated product lines by their KG and PIECE dimensions before reserving and persisting', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
      .mockResolvedValueOnce({
        id: 'destination-1',
        name: 'Sucursal Centro',
        isActive: true,
      });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG_AND_PIECE,
      isActive: true,
    });
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(20),
        quantityPieces: 10,
        reservedQuantityKg: decimal(1),
        reservedQuantityPieces: 1,
      },
    ]);
    prisma.inventoryBalance.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.inventoryTransfer.create.mockResolvedValue(createTransfer());

    await service.create(
      {
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.KG,
            quantityKg: 2,
          },
          {
            productId: 'product-1',
            unit: ProductUnit.PIECE,
            quantityPieces: 4,
          },
        ],
      },
      'warehouse-1',
    );

    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'product-1',
          quantityKg: { gte: 3 },
          quantityPieces: { gte: 5 },
        }),
        data: {
          reservedQuantityKg: { increment: 2 },
          reservedQuantityPieces: { increment: 4 },
        },
      }),
    );
    expect(prisma.inventoryTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                productId: 'product-1',
                unit: ProductUnit.KG_AND_PIECE,
                quantityKg: 2,
                quantityPieces: 4,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('aggregates repeated KG lines with decimal precision instead of binary floating-point drift', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
      .mockResolvedValueOnce({
        id: 'destination-1',
        name: 'Sucursal Centro',
        isActive: true,
      });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pechuga',
      unit: ProductUnit.KG,
      isActive: true,
    });
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(1),
        quantityPieces: 0,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryTransfer.create.mockResolvedValue(createTransfer());

    await service.create(
      {
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        items: [
          { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 0.1 },
          { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 0.2 },
        ],
      },
      'warehouse-1',
    );

    expect(prisma.inventoryTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                quantityKg: 0.3,
                quantityPieces: 0,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects a CEDIS cycle transfer before creating it when origin stock is insufficient', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'cedis-1'
            ? {
                id: 'cedis-1',
                name: 'CEDIS',
                type: 'DISTRIBUTION_CENTER',
                parentId: null,
                isActive: true,
              }
            : {
                id: 'branch-1',
                name: 'Sucursal',
                type: 'BRANCH',
                parentId: 'cedis-1',
                isActive: true,
              },
        ),
    );
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo',
      unit: ProductUnit.KG,
      isActive: true,
    });
    prisma.inventoryBalance.findMany.mockResolvedValue([]);

    await expect(
      service.create(
        {
          originLocationId: 'cedis-1',
          destinationLocationId: 'branch-1',
          items: [
            { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 10 },
          ],
        },
        'warehouse-1',
        'cedis-supply-insufficient-key',
        {
          cedisCycleTransfer: true,
          actor: {
            id: 'warehouse-1',
            role: 'WAREHOUSE',
            operationalLocationId: 'cedis-1',
            permissions: ['cedis.dispatch'],
          },
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        findings: [
          expect.objectContaining({
            productId: 'product-1',
            requestedKg: 10,
            availableKg: 0,
            shortageKg: 10,
          }),
        ],
      }),
    });

    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('collects every insufficient-product finding before performing any reservation write', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
      .mockResolvedValueOnce({
        id: 'destination-1',
        name: 'Sucursal Centro',
        isActive: true,
      });
    prisma.product.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          name: where.id,
          unit: ProductUnit.KG,
          isActive: true,
        }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(5),
        quantityPieces: 0,
        reservedQuantityKg: decimal(4),
        reservedQuantityPieces: 0,
      },
      {
        productId: 'product-2',
        locationId: 'origin-1',
        quantityKg: decimal(3),
        quantityPieces: 0,
        reservedQuantityKg: decimal(2),
        reservedQuantityPieces: 0,
      },
    ]);

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          items: [
            { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 2 },
            { productId: 'product-2', unit: ProductUnit.KG, quantityKg: 2 },
          ],
        },
        'warehouse-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        findings: [
          expect.objectContaining({
            productId: 'product-1',
            unit: ProductUnit.KG,
            shortageKg: 1,
          }),
          expect.objectContaining({
            productId: 'product-2',
            unit: ProductUnit.KG,
            shortageKg: 1,
          }),
        ],
      }),
    });

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('does not leave a transfer mutation after persistence fails following reservation', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
      .mockResolvedValueOnce({
        id: 'destination-1',
        name: 'Sucursal Centro',
        isActive: true,
      });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG,
      isActive: true,
    });
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryTransfer.create.mockRejectedValue(
      new Error('transfer persistence failed'),
    );

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          items: [
            { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 4 },
          ],
        },
        'warehouse-1',
      ),
    ).rejects.toThrow('transfer persistence failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryTransfer.create).toHaveBeenCalledTimes(1);
  });

  it('rejects generic transfers into a branch even when the source is its parent CEDIS', async () => {
    const { service, prisma } = createService();
    prisma.operationalLocation.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'cedis-1'
            ? {
                id: 'cedis-1',
                name: 'Matriz',
                type: 'DISTRIBUTION_CENTER',
                parentId: null,
                isActive: true,
              }
            : {
                id: 'branch-1',
                name: 'Alvarado',
                type: 'BRANCH',
                parentId: 'cedis-1',
                isActive: true,
              },
        ),
    );

    await expect(
      service.create(
        {
          originLocationId: 'cedis-1',
          destinationLocationId: 'branch-1',
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG,
              quantityKg: 1,
            },
          ],
        },
        'admin-1',
      ),
    ).rejects.toThrow(
      'Branch inventory transfers must be created through a CEDIS supply cycle',
    );
    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('rejects transfers with the same origin and destination or without items before writing', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        {
          originLocationId: 'location-1',
          destinationLocationId: 'location-1',
          items: [
            { productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1 },
          ],
        },
        'warehouse-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          items: [],
        },
        'warehouse-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('confirms a transfer once, decrementing origin and incrementing destination with traceable movements', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'destination-balance',
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(12.5),
        quantityPieces: 3,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryMovement.create
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'movement-out',
          createdAt: now,
          product: { name: 'Pollo mixto' },
          location: { name: 'Matriz' },
          ...data,
        }),
      )
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'movement-in',
          createdAt: now,
          product: { name: 'Pollo mixto' },
          location: { name: 'Sucursal Centro' },
          ...data,
        }),
      );
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        confirmedAt: now,
        inventoryMovements: [
          {
            id: 'movement-out',
            type: InventoryMovementType.TRANSFER_OUT,
            reason: 'Inventory transfer TRF-20260629-000001 confirmed',
          },
          { id: 'movement-in', type: InventoryMovementType.TRANSFER_IN },
        ],
      }),
    );

    const result = await service.confirm('transfer-1', 'warehouse-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: { gte: 12.5 },
        quantityPieces: { gte: 3 },
        reservedQuantityKg: { gte: 12.5 },
        reservedQuantityPieces: { gte: 3 },
      },
      data: {
        quantityKg: { decrement: 12.5 },
        quantityPieces: { decrement: 3 },
        reservedQuantityKg: { decrement: 12.5 },
        reservedQuantityPieces: { decrement: 3 },
      },
    });
    expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: {
        productId_locationId: {
          productId: 'product-1',
          locationId: 'destination-1',
        },
      },
      create: {
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: 12.5,
        quantityPieces: 3,
      },
      update: {
        quantityKg: { increment: 12.5 },
        quantityPieces: { increment: 3 },
      },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        locationId: 'origin-1',
        userId: 'warehouse-1',
        transferId: 'transfer-1',
        type: InventoryMovementType.TRANSFER_OUT,
        quantityKg: 12.5,
        quantityPieces: 3,
        previousQuantityKg: 30,
        newQuantityKg: 17.5,
        previousQuantityPieces: 10,
        newQuantityPieces: 7,
        reason: 'Inventory transfer TRF-20260629-000001 confirmed',
      }),
      include: { product: true, location: true },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        locationId: 'destination-1',
        userId: 'warehouse-1',
        transferId: 'transfer-1',
        type: InventoryMovementType.TRANSFER_IN,
        previousQuantityKg: 0,
        newQuantityKg: 12.5,
        previousQuantityPieces: 0,
        newQuantityPieces: 3,
      }),
      include: { product: true, location: true },
    });
    expect(result.status).toBe(InventoryTransferStatus.CONFIRMED);
    expect(result.movements).toEqual([
      expect.objectContaining({ type: InventoryMovementType.TRANSFER_OUT }),
      expect.objectContaining({ type: InventoryMovementType.TRANSFER_IN }),
    ]);
  });

  it('rejects confirmation when the pending reservation no longer matches and creates no movements', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'origin-1',
      quantityKg: decimal(30),
      quantityPieces: 10,
      reservedQuantityKg: decimal(12.5),
      reservedQuantityPieces: 3,
    });
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.confirm('transfer-1', 'warehouse-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
      }),
    });

    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('requires linked supplies to use the branch receipt flow', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'OPEN',
        version: 1,
        pointOfSaleDailyCloseId: null,
        pointOfSaleDailyClose: null,
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ branchSupplyCycleTransfer: cycleLink }),
    );
    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'linked-confirm-key'),
    ).rejects.toThrow('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('confirms sent quantities without recording a destination shortage movement', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'OPEN',
        version: 1,
        pointOfSaleDailyCloseId: null,
        pointOfSaleDailyClose: null,
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ branchSupplyCycleTransfer: cycleLink }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(10),
        quantityPieces: 2,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(10),
        quantityPieces: 2,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      });
    prisma.inventoryMovement.create.mockResolvedValue({});
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        branchSupplyCycleTransfer: cycleLink,
      }),
    );
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleEvent.create.mockResolvedValue({});

    await service.receiveSupply(
      'transfer-1',
      [{ transferItemId: 'item-1', quantityKg: 10, quantityPieces: 2 }],
      'seller-1',
      'receipt-key',
      {
        receiptId: 'receipt-1',
        actor: {
          id: 'seller-1',
          role: 'SELLER',
          operationalLocationId: 'destination-1',
          permissions: ['cedis.receive_supplies'],
        },
      },
    );

    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: 'BRANCH_SUPPLY_RECEIPT',
        }),
      }),
    );
    expectMovementEquations(prisma, { quantityKg: -2.5, quantityPieces: -1 });
    expect(prisma.inventoryTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InventoryTransferStatus.CONFIRMED,
        }),
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: InventoryMovementType.TRANSFER_IN,
          quantityKg: 10,
          newQuantityKg: 10,
        }),
      }),
    );
  });

  it('prevalidates every sent reservation before changing any item balance', async () => {
    const { service, prisma } = createService();
    const transfer = createTransfer({
      items: [
        createTransfer().items[0],
        {
          ...createTransfer().items[0],
          id: 'item-2',
          productId: 'product-2',
          quantityKg: decimal(2),
          quantityPieces: 0,
        },
      ],
    });
    prisma.inventoryTransfer.findUnique.mockResolvedValue(transfer);
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
      {
        productId: 'product-2',
        locationId: 'origin-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(1),
        reservedQuantityPieces: 0,
      },
    ]);
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(17.5),
        quantityPieces: 7,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(12.5),
        quantityPieces: 3,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      })
      .mockResolvedValueOnce({
        productId: 'product-2',
        locationId: 'origin-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(1),
        reservedQuantityPieces: 0,
      });
    prisma.inventoryBalance.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.inventoryBalance.upsert.mockResolvedValue({});

    await expect(
      service.confirm('transfer-1', 'warehouse-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
        productId: 'product-2',
      }),
    });

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('credits only received quantities without recording a second surplus movement', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'OPEN',
        version: 1,
        pointOfSaleDailyCloseId: null,
        pointOfSaleDailyClose: null,
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ branchSupplyCycleTransfer: cycleLink }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(15),
        quantityPieces: 4,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(15),
        quantityPieces: 4,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryMovement.create.mockResolvedValue({});
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        branchSupplyCycleTransfer: cycleLink,
      }),
    );
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleEvent.create.mockResolvedValue({});

    await service.receiveSupply(
      'transfer-1',
      [{ transferItemId: 'item-1', quantityKg: 15, quantityPieces: 4 }],
      'seller-1',
      'receipt-surplus-key',
      {
        receiptId: 'receipt-surplus-1',
        actor: {
          id: 'seller-1',
          role: 'SELLER',
          operationalLocationId: 'destination-1',
          permissions: ['cedis.receive_supplies'],
        },
      },
    );

    expect(prisma.inventoryMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: InventoryMovementType.TRANSFER_IN,
          quantityKg: 15,
          quantityPieces: 4,
          newQuantityKg: 15,
          newQuantityPieces: 4,
        }),
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: 'BRANCH_SUPPLY_RECEIPT',
        }),
      }),
    );
    expectMovementEquations(prisma, { quantityKg: 2.5, quantityPieces: 1 });
    expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          quantityKg: { increment: 15 },
          quantityPieces: { increment: 4 },
        },
      }),
    );
  });

  it('invalidates a linked cycle reconciliation exactly once when confirming a return', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'RETURN',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'READY_FOR_REVIEW',
        version: 7,
        pointOfSaleDailyCloseId: 'close-1',
        pointOfSaleDailyClose: { id: 'close-1', status: 'DRAFT' },
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        originLocationId: 'destination-1',
        destinationLocationId: 'origin-1',
        branchSupplyCycleTransfer: cycleLink,
      }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'destination-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(12.5),
        quantityPieces: 3,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryMovement.create.mockResolvedValue({});
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        branchSupplyCycleTransfer: cycleLink,
      }),
    );
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleEvent.create.mockResolvedValue({});

    await service.confirm('transfer-1', 'warehouse-1', 'return-confirm-key', {
      actor: {
        id: 'warehouse-1',
        role: 'WAREHOUSE',
        operationalLocationId: 'origin-1',
        permissions: ['cedis.receive_returns'],
      },
    });

    expect(prisma.branchSupplyCycle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'cycle-1', version: 7 }),
        data: expect.objectContaining({
          version: { increment: 1 },
          status: 'OPEN',
          reconciledDailyCloseVersion: null,
          reconciledAt: null,
        }),
      }),
    );
    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'TRANSFER_STATE_CHANGED',
          cycleVersion: 8,
          fromStatus: 'READY_FOR_REVIEW',
          toStatus: 'OPEN',
        }),
      }),
    );
    expect(prisma.branchSupplyCycle.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a linked confirmation outside the warehouse actor CEDIS scope', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'OPEN',
        version: 1,
        pointOfSaleDailyCloseId: null,
        pointOfSaleDailyClose: null,
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ branchSupplyCycleTransfer: cycleLink }),
    );
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.findUnique.mockResolvedValue({
      quantityKg: decimal(30),
      quantityPieces: 10,
    });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryMovement.create.mockResolvedValue({});
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        branchSupplyCycleTransfer: cycleLink,
      }),
    );

    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'out-of-scope-key', {
        actor: {
          id: 'warehouse-1',
          role: 'WAREHOUSE',
          operationalLocationId: 'other-cedis',
          permissions: ['cedis.dispatch'],
        },
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('does not confirm a transfer after its product becomes inactive', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG_AND_PIECE,
      isActive: false,
    });

    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'inactive-product-key'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('cancels a non-confirmed transfer with actor, date, and reason but rejects confirmed transfers', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValueOnce(createTransfer());
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Operational mistake',
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: ' Operational mistake ' },
        'warehouse-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Operational mistake',
      }),
    );
    expect(prisma.inventoryTransfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-1' },
      data: expect.objectContaining({
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Operational mistake',
        cancelledAt: expect.any(Date),
      }),
      include: expect.any(Object),
    });

    prisma.inventoryTransfer.findUnique.mockResolvedValueOnce(
      createTransfer({ status: InventoryTransferStatus.CONFIRMED }),
    );

    await expect(
      service.cancel('transfer-1', { reason: 'Too late' }, 'warehouse-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels a DRAFT transfer without attempting to release a reservation or create movements', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ status: InventoryTransferStatus.DRAFT }),
    );
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Draft no longer needed',
        cancelledAt: now,
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Draft no longer needed' },
        'warehouse-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ status: InventoryTransferStatus.CANCELLED }),
    );

    expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('cancels an IN_TRANSIT transfer by releasing the exact original quantities', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ status: InventoryTransferStatus.IN_TRANSIT }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(20),
        reservedQuantityPieces: 6,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Transit stopped',
        cancelledAt: now,
      }),
    );

    await service.cancel(
      'transfer-1',
      { reason: 'Transit stopped' },
      'warehouse-1',
    );

    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'origin-1',
        reservedQuantityKg: { gte: 12.5 },
        reservedQuantityPieces: { gte: 3 },
      },
      data: {
        reservedQuantityKg: { decrement: 12.5 },
        reservedQuantityPieces: { decrement: 3 },
      },
    });
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rolls back cancellation when any original reservation is missing', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'OPEN',
        version: 4,
        pointOfSaleDailyCloseId: null,
        pointOfSaleDailyClose: null,
      },
    };
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        branchSupplyCycleTransfer: cycleLink,
        items: [
          createTransfer().items[0],
          {
            ...createTransfer().items[0],
            id: 'item-2',
            productId: 'product-2',
          },
        ],
      }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Reservation integrity failure' },
        'warehouse-1',
        'cancel-integrity-key',
        {
          actor: {
            id: 'warehouse-1',
            role: 'WAREHOUSE',
            operationalLocationId: 'origin-1',
            permissions: ['cedis.dispatch'],
          },
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
      }),
    });

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycle.updateMany).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycleEvent.create).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('lists and retrieves transfers with API filters and movement details', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findMany.mockResolvedValue([createTransfer()]);
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        inventoryMovements: [
          {
            id: 'movement-out',
            productId: 'product-1',
            locationId: 'origin-1',
            userId: 'warehouse-1',
            type: InventoryMovementType.TRANSFER_OUT,
            quantityKg: decimal(12.5),
            quantityPieces: 3,
            previousQuantityKg: decimal(30),
            newQuantityKg: decimal(17.5),
            previousQuantityPieces: 10,
            newQuantityPieces: 7,
            reason: 'Inventory transfer TRF-20260629-000001 confirmed',
            referenceType: 'INVENTORY_TRANSFER',
            referenceId: 'transfer-1',
            transferId: 'transfer-1',
            saleId: null,
            purchaseId: null,
            routeSettlementId: null,
            pointOfSaleDailyCloseId: null,
            createdAt: now,
            product: { name: 'Pollo mixto' },
            location: { name: 'Matriz' },
          },
        ],
      }),
    );

    await expect(
      service.findAll({
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        status: InventoryTransferStatus.REQUESTED,
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-06-30T23:59:59.999Z',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'transfer-1',
          itemsCount: 1,
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
        }),
      ],
    });
    expect(prisma.inventoryTransfer.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        status: InventoryTransferStatus.REQUESTED,
        createdAt: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lte: new Date('2026-06-30T23:59:59.999Z'),
        },
      }),
      include: expect.any(Object),
      orderBy: { createdAt: 'desc' },
    });

    prisma.inventoryBalance.findMany.mockResolvedValueOnce([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);

    await expect(service.findOne('transfer-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'transfer-1',
        items: [
          expect.objectContaining({
            productName: 'Pollo mixto',
            balance: {
              locationId: 'origin-1',
              quantityKg: 30,
              quantityPieces: 10,
              reservedQuantityKg: 12.5,
              reservedQuantityPieces: 3,
              availableQuantityKg: 17.5,
              availableQuantityPieces: 7,
            },
          }),
        ],
        movements: [
          expect.objectContaining({ type: InventoryMovementType.TRANSFER_OUT }),
        ],
      }),
    );
  });

  it('returns the existing transfer for a repeated create idempotency key with the same payload', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          notes: 'Route load',
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG_AND_PIECE,
              quantityKg: 12.5,
              quantityPieces: 3,
            },
          ],
        },
        'warehouse-1',
        'same-create-key',
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'transfer-1' }));

    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
    expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
  });

  it('returns IDEMPOTENCY_CONFLICT when a create retry changes the payload', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          notes: 'Route load',
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG_AND_PIECE,
              quantityKg: 99,
              quantityPieces: 3,
            },
          ],
        },
        'warehouse-1',
        'same-create-key',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    });

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it('returns an already confirmed transfer for an idempotent confirm retry without duplicating movements', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        confirmedAt: now,
        inventoryMovements: [
          {
            id: 'movement-out',
            type: InventoryMovementType.TRANSFER_OUT,
            reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
          },
          { id: 'movement-in', type: InventoryMovementType.TRANSFER_IN },
        ],
      }),
    );

    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'same-confirm-key'),
    ).resolves.toEqual(
      expect.objectContaining({ status: InventoryTransferStatus.CONFIRMED }),
    );

    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('returns an already confirmed transfer only when the confirm idempotency key matches the persisted command marker', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        confirmedAt: now,
        inventoryMovements: [
          {
            id: 'movement-out',
            type: InventoryMovementType.TRANSFER_OUT,
            reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
          },
        ],
      }),
    );

    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'same-confirm-key'),
    ).resolves.toEqual(
      expect.objectContaining({ status: InventoryTransferStatus.CONFIRMED }),
    );

    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects a different confirm idempotency key after completion instead of silently returning success', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CONFIRMED,
        confirmedAt: now,
        inventoryMovements: [
          {
            id: 'movement-out',
            type: InventoryMovementType.TRANSFER_OUT,
            reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
          },
        ],
      }),
    );

    await expect(
      service.confirm('transfer-1', 'warehouse-1', 'different-confirm-key'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('returns an already cancelled transfer only when the cancel idempotency key and payload match the persisted marker', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: `Operational mistake ${idempotencyMarker('CANCEL', 'same-cancel-key', { transferId: 'transfer-1', userId: 'warehouse-1', reason: 'Operational mistake' })}`,
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Operational mistake' },
        'warehouse-1',
        'same-cancel-key',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: InventoryTransferStatus.CANCELLED,
        cancellationReason: 'Operational mistake',
      }),
    );

    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects a different cancel idempotency key after completion instead of silently returning success', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: `Operational mistake ${idempotencyMarker('CANCEL', 'same-cancel-key', { transferId: 'transfer-1', userId: 'warehouse-1', reason: 'Operational mistake' })}`,
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Operational mistake' },
        'warehouse-1',
        'different-cancel-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('returns IDEMPOTENCY_CONFLICT when a cancel retry changes the payload', async () => {
    const { service, prisma } = createService();
    const key = 'same-cancel-key';
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: `Operational mistake ${idempotencyMarker('CANCEL', key, { transferId: 'transfer-1', userId: 'warehouse-1', reason: 'Operational mistake' })}`,
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Different reason' },
        'warehouse-1',
        key,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    });

    expect(prisma.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycle.updateMany).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycleEvent.create).not.toHaveBeenCalled();
  });

  it('opens and version-bumps a linked cycle while recording the cancellation event atomically', async () => {
    const { service, prisma } = createService();
    const cycleLink = {
      id: 'cycle-transfer-1',
      branchSupplyCycleId: 'cycle-1',
      role: 'SUPPLY',
      branchSupplyCycle: {
        id: 'cycle-1',
        distributionCenterLocationId: 'origin-1',
        branchLocationId: 'destination-1',
        status: 'READY_FOR_REVIEW',
        version: 7,
        pointOfSaleDailyCloseId: 'close-1',
        pointOfSaleDailyClose: { id: 'close-1', status: 'DRAFT' },
      },
    };
    const key = 'linked-cancel-key';
    const reason = 'Cancel before dispatch';
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({ branchSupplyCycleTransfer: cycleLink }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'origin-1',
        quantityKg: decimal(30),
        quantityPieces: 10,
        reservedQuantityKg: decimal(12.5),
        reservedQuantityPieces: 3,
      },
    ]);
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryTransfer.update.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        branchSupplyCycleTransfer: cycleLink,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: `${reason} ${idempotencyMarker('CANCEL', key, { transferId: 'transfer-1', userId: 'warehouse-1', reason })}`,
      }),
    );
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.pointOfSaleDailyClose.update.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleEvent.create.mockResolvedValue({});

    await expect(
      service.cancel('transfer-1', { reason }, 'warehouse-1', key, {
        actor: {
          id: 'warehouse-1',
          role: 'WAREHOUSE',
          operationalLocationId: 'origin-1',
          permissions: ['cedis.dispatch'],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: InventoryTransferStatus.CANCELLED }),
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.branchSupplyCycle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'cycle-1',
          version: 7,
          status: { in: ['OPEN', 'READY_FOR_REVIEW'] },
        },
        data: expect.objectContaining({
          version: { increment: 1 },
          status: 'OPEN',
          reconciledDailyCloseVersion: null,
          reconciledAt: null,
        }),
      }),
    );
    expect(prisma.pointOfSaleDailyClose.update).toHaveBeenCalledWith({
      where: { id: 'close-1' },
      data: {
        version: { increment: 1 },
        lastValidatedAt: null,
        validatedSourceVersion: null,
      },
    });
    expect(prisma.inventoryTransfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-1' },
      data: expect.objectContaining({
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: 'warehouse-1',
        cancelledAt: expect.any(Date),
        cancellationReason: `${reason} ${idempotencyMarker('CANCEL', key, {
          transferId: 'transfer-1',
          userId: 'warehouse-1',
          reason,
        })}`,
      }),
      include: expect.any(Object),
    });
    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchSupplyCycleId: 'cycle-1',
        type: 'TRANSFER_STATE_CHANGED',
        cycleVersion: 8,
        fromStatus: 'READY_FOR_REVIEW',
        toStatus: 'OPEN',
        actorUserId: 'warehouse-1',
        reason,
        idempotencyKey: `inventory:CANCEL:transfer-1:${key}`,
        payload: expect.objectContaining({
          action: 'CANCEL',
          transferId: 'transfer-1',
          role: 'SUPPLY',
          cancellationReason: reason,
          idempotencyMarker: idempotencyMarker('CANCEL', key, {
            transferId: 'transfer-1',
            userId: 'warehouse-1',
            reason,
          }),
        }),
      }),
    });
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a repeated cancel without an idempotency key and does not mutate terminal cancellation fields', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(
      createTransfer({
        status: InventoryTransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'warehouse-1',
        cancellationReason: 'Operational mistake',
      }),
    );

    await expect(
      service.cancel(
        'transfer-1',
        { reason: 'Second cancellation reason' },
        'warehouse-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when a transfer does not exist', async () => {
    const { service, prisma } = createService();
    prisma.inventoryTransfer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-transfer')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
