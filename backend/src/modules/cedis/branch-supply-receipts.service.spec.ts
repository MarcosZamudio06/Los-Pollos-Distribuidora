import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, ProductUnit } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { BranchSupplyReceiptsService } from './branch-supply-receipts.service';

const businessDate = new Date('2026-08-05T00:00:00.000Z');
const location = (id: string, name: string) => ({
  id,
  name,
  code: id.toUpperCase(),
  type: id === 'cedis-1' ? 'DISTRIBUTION_CENTER' : 'BRANCH',
  parentId: null,
  address: null,
  latitude: null,
  longitude: null,
  isActive: true,
});

function createLink(receipt: unknown = null) {
  return {
    id: 'cycle-transfer-1',
    branchSupplyCycleId: 'cycle-1',
    inventoryTransferId: 'transfer-1',
    role: 'SUPPLY',
    linkedAt: businessDate,
    branchSupplyCycle: {
      id: 'cycle-1',
      distributionCenterLocationId: 'cedis-1',
      branchLocationId: 'branch-1',
      businessDate,
      status: 'OPEN',
      version: 2,
      distributionCenterLocation: location('cedis-1', 'CEDIS Centro'),
      branchLocation: location('branch-1', 'Sucursal Centro'),
    },
    inventoryTransfer: {
      id: 'transfer-1',
      transferNumber: 'TRF-001',
      originLocationId: 'cedis-1',
      destinationLocationId: 'branch-1',
      status: 'REQUESTED',
      notes: 'Despacho de la mañana',
      requestedAt: businessDate,
      confirmedAt: null,
      createdAt: businessDate,
      originLocation: location('cedis-1', 'CEDIS Centro'),
      destinationLocation: location('branch-1', 'Sucursal Centro'),
      items: [
        {
          id: 'transfer-item-1',
          productId: 'product-1',
          unit: ProductUnit.KG,
          quantityKg: new Prisma.Decimal('10.000'),
          quantityPieces: 0,
          product: { id: 'product-1', name: 'Pollo entero', sku: 'POL-1' },
        },
      ],
      branchSupplyReceipt: receipt,
    },
  };
}

function createPrisma() {
  const prisma = {
    $transaction: jest.fn(),
    branchSupplyCycleTransfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    branchSupplyReceipt: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    branchSupplyReceiptItem: {
      createMany: jest.fn(),
    },
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: Prisma.TransactionClient) => unknown) =>
      callback(prisma as never),
  );
  return prisma;
}

const seller = {
  id: 'seller-1',
  role: 'SELLER',
  operationalLocationId: 'branch-1',
  permissions: [PERMISSIONS.CEDIS_RECEIVE_SUPPLIES],
} as const;

describe('BranchSupplyReceiptsService', () => {
  it('rejects a difference without a note before creating inventory effects', async () => {
    const prisma = createPrisma();
    const receiveSupply = jest.fn();
    const inventoryTransfers = {
      receiveSupply,
    } as unknown as InventoryTransfersService;
    const service = new BranchSupplyReceiptsService(
      prisma as unknown as PrismaService,
      inventoryTransfers,
    );
    prisma.branchSupplyReceipt.findUnique.mockResolvedValue(null);
    prisma.branchSupplyCycleTransfer.findUnique.mockResolvedValue(createLink());

    await expect(
      service.receive(
        'transfer-1',
        {
          expectedCycleVersion: 2,
          items: [{ transferItemId: 'transfer-item-1', quantityKg: 8 }],
        },
        seller,
        'receipt-key-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.branchSupplyReceipt.create).not.toHaveBeenCalled();
    expect(receiveSupply).not.toHaveBeenCalled();
  });

  it('persists an exact receipt and delegates the atomic inventory operation', async () => {
    const prisma = createPrisma();
    const inventoryTransfers = {
      receiveSupply: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
    } as unknown as jest.Mocked<
      Pick<InventoryTransfersService, 'receiveSupply'>
    >;
    const service = new BranchSupplyReceiptsService(
      prisma as unknown as PrismaService,
      inventoryTransfers as unknown as InventoryTransfersService,
    );
    const link = createLink();
    const receivedBy = { id: seller.id, name: 'Vendedor' };
    const receipt = {
      id: 'receipt-1',
      receivedAt: businessDate,
      notes: null,
      receivedBy,
      items: [
        {
          transferItemId: 'transfer-item-1',
          productId: 'product-1',
          productNameSnapshot: 'Pollo entero',
          unit: ProductUnit.KG,
          sentKg: new Prisma.Decimal('10.000'),
          sentPieces: 0,
          receivedKg: new Prisma.Decimal('10.000'),
          receivedPieces: 0,
          differenceKg: new Prisma.Decimal('0.000'),
          differencePieces: 0,
        },
      ],
    };
    prisma.branchSupplyReceipt.findUnique.mockResolvedValue(null);
    prisma.branchSupplyCycleTransfer.findUnique
      .mockResolvedValueOnce(link)
      .mockResolvedValueOnce({
        ...link,
        inventoryTransfer: {
          ...link.inventoryTransfer,
          status: 'CONFIRMED',
          branchSupplyReceipt: receipt,
        },
      });
    prisma.branchSupplyReceipt.create.mockResolvedValue({ id: 'receipt-1' });

    const result = await service.receive(
      'transfer-1',
      {
        expectedCycleVersion: 2,
        items: [{ transferItemId: 'transfer-item-1', quantityKg: 10 }],
      },
      seller,
      'receipt-key-1',
    );

    expect(result.status).toBe('RECEIVED');
    expect(prisma.branchSupplyReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventoryTransferId: 'transfer-1',
          branchSupplyCycleId: 'cycle-1',
          receivedByUserId: seller.id,
        }),
      }),
    );
    expect(inventoryTransfers.receiveSupply).toHaveBeenCalledWith(
      'transfer-1',
      [
        {
          transferItemId: 'transfer-item-1',
          quantityKg: 10,
          quantityPieces: 0,
        },
      ],
      seller.id,
      'receipt-key-1',
      expect.objectContaining({ receiptId: expect.any(String) }),
    );
  });

  it('replays an idempotent receipt without delegating inventory or versioning again', async () => {
    const prisma = createPrisma();
    const inventoryTransfers = {
      receiveSupply: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
    } as unknown as jest.Mocked<
      Pick<InventoryTransfersService, 'receiveSupply'>
    >;
    const service = new BranchSupplyReceiptsService(
      prisma as unknown as PrismaService,
      inventoryTransfers as unknown as InventoryTransfersService,
    );
    const link = createLink();
    const receivedBy = { id: seller.id, name: 'Vendedor' };
    const receipt = {
      id: 'receipt-1',
      receivedAt: businessDate,
      notes: null,
      receivedBy,
      items: [
        {
          transferItemId: 'transfer-item-1',
          productId: 'product-1',
          productNameSnapshot: 'Pollo entero',
          unit: ProductUnit.KG,
          sentKg: new Prisma.Decimal('10.000'),
          sentPieces: 0,
          receivedKg: new Prisma.Decimal('10.000'),
          receivedPieces: 0,
          differenceKg: new Prisma.Decimal('0.000'),
          differencePieces: 0,
        },
      ],
    };
    const confirmedLink = {
      ...link,
      inventoryTransfer: {
        ...link.inventoryTransfer,
        status: 'CONFIRMED',
        branchSupplyReceipt: receipt,
      },
    };
    const body = {
      expectedCycleVersion: 2,
      items: [{ transferItemId: 'transfer-item-1', quantityKg: 10 }],
    };
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          transferId: 'transfer-1',
          dto: body,
          actorId: seller.id,
        }),
      )
      .digest('hex');
    prisma.branchSupplyReceipt.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: receipt.id,
        payloadHash,
        receivedBy,
        items: receipt.items,
      });
    prisma.branchSupplyCycleTransfer.findUnique
      .mockResolvedValueOnce(link)
      .mockResolvedValueOnce(confirmedLink)
      .mockResolvedValueOnce(confirmedLink);
    prisma.branchSupplyReceipt.create.mockResolvedValue({ id: receipt.id });

    await service.receive('transfer-1', body, seller, 'receipt-replay-key');
    await service.receive('transfer-1', body, seller, 'receipt-replay-key');

    expect(inventoryTransfers.receiveSupply).toHaveBeenCalledTimes(1);
    expect(prisma.branchSupplyReceipt.create).toHaveBeenCalledTimes(1);
    expect(prisma.branchSupplyReceiptItem.createMany).toHaveBeenCalledTimes(1);
  });

  it('blocks a seller from another branch', async () => {
    const prisma = createPrisma();
    const service = new BranchSupplyReceiptsService(
      prisma as unknown as PrismaService,
      {} as InventoryTransfersService,
    );
    prisma.branchSupplyCycleTransfer.findUnique.mockResolvedValue({
      ...createLink(),
      branchSupplyCycle: {
        ...createLink().branchSupplyCycle,
        branchLocationId: 'other-branch',
      },
    });

    await expect(service.findOne('transfer-1', seller)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
