import { ConflictException } from '@nestjs/common';
import {
  BranchSupplyCycleStatus,
  BranchSupplyTransferRole,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';

const businessDate = new Date('2026-08-04T00:00:00.000Z');

const admin = {
  id: 'admin-1',
  role: 'ADMIN',
  operationalLocationId: undefined,
  permissions: ['cedis.view', 'cedis.dispatch', 'cedis.receive_returns'],
};

const warehouse = {
  id: 'warehouse-1',
  role: 'WAREHOUSE',
  operationalLocationId: 'cedis-1',
  permissions: ['cedis.view', 'cedis.dispatch', 'cedis.receive_returns'],
};

function createCycle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cycle-1',
    distributionCenterLocationId: 'cedis-1',
    branchLocationId: 'branch-1',
    businessDate,
    status: BranchSupplyCycleStatus.OPEN,
    version: 1,
    notes: null,
    pointOfSaleDailyCloseId: null,
    distributionCenterLocation: {
      id: 'cedis-1',
      name: 'CEDIS Centro',
      type: 'DISTRIBUTION_CENTER',
      parentId: null,
      isActive: true,
    },
    branchLocation: {
      id: 'branch-1',
      name: 'Sucursal Centro',
      type: 'BRANCH',
      parentId: 'cedis-1',
      isActive: true,
    },
    transfers: [],
    items: [],
    events: [],
    ...overrides,
  };
}

function createPrisma() {
  const prisma = {
    $transaction: jest.fn(),
    operationalLocation: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'cedis-1'
            ? {
                id: 'cedis-1',
                type: 'DISTRIBUTION_CENTER',
                parentId: null,
                isActive: true,
              }
            : {
                id: where.id,
                type: 'BRANCH',
                parentId: 'cedis-1',
                isActive: true,
              },
        ),
      ),
    },
    branchSupplyCycle: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    branchSupplyCycleEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    branchSupplyCycleTransfer: { create: jest.fn() },
    branchSupplyCycleItem: { createMany: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn(), update: jest.fn() },
    product: { findUnique: jest.fn() },
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: Prisma.TransactionClient) => unknown) =>
      callback(prisma as unknown as Prisma.TransactionClient),
  );
  return prisma;
}

function createService() {
  const prisma = createPrisma();
  const inventoryTransfers = {
    create: jest.fn(),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<InventoryTransfersService, 'create' | 'findOne'>
  >;
  const service = new BranchSupplyCyclesService(
    prisma as unknown as PrismaService,
    inventoryTransfers as unknown as InventoryTransfersService,
  );
  return { prisma, inventoryTransfers, service };
}

describe('BranchSupplyCyclesService', () => {
  it('opens one cycle and records an auditable event', async () => {
    const { prisma, service } = createService();
    const cycle = createCycle();
    prisma.branchSupplyCycleEvent.findUnique.mockResolvedValue(null);
    prisma.branchSupplyCycle.findFirst.mockResolvedValue(null);
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({
        id: 'cedis-1',
        type: 'DISTRIBUTION_CENTER',
        parentId: null,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'branch-1',
        type: 'BRANCH',
        parentId: 'cedis-1',
        isActive: true,
      });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
    prisma.branchSupplyCycle.create.mockResolvedValue(cycle);

    await expect(
      service.open(
        {
          distributionCenterLocationId: 'cedis-1',
          branchLocationId: 'branch-1',
          businessDate: '2026-08-04',
        },
        admin,
        'open-key',
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'cycle-1', version: 1 }));

    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchSupplyCycleId: 'cycle-1',
          type: 'OPENED',
          cycleVersion: 1,
          idempotencyKey: expect.stringContaining('open-key'),
        }),
      }),
    );
  });

  it('rejects a branch that does not belong directly to the requested CEDIS', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycleEvent.findUnique.mockResolvedValue(null);
    prisma.branchSupplyCycle.findFirst.mockResolvedValue(null);
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({
        id: 'cedis-1',
        type: 'DISTRIBUTION_CENTER',
        parentId: null,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'branch-1',
        type: 'BRANCH',
        parentId: 'other-cedis',
        isActive: true,
      });

    await expect(
      service.open(
        {
          distributionCenterLocationId: 'cedis-1',
          branchLocationId: 'branch-1',
          businessDate: '2026-08-04',
        },
        admin,
        'invalid-branch-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.branchSupplyCycle.create).not.toHaveBeenCalled();
  });

  it('creates a requested supply transfer in the same transaction without confirming it', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    const cycle = createCycle();
    const transfer = {
      id: 'transfer-1',
      status: InventoryTransferStatus.REQUESTED,
      originLocationId: 'cedis-1',
      destinationLocationId: 'branch-1',
    };
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(cycle);
    inventoryTransfers.create.mockResolvedValue(transfer);
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleTransfer.create.mockResolvedValue({
      id: 'link-1',
      branchSupplyCycleId: 'cycle-1',
      inventoryTransferId: 'transfer-1',
      role: BranchSupplyTransferRole.SUPPLY,
    });

    const result = await service.createSupply(
      'cycle-1',
      {
        expectedVersion: 1,
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.KG,
            quantityKg: 12.5,
          },
        ],
      },
      warehouse,
      'supply-key',
    );

    expect(result.transfer).toEqual(transfer);
    expect(inventoryTransfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originLocationId: 'cedis-1',
        destinationLocationId: 'branch-1',
      }),
      'warehouse-1',
      expect.stringContaining('supply-key'),
      expect.objectContaining({ tx: expect.anything() }),
    );
    expect(inventoryTransfers).not.toHaveProperty('confirm');
    expect(prisma.branchSupplyCycleTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: BranchSupplyTransferRole.SUPPLY,
          inventoryTransferId: 'transfer-1',
        }),
      }),
    );
  });

  it.each([BranchSupplyCycleStatus.CLOSED, BranchSupplyCycleStatus.CANCELLED])(
    'rejects supply creation for a %s cycle before creating a transfer',
    async (status) => {
      const { prisma, inventoryTransfers, service } = createService();
      prisma.branchSupplyCycle.findUnique.mockResolvedValue(
        createCycle({ status }),
      );

      await expect(
        service.createSupply(
          'cycle-1',
          {
            expectedVersion: 1,
            items: [
              {
                productId: 'product-1',
                unit: ProductUnit.PIECE,
                quantityPieces: 2,
              },
            ],
          },
          warehouse,
          'closed-key',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(inventoryTransfers.create).not.toHaveBeenCalled();
      expect(prisma.branchSupplyCycleTransfer.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a concurrent writer when the expected cycle version is stale', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(createCycle());
    inventoryTransfers.create.mockResolvedValue({
      id: 'transfer-1',
      status: InventoryTransferStatus.REQUESTED,
    });
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.createReturn(
        'cycle-1',
        {
          expectedVersion: 1,
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.PIECE,
              quantityPieces: 1,
            },
          ],
        },
        warehouse,
        'stale-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.branchSupplyCycleTransfer.create).not.toHaveBeenCalled();
  });

  it('creates a return transfer from the branch back to the CEDIS', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(createCycle());
    inventoryTransfers.create.mockResolvedValue({
      id: 'transfer-return-1',
      status: InventoryTransferStatus.REQUESTED,
      originLocationId: 'branch-1',
      destinationLocationId: 'cedis-1',
    });
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });

    await service.createReturn(
      'cycle-1',
      {
        expectedVersion: 1,
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.PIECE,
            quantityPieces: 2,
          },
        ],
      },
      warehouse,
      'return-direction-key',
    );

    expect(inventoryTransfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originLocationId: 'branch-1',
        destinationLocationId: 'cedis-1',
      }),
      'warehouse-1',
      expect.stringContaining('return-direction-key'),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('excludes pending and cancelled transfers from refresh totals', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    const product = {
      id: 'product-1',
      name: 'Pollo mixto',
      sku: 'POLLO-1',
      unit: ProductUnit.KG,
      salePrice: 100,
      purchaseCost: 70,
      isActive: true,
    };
    const confirmedTransfer = {
      id: 'confirmed-1',
      transferNumber: 'TRF-CONFIRMED',
      originLocationId: 'cedis-1',
      destinationLocationId: 'branch-1',
      userId: 'warehouse-1',
      status: InventoryTransferStatus.CONFIRMED,
      notes: null,
      requestedAt: businessDate,
      confirmedAt: businessDate,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      createdAt: businessDate,
      updatedAt: businessDate,
      originLocation: { id: 'cedis-1', name: 'CEDIS Centro' },
      destinationLocation: { id: 'branch-1', name: 'Sucursal Centro' },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantityKg: 10,
          quantityPieces: null,
          unit: ProductUnit.KG,
          unitEquivalentId: null,
          appliedEquivalentFactor: null,
          roundingMode: null,
          product,
          unitEquivalent: null,
        },
      ],
      inventoryMovements: [
        {
          id: 'movement-out',
          productId: 'product-1',
          locationId: 'cedis-1',
          userId: 'warehouse-1',
          type: 'TRANSFER_OUT',
          quantityKg: 10,
          quantityPieces: null,
          previousQuantityKg: 20,
          newQuantityKg: 10,
          previousQuantityPieces: 0,
          newQuantityPieces: 0,
          reason: 'confirmed',
          referenceType: 'INVENTORY_TRANSFER',
          referenceId: 'confirmed-1',
          transferId: 'confirmed-1',
          saleId: null,
          purchaseId: null,
          routeSettlementId: null,
          pointOfSaleDailyCloseId: null,
          createdAt: businessDate,
          product,
          location: { id: 'cedis-1', name: 'CEDIS Centro' },
        },
        {
          id: 'movement-in',
          productId: 'product-1',
          locationId: 'branch-1',
          userId: 'warehouse-1',
          type: 'TRANSFER_IN',
          quantityKg: 10,
          quantityPieces: null,
          previousQuantityKg: 0,
          newQuantityKg: 10,
          previousQuantityPieces: 0,
          newQuantityPieces: 0,
          reason: 'confirmed',
          referenceType: 'INVENTORY_TRANSFER',
          referenceId: 'confirmed-1',
          transferId: 'confirmed-1',
          saleId: null,
          purchaseId: null,
          routeSettlementId: null,
          pointOfSaleDailyCloseId: null,
          createdAt: businessDate,
          product,
          location: { id: 'branch-1', name: 'Sucursal Centro' },
        },
        {
          id: 'movement-unexpected-product',
          productId: 'unexpected-product',
          locationId: 'cedis-1',
          userId: 'warehouse-1',
          type: 'TRANSFER_OUT',
          quantityKg: 1,
          quantityPieces: null,
          previousQuantityKg: 5,
          newQuantityKg: 4,
          previousQuantityPieces: 0,
          newQuantityPieces: 0,
          reason: 'unexpected movement',
          referenceType: 'INVENTORY_TRANSFER',
          referenceId: 'confirmed-1',
          transferId: 'confirmed-1',
          saleId: null,
          purchaseId: null,
          routeSettlementId: null,
          pointOfSaleDailyCloseId: null,
          createdAt: businessDate,
          product: { ...product, id: 'unexpected-product' },
          location: { id: 'cedis-1', name: 'CEDIS Centro' },
        },
      ],
    };
    const cycle = createCycle({
      transfers: [
        {
          id: 'link-confirmed',
          role: BranchSupplyTransferRole.SUPPLY,
          linkedAt: businessDate,
          inventoryTransfer: confirmedTransfer,
        },
        {
          id: 'link-pending',
          role: BranchSupplyTransferRole.SUPPLY,
          linkedAt: businessDate,
          inventoryTransfer: {
            ...confirmedTransfer,
            id: 'pending-1',
            status: InventoryTransferStatus.REQUESTED,
            inventoryMovements: [],
          },
        },
        {
          id: 'link-cancelled',
          role: BranchSupplyTransferRole.RETURN,
          linkedAt: businessDate,
          inventoryTransfer: {
            ...confirmedTransfer,
            id: 'cancelled-1',
            status: InventoryTransferStatus.CANCELLED,
            inventoryMovements: [],
          },
        },
      ],
    });
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(cycle);
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleItem.createMany.mockResolvedValue({ count: 1 });

    const result = await service.refresh(
      'cycle-1',
      { expectedVersion: 1 },
      admin,
      'refresh-status-key',
    );

    expect(result.status).toBe(BranchSupplyCycleStatus.OPEN);
    expect(result.totals.suppliedKg).toBe(10);
    expect(result.totals.returnedKg).toBe(0);
    expect(inventoryTransfers.create).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalDeliveredKg: 10,
          totalReturnedKg: 0,
          status: BranchSupplyCycleStatus.OPEN,
        }),
      }),
    );
    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ integrityErrorCount: 1 }),
        }),
      }),
    );
  });

  it('returns the existing cycle for an idempotent open retry without creating another cycle', async () => {
    const { prisma, service } = createService();
    const cycle = createCycle();
    prisma.branchSupplyCycleEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => ({
        branchSupplyCycleId: 'cycle-1',
        payload: {
          payloadHash: (
            prisma.branchSupplyCycleEvent.create.mock.calls[0][0].data as {
              payload: { payloadHash: string };
            }
          ).payload.payloadHash,
        },
      }));
    prisma.branchSupplyCycle.findFirst.mockResolvedValue(null);
    prisma.operationalLocation.findUnique
      .mockResolvedValueOnce({
        id: 'cedis-1',
        type: 'DISTRIBUTION_CENTER',
        parentId: null,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'branch-1',
        type: 'BRANCH',
        parentId: 'cedis-1',
        isActive: true,
      });
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue(null);
    prisma.branchSupplyCycle.create.mockResolvedValue(cycle);
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(cycle);

    await service.open(
      {
        distributionCenterLocationId: 'cedis-1',
        branchLocationId: 'branch-1',
        businessDate: '2026-08-04',
      },
      admin,
      'repeat-key',
    );
    await expect(
      service.open(
        {
          distributionCenterLocationId: 'cedis-1',
          branchLocationId: 'branch-1',
          businessDate: '2026-08-04',
        },
        admin,
        'repeat-key',
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'cycle-1' }));

    expect(prisma.branchSupplyCycle.create).toHaveBeenCalledTimes(1);
  });
});
