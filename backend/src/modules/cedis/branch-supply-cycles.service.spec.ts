import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  BranchSupplyCycleStatus,
  BranchSupplyTransferRole,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { ReconciliationResult } from './branch-supply-cycle-reconciliation.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import type { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import type { DeliveryService } from '../delivery/delivery.service';

const businessDate = new Date('2026-08-04T00:00:00.000Z');

const admin = {
  id: 'admin-1',
  role: 'ADMIN',
  operationalLocationId: undefined,
  permissions: [
    'cedis.view',
    'cedis.dispatch',
    'cedis.receive_returns',
    'cedis.request_returns',
  ],
};

const warehouse = {
  id: 'warehouse-1',
  role: 'WAREHOUSE',
  operationalLocationId: 'cedis-1',
  permissions: [
    'cedis.view',
    'cedis.dispatch',
    'cedis.receive_returns',
    'cedis.request_returns',
  ],
};

const seller = {
  id: 'seller-1',
  role: 'SELLER',
  operationalLocationId: 'branch-1',
  permissions: ['cedis.view', 'cedis.request_returns'],
};

const logisticsAssignment = {
  assignedDriverId: 'driver-1',
  vehicleId: 'vehicle-1',
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
    branchSupplyCycleProductSnapshot: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    branchSupplyCycleSnapshot: { create: jest.fn() },
    pointOfSaleDailyClose: { findFirst: jest.fn(), update: jest.fn() },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findUnique: jest.fn() },
    productUnitEquivalent: { findUnique: jest.fn() },
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
  const cycleReconciliation = new BranchSupplyCycleReconciliationService();
  const dailyCloseService = {
    closeWithinTransaction: jest.fn(),
    reopenWithinTransaction: jest.fn(),
  };
  const deliveryService = {
    createLogisticsRoute: jest.fn().mockResolvedValue({ id: 'route-1' }),
  };

  const service = new BranchSupplyCyclesService(
    prisma as unknown as PrismaService,
    inventoryTransfers as unknown as InventoryTransfersService,
    cycleReconciliation,
    dailyCloseService as unknown as PointOfSaleDailyCloseService,
    deliveryService as unknown as DeliveryService,
  );
  return { prisma, inventoryTransfers, dailyCloseService, deliveryService, service };
}

describe('BranchSupplyCyclesService', () => {
  const originalAppTimezone = process.env.APP_TIMEZONE;

  afterEach(() => {
    if (originalAppTimezone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = originalAppTimezone;
  });

  it('uses the DST-aware operational day for cycle shrinkage reconciliation', () => {
    process.env.APP_TIMEZONE = 'America/New_York';
    const { service } = createService();
    const privateService = service as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;

    expect(
      privateService.operationalDay(new Date('2026-03-08T00:00:00.000Z')),
    ).toEqual({
      from: new Date('2026-03-08T05:00:00.000Z'),
      to: new Date('2026-03-09T04:00:00.000Z'),
    });
  });

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

  it('cancels an empty mutable cycle with a versioned audit event', async () => {
    const { prisma, service } = createService();
    const cycle = createCycle();
    const cancelled = createCycle({
      status: BranchSupplyCycleStatus.CANCELLED,
      version: 2,
    });
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(cycle)
      .mockResolvedValueOnce(cancelled);
    prisma.branchSupplyCycleEvent.findUnique.mockResolvedValue(null);
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.cancel(
        'cycle-1',
        { expectedVersion: 1, reason: 'Operación cancelada' },
        admin,
        'cancel-key',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ status: BranchSupplyCycleStatus.CANCELLED }),
    );

    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CANCELLED',
          cycleVersion: 2,
          idempotencyKey: expect.stringContaining('cancel-key'),
        }),
      }),
    );
  });

  it('rejects cancellation while a linked transfer is still active', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      createCycle({
        transfers: [
          {
            inventoryTransfer: { status: InventoryTransferStatus.CONFIRMED },
          },
        ],
      }),
    );
    prisma.branchSupplyCycleEvent.findUnique.mockResolvedValue(null);

    await expect(
      service.cancel(
        'cycle-1',
        { expectedVersion: 1, reason: 'Operación cancelada' },
        admin,
        'cancel-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.branchSupplyCycle.updateMany).not.toHaveBeenCalled();
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
    const { prisma, inventoryTransfers, deliveryService, service } = createService();
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
        ...logisticsAssignment,
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
    expect(deliveryService.createLogisticsRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inventoryTransferId: 'transfer-1',
        type: 'CEDIS_SUPPLY',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
      }),
    );
    expect(prisma.branchSupplyCycleTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: BranchSupplyTransferRole.SUPPLY,
          inventoryTransferId: 'transfer-1',
        }),
      }),
    );
  });

  it('rejects supply creation without the dispatch permission before changing the cycle', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(createCycle());

    await expect(
      service.createSupply(
        'cycle-1',
        {
          expectedVersion: 1,
          ...logisticsAssignment,
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG,
              quantityKg: 2,
            },
          ],
        },
        { ...warehouse, permissions: ['cedis.view'] },
        'missing-dispatch-key',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.branchSupplyCycle.updateMany).not.toHaveBeenCalled();
    expect(inventoryTransfers.create).not.toHaveBeenCalled();
  });

  it('does not advance the cycle version when transfer validation rejects insufficient stock', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(createCycle());
    inventoryTransfers.create.mockRejectedValue(
      new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        findings: [{ productId: 'product-1', shortageKg: 2 }],
      }),
    );

    await expect(
      service.createSupply(
        'cycle-1',
        {
          expectedVersion: 1,
          ...logisticsAssignment,
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.KG,
              quantityKg: 2,
            },
          ],
        },
        warehouse,
        'insufficient-before-version-key',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    });

    expect(prisma.branchSupplyCycle.updateMany).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycleTransfer.create).not.toHaveBeenCalled();
    expect(prisma.branchSupplyCycleEvent.create).not.toHaveBeenCalled();
  });

  it('creates the price and cost snapshot only on the first supply', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    const cycle = createCycle();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(cycle);
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    prisma.branchSupplyCycleProductSnapshot.findUnique.mockResolvedValue(null);
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      name: 'Pollo snapshot',
      sku: 'SNAPSHOT-1',
      unit: ProductUnit.PIECE,
      salePrice: 100,
      purchaseCost: 60,
    });
    inventoryTransfers.create.mockResolvedValue({
      id: 'transfer-snapshot-1',
      status: InventoryTransferStatus.REQUESTED,
      originLocationId: 'cedis-1',
      destinationLocationId: 'branch-1',
      items: [
        {
          productId: 'product-1',
          unitEquivalentId: null,
          appliedEquivalentFactor: null,
          roundingMode: null,
        },
      ],
    });

    await service.createSupply(
      'cycle-1',
      {
        expectedVersion: 1,
        ...logisticsAssignment,
        items: [
          {
            productId: 'product-1',
            unit: ProductUnit.PIECE,
            quantityPieces: 10,
          },
        ],
      },
      warehouse,
      'snapshot-key',
    );

    expect(prisma.branchSupplyCycleProductSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchSupplyCycleId: 'cycle-1',
          productId: 'product-1',
          sourceTransferId: 'transfer-snapshot-1',
          unitPriceSnapshot: 100,
          unitCostSnapshot: 60,
        }),
      }),
    );
  });

  it('persists an immutable snapshot and CLOSED event when the cycle closes', async () => {
    const { prisma, service } = createService();
    const cycle = createCycle({
      status: BranchSupplyCycleStatus.READY_FOR_REVIEW,
      version: 2,
      reconciledDailyCloseVersion: 4,
    });
    const closedCycle = createCycle({
      status: BranchSupplyCycleStatus.CLOSED,
      version: 3,
      reconciledDailyCloseVersion: 4,
    });
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(cycle)
      .mockResolvedValueOnce(closedCycle);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      version: 4,
      status: 'CLOSED',
      grossSalesTotal: 0,
      netCashExpected: 0,
      cashCountedTotal: 0,
      cashDifferenceTotal: 0,
      payments: [],
      cashMovements: [],
      cashShifts: [],
      differences: [],
    });
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    const result = {
      items: [],
      totals: {
        deliveredKg: 0,
        deliveredPieces: 0,
        returnedKg: 0,
        returnedPieces: 0,
        expectedSoldKg: 0,
        expectedSoldPieces: 0,
        actualSoldKg: 0,
        actualSoldPieces: 0,
        shrinkageKg: 0,
        shrinkagePieces: 0,
        differenceKg: 0,
        differencePieces: 0,
        expectedSalesTotal: '0.00',
        expectedCostTotal: '0.00',
        expectedProfitTotal: '0.00',
        actualSalesTotal: '0.00',
        actualCostTotal: '0.00',
        actualProfitTotal: '0.00',
        actualNetProfitTotal: '0.00',
        expectedCashTotal: '0.00',
        cashCountedTotal: '0.00',
        cashDifferenceTotal: '0.00',
        cardVoucherTotal: '0.00',
        transferTotal: '0.00',
        expenseTotal: '0.00',
        cashInTotal: '0.00',
        cashOutTotal: '0.00',
        cashAdjustmentTotal: '0.00',
      },
      confirmedSupplyCount: 1,
      confirmedReturnCount: 0,
      pendingTransferCount: 0,
      cancelledTransferCount: 0,
      blockers: [],
      readyForReview: true,
      canClose: true,
      cashMovements: [],
      differences: [],
    } as ReconciliationResult;
    (
      service as unknown as {
        cycleReconciliation: { calculate: jest.Mock };
      }
    ).cycleReconciliation.calculate = jest.fn().mockReturnValue(result);

    await service.close('cycle-1', { expectedVersion: 2 }, admin, 'close-key');

    expect(prisma.branchSupplyCycleSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchSupplyCycleId: 'cycle-1',
          sourceVersion: 3,
          snapshotType: 'CLOSED',
          payloadHash: expect.any(String),
        }),
      }),
    );
    expect(prisma.branchSupplyCycleEvent.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CLOSED',
          cycleVersion: 3,
          idempotencyKey: expect.stringContaining('close-key'),
        }),
      }),
    );
  });

  it('closes a reviewed daily close and the CEDIS cycle in the same transaction', async () => {
    const { prisma, service } = createService();
    const dailyCloseService = {
      closeWithinTransaction: jest.fn().mockResolvedValue({
        id: 'close-1',
        version: 5,
        status: 'CLOSED',
      }),
    };
    (
      service as unknown as { dailyCloseService: typeof dailyCloseService }
    ).dailyCloseService = dailyCloseService;
    const cycle = createCycle({
      status: BranchSupplyCycleStatus.READY_FOR_REVIEW,
      version: 2,
      reconciledDailyCloseVersion: 4,
    });
    const closedCycle = createCycle({
      status: BranchSupplyCycleStatus.CLOSED,
      version: 3,
      reconciledDailyCloseVersion: 5,
    });
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(cycle)
      .mockResolvedValueOnce(closedCycle);
    prisma.pointOfSaleDailyClose.findFirst.mockResolvedValue({
      id: 'close-1',
      version: 4,
      status: 'REVIEWED',
      grossSalesTotal: 0,
      netCashExpected: 0,
      cashCountedTotal: 0,
      cashDifferenceTotal: 0,
      payments: [],
      cashMovements: [],
      cashShifts: [],
      differences: [],
    });
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });
    const result = {
      items: [],
      totals: {
        deliveredKg: 0,
        deliveredPieces: 0,
        returnedKg: 0,
        returnedPieces: 0,
        expectedSoldKg: 0,
        expectedSoldPieces: 0,
        actualSoldKg: 0,
        actualSoldPieces: 0,
        shrinkageKg: 0,
        shrinkagePieces: 0,
        differenceKg: 0,
        differencePieces: 0,
        expectedSalesTotal: '0.00',
        expectedCostTotal: '0.00',
        expectedProfitTotal: '0.00',
        actualSalesTotal: '0.00',
        actualCostTotal: '0.00',
        actualProfitTotal: '0.00',
        actualNetProfitTotal: '0.00',
        expectedCashTotal: '0.00',
        cashCountedTotal: '0.00',
        cashDifferenceTotal: '0.00',
        cardVoucherTotal: '0.00',
        transferTotal: '0.00',
        expenseTotal: '0.00',
        cashInTotal: '0.00',
        cashOutTotal: '0.00',
        cashAdjustmentTotal: '0.00',
      },
      confirmedSupplyCount: 1,
      confirmedReturnCount: 0,
      pendingTransferCount: 0,
      cancelledTransferCount: 0,
      blockers: [],
      readyForReview: true,
      canClose: true,
      cashMovements: [],
      differences: [],
    } as ReconciliationResult;
    (
      service as unknown as {
        cycleReconciliation: { calculate: jest.Mock };
      }
    ).cycleReconciliation.calculate = jest.fn().mockReturnValue(result);

    await service.close('cycle-1', { expectedVersion: 2 }, admin, 'close-key');

    expect(dailyCloseService.closeWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'close-1',
      4,
      admin,
    );
    expect(prisma.branchSupplyCycle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BranchSupplyCycleStatus.CLOSED,
          reconciledDailyCloseVersion: 5,
        }),
      }),
    );
  });

  it('reopens the related daily close and CEDIS cycle together without reversing operations', async () => {
    const { prisma, service } = createService();
    const dailyCloseService = {
      reopenWithinTransaction: jest.fn().mockResolvedValue({
        id: 'close-1',
        version: 6,
        status: 'DRAFT',
      }),
    };
    (
      service as unknown as { dailyCloseService: typeof dailyCloseService }
    ).dailyCloseService = dailyCloseService;
    const cycle = createCycle({
      status: BranchSupplyCycleStatus.CLOSED,
      version: 5,
      pointOfSaleDailyCloseId: 'close-1',
      pointOfSaleDailyClose: { id: 'close-1', status: 'CLOSED', version: 5 },
    });
    const reopenedCycle = createCycle({
      status: BranchSupplyCycleStatus.OPEN,
      version: 6,
      pointOfSaleDailyCloseId: 'close-1',
    });
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(cycle)
      .mockResolvedValueOnce(reopenedCycle);
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });

    await service.reopen(
      'cycle-1',
      { expectedVersion: 5, reason: 'Corrección auditada' },
      admin,
      'reopen-key',
    );

    expect(dailyCloseService.reopenWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'close-1',
      5,
      admin,
      'Corrección auditada',
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
            ...logisticsAssignment,
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
          ...logisticsAssignment,
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

  it('allows a seller assigned to the cycle branch to request a return', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    const sellerCycle = createCycle({
      transfers: [
        {
          role: BranchSupplyTransferRole.SUPPLY,
          inventoryTransfer: {
            status: InventoryTransferStatus.CONFIRMED,
            items: [
              { productId: 'product-1', quantityKg: 0, quantityPieces: 1 },
            ],
          },
        },
      ],
    });
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(sellerCycle)
      .mockResolvedValue(createCycle());
    inventoryTransfers.create.mockResolvedValue({
      id: 'transfer-return-seller',
      status: InventoryTransferStatus.REQUESTED,
    });
    prisma.branchSupplyCycle.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.createReturn(
        'cycle-1',
        {
          expectedVersion: 1,
          ...logisticsAssignment,
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.PIECE,
              quantityPieces: 1,
            },
          ],
        },
        seller,
        'seller-return-key',
      ),
    ).resolves.toEqual(expect.objectContaining({ created: true }));

    expect(inventoryTransfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originLocationId: 'branch-1',
        destinationLocationId: 'cedis-1',
      }),
      seller.id,
      expect.stringContaining('seller-return-key'),
      expect.objectContaining({ actor: seller }),
    );
  });

  it('creates a return transfer from the branch back to the CEDIS', async () => {
    const { prisma, inventoryTransfers, deliveryService, service } = createService();
    prisma.branchSupplyCycle.findUnique
      .mockResolvedValueOnce(
        createCycle({
          transfers: [
            {
              role: BranchSupplyTransferRole.SUPPLY,
              inventoryTransfer: {
                status: InventoryTransferStatus.CONFIRMED,
                items: [
                  {
                    productId: 'product-1',
                    quantityKg: 0,
                    quantityPieces: 2,
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValue(createCycle());
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
        ...logisticsAssignment,
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
    expect(deliveryService.createLogisticsRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inventoryTransferId: 'transfer-return-1',
        type: 'BRANCH_RETURN',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
      }),
    );
  });

  it('rejects a return above the cycle quantity that remains unsold', async () => {
    const { prisma, inventoryTransfers, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      createCycle({
        transfers: [
          {
            role: BranchSupplyTransferRole.SUPPLY,
            inventoryTransfer: {
              status: InventoryTransferStatus.CONFIRMED,
              items: [
                {
                  productId: 'product-1',
                  quantityKg: 0,
                  quantityPieces: 10,
                },
              ],
            },
          },
        ],
      }),
    );
    prisma.sale.findMany.mockResolvedValue([
      {
        items: [
          {
            productId: 'product-1',
            quantityKg: 0,
            quantityPieces: 8,
            total: '800.00',
            appliedEquivalentFactor: null,
            product: {
              name: 'Pollo mixto',
              sku: 'POLLO-1',
              unit: ProductUnit.PIECE,
            },
            unitEquivalent: null,
          },
        ],
      },
    ]);

    await expect(
      service.createReturn(
        'cycle-1',
        {
          expectedVersion: 1,
          ...logisticsAssignment,
          items: [
            {
              productId: 'product-1',
              unit: ProductUnit.PIECE,
              quantityPieces: 3,
            },
          ],
        },
        warehouse,
        'return-over-limit-key',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RETURN_EXCEEDS_UNSOLD_QUANTITY',
      }),
    });
    expect(inventoryTransfers.create).not.toHaveBeenCalled();
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
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'SHRINKAGE',
          OR: [
            { referenceType: null },
            { referenceType: { not: 'BRANCH_SUPPLY_RECEIPT' } },
          ],
        }),
      }),
    );
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

  it('redacts cycle costs and utility from a seller detail response', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      createCycle({
        items: [
          {
            id: 'item-1',
            cycleVersion: 2,
            snapshotKey: 'product-1',
            productId: 'product-1',
            productNameSnapshot: 'Pollo snapshot',
            productSkuSnapshot: 'POLLO-1',
            productUnitSnapshot: ProductUnit.PIECE,
            unitPriceSnapshot: 100,
            unitCostSnapshot: 60,
            expectedCostAmount: 420,
            actualCostAmount: 420,
            expectedProfitAmount: 280,
            actualProfitAmount: 280,
          },
        ],
        productSnapshots: [
          {
            id: 'price-snapshot-1',
            productId: 'product-1',
            unitPriceSnapshot: 100,
            unitCostSnapshot: 60,
          },
        ],
      }),
    );

    const result = await service.findOne('cycle-1', seller);

    expect(result.snapshots[0]).not.toHaveProperty('unitCostSnapshot');
    expect(result.snapshots[0]).not.toHaveProperty('expectedCostAmount');
    expect(result.priceSnapshots[0]).not.toHaveProperty('unitCostSnapshot');
    expect(result.totals).not.toHaveProperty('expectedCostTotal');
    expect(result.totals).not.toHaveProperty('expectedProfitTotal');
  });
});
