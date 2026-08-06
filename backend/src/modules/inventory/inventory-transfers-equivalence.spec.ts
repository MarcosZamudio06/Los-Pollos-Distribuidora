import { BadRequestException } from '@nestjs/common';
import { Prisma, ProductUnit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from './inventory-transfers.service';

function createPrisma() {
  const prisma = {
    $transaction: jest.fn(),
    operationalLocation: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    productUnitEquivalent: { findUnique: jest.fn() },
    inventoryTransfer: { findUnique: jest.fn(), create: jest.fn() },
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: Prisma.TransactionClient) => unknown) =>
      callback(prisma as unknown as Prisma.TransactionClient),
  );
  return prisma;
}

describe('InventoryTransfersService equivalences', () => {
  it('persists the active equivalence used by a transfer item', async () => {
    const prisma = createPrisma();
    const service = new InventoryTransfersService(
      prisma as unknown as PrismaService,
    );
    prisma.operationalLocation.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, isActive: true }),
    );
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG_AND_PIECE,
      isActive: true,
    });
    prisma.productUnitEquivalent.findUnique.mockResolvedValue({
      id: 'equivalence-1',
      productId: 'product-1',
      unitFrom: ProductUnit.PIECE,
      unitTo: ProductUnit.KG,
      factor: new Prisma.Decimal('1.8'),
      roundingMode: 'HALF_UP',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      status: 'ACTIVE',
    });
    prisma.inventoryTransfer.create.mockResolvedValue({
      id: 'transfer-1',
      transferNumber: 'TRF-1',
      originLocationId: 'origin-1',
      destinationLocationId: 'destination-1',
      userId: 'warehouse-1',
      status: 'REQUESTED',
      notes: null,
      requestedAt: new Date(),
      confirmedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
      inventoryMovements: [],
    });

    await service.create(
      {
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.KG_AND_PIECE,
            quantityKg: 18,
            quantityPieces: 10,
            unitEquivalentId: 'equivalence-1',
          },
        ],
      },
      'warehouse-1',
      'equivalence-key',
      { equivalenceDate: new Date('2026-08-04T00:00:00.000Z') },
    );

    expect(prisma.inventoryTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                unitEquivalentId: 'equivalence-1',
                appliedEquivalentFactor: new Prisma.Decimal('1.8'),
                roundingMode: 'HALF_UP',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects an inactive equivalence before creating a transfer', async () => {
    const prisma = createPrisma();
    const service = new InventoryTransfersService(
      prisma as unknown as PrismaService,
    );
    prisma.operationalLocation.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, isActive: true }),
    );
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo mixto',
      unit: ProductUnit.KG_AND_PIECE,
      isActive: true,
    });
    prisma.productUnitEquivalent.findUnique.mockResolvedValue({
      id: 'equivalence-1',
      productId: 'product-1',
      unitFrom: ProductUnit.PIECE,
      unitTo: ProductUnit.KG,
      factor: new Prisma.Decimal('1.8'),
      roundingMode: 'HALF_UP',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      status: 'INACTIVE',
    });

    await expect(
      service.create(
        {
          originLocationId: 'origin-1',
          destinationLocationId: 'destination-1',
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG_AND_PIECE,
              quantityKg: 18,
              quantityPieces: 10,
              unitEquivalentId: 'equivalence-1',
            },
          ],
        },
        'warehouse-1',
        'inactive-equivalence-key',
        { equivalenceDate: new Date('2026-08-04T00:00:00.000Z') },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
  });
});
