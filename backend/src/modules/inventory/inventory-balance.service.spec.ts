import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryBalanceService } from './inventory-balance.service';

type MockTransaction = {
  inventoryBalance: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
};

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function createTransaction(): MockTransaction {
  return {
    inventoryBalance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe('InventoryBalanceService', () => {
  it('returns physical, reserved, and available quantities independently', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'cedis-1',
      quantityKg: decimal('12.500'),
      quantityPieces: 8,
      reservedQuantityKg: decimal('4.250'),
      reservedQuantityPieces: 3,
    });

    await expect(
      service.get(tx as never, 'product-1', 'cedis-1'),
    ).resolves.toEqual({
      productId: 'product-1',
      locationId: 'cedis-1',
      quantityKg: 12.5,
      quantityPieces: 8,
      reservedQuantityKg: 4.25,
      reservedQuantityPieces: 3,
      availableQuantityKg: 8.25,
      availableQuantityPieces: 5,
    });
  });

  it('reserves grouped pending quantities with a conditional update that protects availability', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(10),
        quantityPieces: 5,
        reservedQuantityKg: decimal(2),
        reservedQuantityPieces: 1,
      },
    ]);
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });

    await service.reserve(tx as never, 'cedis-1', [
      { productId: 'product-1', quantityKg: 3, quantityPieces: 1 },
      { productId: 'product-1', quantityKg: 2, quantityPieces: 1 },
    ]);

    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: { gte: 7 },
        quantityPieces: { gte: 3 },
        reservedQuantityKg: 2,
        reservedQuantityPieces: 1,
      },
      data: {
        reservedQuantityKg: { increment: 5 },
        reservedQuantityPieces: { increment: 2 },
      },
    });
  });

  it('rejects an insufficient reservation before writing any partial reservation', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(4),
        quantityPieces: 0,
        reservedQuantityKg: decimal(2),
        reservedQuantityPieces: 0,
      },
      {
        productId: 'product-2',
        locationId: 'cedis-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      },
    ]);

    await expect(
      service.reserve(tx as never, 'cedis-1', [
        { productId: 'product-1', quantityKg: 3, quantityPieces: 0 },
        { productId: 'product-2', quantityKg: 1, quantityPieces: 0 },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        findings: [
          expect.objectContaining({
            productId: 'product-1',
            availableKg: 2,
            shortageKg: 1,
          }),
        ],
      }),
    });

    expect(tx.inventoryBalance.updateMany).not.toHaveBeenCalled();
  });

  it('consumes a reservation only when physical stock and the exact reservation remain intact', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(10),
        quantityPieces: 4,
        reservedQuantityKg: decimal(3),
        reservedQuantityPieces: 2,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(7),
        quantityPieces: 2,
        reservedQuantityKg: decimal(0),
        reservedQuantityPieces: 0,
      });
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.consumeReservation(tx as never, 'product-1', 'cedis-1', {
        quantityKg: 3,
        quantityPieces: 2,
      }),
    ).resolves.toEqual({
      previousQuantityKg: 10,
      previousQuantityPieces: 4,
      newQuantityKg: 7,
      newQuantityPieces: 2,
    });

    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: { gte: 3 },
        quantityPieces: { gte: 2 },
        reservedQuantityKg: { gte: 3 },
        reservedQuantityPieces: { gte: 2 },
      },
      data: {
        quantityKg: { decrement: 3 },
        quantityPieces: { decrement: 2 },
        reservedQuantityKg: { decrement: 3 },
        reservedQuantityPieces: { decrement: 2 },
      },
    });
  });

  it('decreases KG and PIECE availability independently while preserving reservations and snapshots', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'route-stock-1',
        quantityKg: decimal(10),
        quantityPieces: 8,
        reservedQuantityKg: decimal(3),
        reservedQuantityPieces: 2,
      })
      .mockResolvedValueOnce({
        productId: 'product-1',
        locationId: 'route-stock-1',
        quantityKg: decimal(3),
        quantityPieces: 2,
        reservedQuantityKg: decimal(3),
        reservedQuantityPieces: 2,
      });
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.decreaseAvailable(tx as never, 'product-1', 'route-stock-1', {
        quantityKg: 7,
        quantityPieces: 6,
      }),
    ).resolves.toEqual({
      previousQuantityKg: 10,
      previousQuantityPieces: 8,
      newQuantityKg: 3,
      newQuantityPieces: 2,
    });

    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'route-stock-1',
        quantityKg: { gte: 10 },
        quantityPieces: { gte: 8 },
        reservedQuantityKg: 3,
        reservedQuantityPieces: 2,
      },
      data: {
        quantityKg: { decrement: 7 },
        quantityPieces: { decrement: 6 },
      },
    });
  });

  it('returns structured insufficient-stock findings for an unavailable decrement', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'cedis-1',
      quantityKg: decimal(10),
      quantityPieces: 4,
      reservedQuantityKg: decimal(3),
      reservedQuantityPieces: 1,
    });
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.decreaseAvailable(
        tx as never,
        'product-1',
        'cedis-1',
        { quantityKg: 8, quantityPieces: 4 },
        'Selected location does not have enough available inventory',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        findings: [
          expect.objectContaining({
            productId: 'product-1',
            onHandKg: 10,
            reservedKg: 3,
            availableKg: 7,
            shortageKg: 1,
            availablePieces: 3,
            shortagePieces: 1,
          }),
        ],
      }),
    });
  });

  it('returns a concurrency conflict when an available decrement loses its race', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'cedis-1',
      quantityKg: decimal(10),
      quantityPieces: 4,
      reservedQuantityKg: decimal(3),
      reservedQuantityPieces: 1,
    });
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.decreaseAvailable(tx as never, 'product-1', 'cedis-1', {
        quantityKg: 2,
        quantityPieces: 2,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_CONCURRENCY_CONFLICT',
      }),
    });
  });

  it('prevalidates every pending transfer reservation before decrementing any balance', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(4),
        reservedQuantityPieces: 0,
      },
      {
        productId: 'product-2',
        locationId: 'cedis-1',
        quantityKg: decimal(8),
        quantityPieces: 0,
        reservedQuantityKg: decimal(1),
        reservedQuantityPieces: 0,
      },
    ]);

    await expect(
      service.consumeReservations(tx as never, 'cedis-1', [
        {
          key: 'item-1',
          productId: 'product-1',
          quantityKg: 4,
          quantityPieces: 0,
        },
        {
          key: 'item-2',
          productId: 'product-2',
          quantityKg: 2,
          quantityPieces: 0,
        },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
        productId: 'product-2',
      }),
    });

    expect(tx.inventoryBalance.updateMany).not.toHaveBeenCalled();
  });

  it('releases the original pending quantity without changing physical stock', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.releaseReservation(tx as never, 'product-1', 'cedis-1', {
        quantityKg: 3,
        quantityPieces: 2,
      }),
    ).resolves.toBeUndefined();

    expect(tx.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        locationId: 'cedis-1',
        reservedQuantityKg: { gte: 3 },
        reservedQuantityPieces: { gte: 2 },
      },
      data: {
        reservedQuantityKg: { decrement: 3 },
        reservedQuantityPieces: { decrement: 2 },
      },
    });
  });

  it('prevalidates every reservation release before writing any partial release', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: decimal(10),
        quantityPieces: 0,
        reservedQuantityKg: decimal(3),
        reservedQuantityPieces: 0,
      },
    ]);

    await expect(
      service.releaseReservations(tx as never, 'cedis-1', [
        { productId: 'product-1', quantityKg: 3, quantityPieces: 0 },
        { productId: 'product-2', quantityKg: 1, quantityPieces: 0 },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
        productId: 'product-2',
      }),
    });

    expect(tx.inventoryBalance.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent consume when its reservation was released or changed', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique.mockResolvedValue({
      productId: 'product-1',
      locationId: 'cedis-1',
      quantityKg: decimal(10),
      quantityPieces: 0,
      reservedQuantityKg: decimal(2),
      reservedQuantityPieces: 0,
    });
    tx.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.consumeReservation(tx as never, 'product-1', 'cedis-1', {
        quantityKg: 2,
        quantityPieces: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports reservation integrity when the physical balance disappeared', async () => {
    const tx = createTransaction();
    const service = new InventoryBalanceService();
    tx.inventoryBalance.findUnique.mockResolvedValue(null);

    await expect(
      service.consumeReservation(tx as never, 'product-1', 'cedis-1', {
        quantityKg: 2,
        quantityPieces: 0,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
      }),
    });
    expect(tx.inventoryBalance.updateMany).not.toHaveBeenCalled();
  });
});
