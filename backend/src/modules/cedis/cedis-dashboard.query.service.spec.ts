import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';

const businessDate = new Date('2026-08-04T00:00:00.000Z');
const activityAt = new Date('2026-08-04T18:00:00.000Z');

const branch = {
  id: 'branch-1',
  name: 'Sucursal Centro',
  code: 'S01',
  address: 'Centro',
  latitude: new Prisma.Decimal('19.000000'),
  longitude: new Prisma.Decimal('-99.000000'),
};

function cycle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cycle-1',
    distributionCenterLocationId: 'cedis-1',
    branchLocationId: 'branch-1',
    businessDate,
    status: 'CLOSED',
    version: 4,
    totalDeliveredKg: new Prisma.Decimal('25.500'),
    totalDeliveredPieces: new Prisma.Decimal('10.000'),
    totalReturnedKg: new Prisma.Decimal('1.000'),
    totalReturnedPieces: new Prisma.Decimal('1.000'),
    totalExpectedSoldKg: new Prisma.Decimal('24.500'),
    totalExpectedSoldPieces: new Prisma.Decimal('9.000'),
    totalActualSoldKg: new Prisma.Decimal('24.000'),
    totalActualSoldPieces: new Prisma.Decimal('8.000'),
    expectedSalesTotal: new Prisma.Decimal('1000.00'),
    actualSalesTotal: new Prisma.Decimal('900.00'),
    expectedCashTotal: new Prisma.Decimal('700.00'),
    cashCountedTotal: new Prisma.Decimal('695.00'),
    cashDifferenceTotal: new Prisma.Decimal('-5.00'),
    expectedCostTotal: new Prisma.Decimal('600.00'),
    actualCostTotal: new Prisma.Decimal('550.00'),
    expectedProfitTotal: new Prisma.Decimal('400.00'),
    actualProfitTotal: new Prisma.Decimal('350.00'),
    actualNetProfitTotal: new Prisma.Decimal('330.00'),
    updatedAt: activityAt,
    pointOfSaleDailyClose: {
      id: 'close-1',
      updatedAt: new Date('2026-08-04T17:00:00.000Z'),
      differences: [{ status: 'PENDING_AUTHORIZATION' }],
      sales: [],
    },
    transfers: [
      {
        linkedAt: new Date('2026-08-04T10:00:00.000Z'),
        inventoryTransfer: {
          status: 'CONFIRMED',
          updatedAt: new Date('2026-08-04T11:00:00.000Z'),
        },
      },
    ],
    events: [{ occurredAt: new Date('2026-08-04T12:00:00.000Z') }],
    ...overrides,
  };
}

function createService() {
  const prisma = {
    operationalLocation: { findMany: jest.fn(), findUnique: jest.fn() },
    inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    pointOfSaleDailyClose: { findFirst: jest.fn() },
    branchSupplyCycle: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
  prisma.operationalLocation.findUnique.mockResolvedValue({
    id: 'branch-1',
    type: 'BRANCH',
    parentId: 'cedis-1',
    isActive: true,
  });
  const config = {
    get: jest.fn().mockReturnValue('America/Mexico_City'),
  };
  return {
    prisma,
    service: new CedisDashboardQueryService(prisma, config as never),
  };
}

const seller = {
  role: 'SELLER',
  operationalLocationId: 'branch-1',
  permissions: [PERMISSIONS.CEDIS_VIEW],
};

const adminWithCosts = {
  role: 'ADMIN',
  permissions: [PERMISSIONS.CEDIS_VIEW, PERMISSIONS.CEDIS_VIEW_COSTS],
};

describe('CedisDashboardQueryService', () => {
  it('filters the dashboard and returns an explicit empty card without a cycle', async () => {
    const { prisma, service } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([]);

    const result = await service.getDashboard(
      {
        cedisLocationId: 'cedis-1',
        businessDate: '2026-08-04',
        status: 'CLOSED' as never,
        search: 'centro',
      },
      seller,
    );

    expect(prisma.operationalLocation.findMany.mock.calls).toHaveLength(1);
    expect(prisma.branchSupplyCycle.findMany.mock.calls).toHaveLength(1);
    expect(prisma.operationalLocation.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'branch-1',
          parentId: 'cedis-1',
          OR: [
            { name: { contains: 'centro', mode: 'insensitive' } },
            { code: { contains: 'centro', mode: 'insensitive' } },
          ],
        }),
      }),
    );
    expect(prisma.branchSupplyCycle.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          distributionCenterLocationId: 'cedis-1',
          businessDate,
          status: 'CLOSED',
          branchLocationId: 'branch-1',
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        cycle: null,
        physical: null,
        financial: null,
        cash: null,
        warningCount: 0,
      }),
    );
  });

  it('rejects a seller whose branch is not a direct child of the requested CEDIS', async () => {
    const { prisma, service } = createService();
    (prisma.operationalLocation as { findUnique?: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 'branch-1',
        type: 'BRANCH',
        parentId: 'other-cedis',
        isActive: true,
      });

    await expect(
      service.getDashboard(
        { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
        seller,
      ),
    ).rejects.toEqual(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    expect(
      (prisma.operationalLocation as unknown as { findMany: jest.Mock })
        .findMany,
    ).not.toHaveBeenCalled();
    expect(
      (prisma.branchSupplyCycle as unknown as { findMany: jest.Mock }).findMany,
    ).not.toHaveBeenCalled();
  });

  it('keeps cost and utility columns out of unauthorized dashboard projections', async () => {
    const { prisma, service } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([cycle()]);

    const result = await service.getDashboard(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      seller,
    );
    const select = prisma.branchSupplyCycle.findMany.mock.calls[0][0].select;

    expect(select).not.toHaveProperty('expectedCostTotal');
    expect(select).not.toHaveProperty('actualCostTotal');
    expect(select).not.toHaveProperty('expectedProfitTotal');
    expect(select).not.toHaveProperty('actualProfitTotal');
    expect(result.items[0].financial).toEqual({
      expectedSales: '1000.00',
      actualSales: '900.00',
      creditSales: '0.00',
    });
  });

  it('includes outstanding credit sales in dashboard and branch history cards', async () => {
    const { prisma, service } = createService();
    const cycleWithCreditSales = cycle({
      pointOfSaleDailyClose: {
        id: 'close-1',
        updatedAt: new Date('2026-08-04T17:00:00.000Z'),
        differences: [],
        sales: [
          {
            paymentType: 'CREDIT_SALE',
            total: new Prisma.Decimal('5000.00'),
            payments: [{ amount: new Prisma.Decimal('500.00') }],
          },
        ],
      },
    });
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([cycleWithCreditSales]);

    const dashboard = await service.getDashboard(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      seller,
    );
    const dashboardSelect =
      prisma.branchSupplyCycle.findMany.mock.calls[0][0].select;

    expect(dashboardSelect.pointOfSaleDailyClose.select.sales).toBeDefined();
    expect(dashboard.items[0]?.financial).toEqual(
      expect.objectContaining({ creditSales: '4500.00' }),
    );

    prisma.branchSupplyCycle.findMany.mockResolvedValue([
      { ...cycleWithCreditSales, branchLocation: branch },
    ]);
    prisma.branchSupplyCycle.count.mockResolvedValue(1);

    const history = await service.getBranchHistory(
      'branch-1',
      { dateFrom: '2026-08-01', dateTo: '2026-08-31', page: 1, limit: 31 },
      seller,
    );

    expect(history.items[0]?.financial).toEqual(
      expect.objectContaining({ creditSales: '4500.00' }),
    );
  });

  it('returns complete financial projections to an administrator with cost permission', async () => {
    const { prisma, service } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([cycle()]);

    const result = await service.getDashboard(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      adminWithCosts,
    );
    const select = prisma.branchSupplyCycle.findMany.mock.calls[0][0].select;

    expect(select).toHaveProperty('expectedCostTotal', true);
    expect(select).toHaveProperty('actualNetProfitTotal', true);
    expect(result.items[0].financial).toEqual(
      expect.objectContaining({
        expectedCost: '600.00',
        actualCost: '550.00',
        expectedProfit: '400.00',
        actualProfit: '350.00',
        actualNetProfit: '330.00',
      }),
    );
  });

  it('projects confirmed transfer quantities in dashboard cards before refresh', async () => {
    const { prisma, service } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([
      cycle({
        totalDeliveredKg: new Prisma.Decimal('0.000'),
        totalDeliveredPieces: new Prisma.Decimal('0.000'),
        totalExpectedSoldKg: new Prisma.Decimal('0.000'),
        totalExpectedSoldPieces: new Prisma.Decimal('0.000'),
        expectedSalesTotal: new Prisma.Decimal('0.00'),
        expectedCostTotal: new Prisma.Decimal('0.00'),
        expectedProfitTotal: new Prisma.Decimal('0.00'),
        productSnapshots: [
          {
            productId: 'product-1',
            productUnitSnapshot: 'KG',
            unitPriceSnapshot: new Prisma.Decimal('58.00'),
            unitCostSnapshot: new Prisma.Decimal('42.00'),
            appliedEquivalentFactorSnapshot: null,
            equivalenceFromUnitSnapshot: null,
            equivalenceToUnitSnapshot: null,
          },
        ],
        transfers: [
          {
            role: 'SUPPLY',
            linkedAt: new Date('2026-08-04T09:00:00.000Z'),
            inventoryTransfer: {
              status: 'CONFIRMED',
              updatedAt: new Date('2026-08-04T09:30:00.000Z'),
              items: [
                {
                  productId: 'product-1',
                  unit: 'KG',
                  quantityKg: new Prisma.Decimal('25.500'),
                  quantityPieces: null,
                  appliedEquivalentFactor: null,
                  unitEquivalent: null,
                  product: {
                    unit: 'KG',
                    salePrice: new Prisma.Decimal('58.00'),
                  },
                },
              ],
            },
          },
          {
            role: 'RETURN',
            linkedAt: new Date('2026-08-04T10:00:00.000Z'),
            inventoryTransfer: {
              status: 'CONFIRMED',
              updatedAt: new Date('2026-08-04T10:30:00.000Z'),
              items: [
                {
                  productId: 'product-1',
                  unit: 'KG',
                  quantityKg: new Prisma.Decimal('1.000'),
                  quantityPieces: null,
                  appliedEquivalentFactor: null,
                  unitEquivalent: null,
                  product: {
                    unit: 'KG',
                    salePrice: new Prisma.Decimal('58.00'),
                  },
                },
              ],
            },
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      adminWithCosts,
    );

    expect(result.items[0]?.physical).toEqual(
      expect.objectContaining({
        deliveredKg: '25.500',
        returnedKg: '1.000',
        expectedSoldKg: '24.500',
      }),
    );
    expect(result.items[0]?.financial).toEqual(
      expect.objectContaining({
        expectedSales: '1421.00',
        expectedCost: '1071.00',
        expectedProfit: '350.00',
      }),
    );
  });

  it('keeps persisted physical totals when a pending return has items', async () => {
    const { prisma, service } = createService();
    prisma.operationalLocation.findMany.mockResolvedValue([branch]);
    prisma.branchSupplyCycle.findMany.mockResolvedValue([
      cycle({
        transfers: [
          {
            role: 'RETURN',
            linkedAt: new Date('2026-08-04T10:00:00.000Z'),
            inventoryTransfer: {
              status: 'REQUESTED',
              updatedAt: new Date('2026-08-04T10:30:00.000Z'),
              items: [
                {
                  productId: 'product-1',
                  unit: 'KG',
                  quantityKg: new Prisma.Decimal('3.000'),
                  quantityPieces: null,
                },
              ],
            },
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      seller,
    );

    expect(result.items[0]?.physical).toEqual(
      expect.objectContaining({
        deliveredKg: '25.500',
        deliveredPieces: '10.000',
        returnedKg: '1.000',
        returnedPieces: '1.000',
        expectedSoldKg: '24.500',
        expectedSoldPieces: '9.000',
      }),
    );
  });

  it('uses stable pagination and applies the history filters in both queries', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findMany.mockResolvedValue([
      { ...cycle(), branchLocation: branch },
    ]);
    prisma.branchSupplyCycle.count.mockResolvedValue(51);

    const result = await service.getBranchHistory(
      'branch-1',
      {
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        status: 'CLOSED' as never,
        page: 3,
        limit: 25,
      },
      adminWithCosts,
    );
    const expectedWhere = {
      branchLocationId: 'branch-1',
      businessDate: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-31T00:00:00.000Z'),
      },
      status: 'CLOSED',
    };

    expect(prisma.branchSupplyCycle.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expectedWhere,
        skip: 50,
        take: 25,
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.branchSupplyCycle.count.mock.calls[0][0]).toEqual({
      where: expectedWhere,
    });
    expect(result.total).toBe(51);
    expect(result.totalPages).toBe(3);
  });

  it('does not allow a seller to query another branch history', async () => {
    const { prisma, service } = createService();

    await expect(
      service.getBranchHistory(
        'branch-2',
        { dateFrom: '2026-08-01', dateTo: '2026-08-31', page: 1, limit: 25 },
        seller,
      ),
    ).rejects.toEqual(new ForbiddenException('LOCATION_NOT_AUTHORIZED'));
    expect(prisma.branchSupplyCycle.findMany.mock.calls).toHaveLength(0);
  });

  it('does not allow a seller to read a cycle from another branch', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      cycle({ branchLocationId: 'branch-2' }),
    );

    await expect(service.getCycleSummary('cycle-1', seller)).rejects.toEqual(
      new ForbiddenException('LOCATION_NOT_AUTHORIZED'),
    );
    const select = prisma.branchSupplyCycle.findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('expectedCostTotal');
  });

  it('returns the latest article version, transfers, daily close, and cash summary', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      cycle({
        notes: 'Daily cycle',
        branchLocation: branch,
        distributionCenterLocation: {
          ...branch,
          id: 'cedis-1',
          name: 'CEDIS Centro',
          code: 'C01',
        },
        items: [
          {
            id: 'item-v3',
            cycleVersion: 3,
            snapshotKey: 'product-1',
            productId: 'product-1',
            productNameSnapshot: 'Pollo',
            productSkuSnapshot: 'POL-1',
            productUnitSnapshot: 'KG',
            unitPriceSnapshot: new Prisma.Decimal('40.00'),
            unitCostSnapshot: new Prisma.Decimal('25.00'),
            deliveredKg: new Prisma.Decimal('20.000'),
            deliveredPieces: new Prisma.Decimal('0.000'),
            returnedKg: new Prisma.Decimal('0.000'),
            returnedPieces: new Prisma.Decimal('0.000'),
            expectedSoldKg: new Prisma.Decimal('20.000'),
            expectedSoldPieces: new Prisma.Decimal('0.000'),
            actualSoldKg: new Prisma.Decimal('19.000'),
            actualSoldPieces: new Prisma.Decimal('0.000'),
            expectedSalesAmount: new Prisma.Decimal('800.00'),
            expectedCostAmount: new Prisma.Decimal('500.00'),
            actualSalesAmount: new Prisma.Decimal('760.00'),
            actualCostAmount: new Prisma.Decimal('475.00'),
            expectedProfitAmount: new Prisma.Decimal('300.00'),
            actualProfitAmount: new Prisma.Decimal('285.00'),
          },
          {
            id: 'item-v4',
            cycleVersion: 4,
            snapshotKey: 'product-1',
            productId: 'product-1',
            productNameSnapshot: 'Pollo actualizado',
            productSkuSnapshot: 'POL-1',
            productUnitSnapshot: 'KG',
            unitPriceSnapshot: new Prisma.Decimal('42.00'),
            unitCostSnapshot: new Prisma.Decimal('26.00'),
            deliveredKg: new Prisma.Decimal('25.500'),
            deliveredPieces: new Prisma.Decimal('0.000'),
            returnedKg: new Prisma.Decimal('1.000'),
            returnedPieces: new Prisma.Decimal('0.000'),
            expectedSoldKg: new Prisma.Decimal('24.500'),
            expectedSoldPieces: new Prisma.Decimal('0.000'),
            actualSoldKg: new Prisma.Decimal('24.000'),
            actualSoldPieces: new Prisma.Decimal('0.000'),
            expectedSalesAmount: new Prisma.Decimal('1000.00'),
            expectedCostAmount: new Prisma.Decimal('600.00'),
            actualSalesAmount: new Prisma.Decimal('900.00'),
            actualCostAmount: new Prisma.Decimal('550.00'),
            expectedProfitAmount: new Prisma.Decimal('400.00'),
            actualProfitAmount: new Prisma.Decimal('350.00'),
          },
        ],
        transfers: [
          {
            id: 'link-1',
            role: 'SUPPLY',
            linkedAt: new Date('2026-08-04T09:00:00.000Z'),
            inventoryTransfer: {
              id: 'transfer-1',
              transferNumber: 'TR-1',
              status: 'CONFIRMED',
              originLocationId: 'cedis-1',
              destinationLocationId: 'branch-1',
              requestedAt: new Date('2026-08-04T08:00:00.000Z'),
              confirmedAt: new Date('2026-08-04T09:30:00.000Z'),
              cancelledAt: null,
              updatedAt: new Date('2026-08-04T09:30:00.000Z'),
              items: [
                {
                  id: 'transfer-item-1',
                  productId: 'product-1',
                  unit: 'KG',
                  quantityKg: new Prisma.Decimal('25.500'),
                  quantityPieces: null,
                  product: { name: 'Pollo actualizado', sku: 'POL-1' },
                },
              ],
            },
          },
        ],
        pointOfSaleDailyClose: {
          id: 'close-1',
          businessDate,
          status: 'CLOSED',
          version: 2,
          cashTotal: new Prisma.Decimal('700.00'),
          cardVoucherTotal: new Prisma.Decimal('100.00'),
          transferTotal: new Prisma.Decimal('100.00'),
          expenseTotal: new Prisma.Decimal('50.00'),
          grossSalesTotal: new Prisma.Decimal('5700.00'),
          netCashExpected: new Prisma.Decimal('700.00'),
          cashCountedTotal: new Prisma.Decimal('695.00'),
          cashDifferenceTotal: new Prisma.Decimal('-5.00'),
          purchaseCostTotal: new Prisma.Decimal('550.00'),
          grossProfitTotal: new Prisma.Decimal('350.00'),
          netProfitTotal: new Prisma.Decimal('330.00'),
          updatedAt: activityAt,
          cashMovements: [
            {
              id: 'movement-1',
              type: 'EXPENSE',
              movementChannel: 'CASH',
              amount: new Prisma.Decimal('50.00'),
              reason: 'Supplies',
              reference: null,
              isOpening: false,
              occurredAt: new Date('2026-08-04T15:00:00.000Z'),
            },
          ],
          payments: [
            {
              id: 'payment-1',
              amount: new Prisma.Decimal('700.00'),
              paymentMethod: 'CASH',
              paidAt: new Date('2026-08-04T16:00:00.000Z'),
            },
          ],
          sales: [
            { paymentType: 'CASH_SALE', total: new Prisma.Decimal('700.00') },
            {
              paymentType: 'CREDIT_SALE',
              total: new Prisma.Decimal('5000.00'),
              payments: [{ amount: new Prisma.Decimal('500.00') }],
            },
          ],
          cashShifts: [
            {
              id: 'shift-1',
              status: 'CLOSED',
              openedAt: new Date('2026-08-04T08:00:00.000Z'),
              closedAt: new Date('2026-08-04T18:00:00.000Z'),
              initialCashFund: new Prisma.Decimal('100.00'),
              initialCashIn: new Prisma.Decimal('0.00'),
              initialCashOut: new Prisma.Decimal('0.00'),
              cashCountedTotal: new Prisma.Decimal('695.00'),
              cashDifferenceTotal: new Prisma.Decimal('-5.00'),
              closeMode: 'CASHIER',
            },
          ],
          differences: [],
        },
      }),
    );
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: new Prisma.Decimal('30.000'),
        quantityPieces: 0,
        reservedQuantityKg: new Prisma.Decimal('5.000'),
        reservedQuantityPieces: 0,
      },
    ]);

    const result = await service.getCycleSummary('cycle-1', adminWithCosts);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        name: 'Pollo actualizado',
        unitCost: '26.00',
        expectedProfit: '400.00',
      }),
    );
    expect(result.totals.creditSales).toBe('4500.00');
    expect(result.dailyClose?.totals.creditSales).toBe('4500.00');
    expect(result.transfers[0].transfer.items[0]).toEqual(
      expect.objectContaining({
        productName: 'Pollo actualizado',
        balance: {
          locationId: 'cedis-1',
          quantityKg: 30,
          quantityPieces: 0,
          reservedQuantityKg: 5,
          reservedQuantityPieces: 0,
          availableQuantityKg: 25,
          availableQuantityPieces: 0,
        },
      }),
    );
    expect(result.dailyClose).toEqual(
      expect.objectContaining({ status: 'CLOSED' }),
    );
    expect(result.cashMovementSummary).toEqual(
      expect.objectContaining({
        movementCount: 1,
        expenseTotal: '50.00',
      }),
    );

    const sellerResult = await service.getCycleSummary('cycle-1', seller);
    expect(sellerResult.totals).not.toHaveProperty('expectedCost');
    expect(sellerResult.totals).not.toHaveProperty('actualProfit');
    expect(sellerResult.items[0]).not.toHaveProperty('unitCost');
    expect(sellerResult.items[0]).not.toHaveProperty('expectedProfit');
    expect(sellerResult.dailyClose?.totals).not.toHaveProperty('purchaseCost');

    const sellerSelect =
      prisma.branchSupplyCycle.findUnique.mock.calls[1][0].select;
    expect(sellerSelect).not.toHaveProperty('expectedCostTotal');
    expect(sellerSelect.items.select).not.toHaveProperty('unitCostSnapshot');
    expect(sellerSelect.productSnapshots.select).not.toHaveProperty(
      'unitCostSnapshot',
    );
  });

  it('reflects confirmed delivery transfers before the cycle is refreshed', async () => {
    const { prisma, service } = createService();
    prisma.branchSupplyCycle.findUnique.mockResolvedValue(
      cycle({
        items: [],
        branchLocation: branch,
        distributionCenterLocation: {
          ...branch,
          id: 'cedis-1',
          name: 'CEDIS Centro',
          code: 'C01',
        },
        pointOfSaleDailyClose: null,
        totalDeliveredKg: new Prisma.Decimal('0.000'),
        totalDeliveredPieces: new Prisma.Decimal('0.000'),
        totalExpectedSoldKg: new Prisma.Decimal('0.000'),
        totalExpectedSoldPieces: new Prisma.Decimal('0.000'),
        expectedSalesTotal: new Prisma.Decimal('0.00'),
        expectedCostTotal: new Prisma.Decimal('0.00'),
        expectedProfitTotal: new Prisma.Decimal('0.00'),
        productSnapshots: [
          {
            productId: 'product-1',
            productUnitSnapshot: 'KG',
            unitPriceSnapshot: new Prisma.Decimal('58.00'),
            unitCostSnapshot: new Prisma.Decimal('42.00'),
            appliedEquivalentFactorSnapshot: null,
            equivalenceFromUnitSnapshot: null,
            equivalenceToUnitSnapshot: null,
          },
        ],
        transfers: [
          {
            id: 'link-supply-1',
            role: 'SUPPLY',
            linkedAt: new Date('2026-08-04T09:00:00.000Z'),
            inventoryTransfer: {
              id: 'transfer-supply-1',
              transferNumber: 'TR-SUPPLY-1',
              status: 'CONFIRMED',
              originLocationId: 'cedis-1',
              destinationLocationId: 'branch-1',
              requestedAt: new Date('2026-08-04T08:00:00.000Z'),
              confirmedAt: new Date('2026-08-04T09:30:00.000Z'),
              cancelledAt: null,
              updatedAt: new Date('2026-08-04T09:30:00.000Z'),
              items: [
                {
                  id: 'transfer-item-1',
                  productId: 'product-1',
                  unit: 'KG',
                  quantityKg: new Prisma.Decimal('25.500'),
                  quantityPieces: null,
                  product: {
                    name: 'Pollo',
                    sku: 'POL-1',
                    unit: 'KG',
                    salePrice: new Prisma.Decimal('58.00'),
                  },
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
            quantityKg: new Prisma.Decimal('10.000'),
            quantityPieces: null,
            total: new Prisma.Decimal('580.00'),
          },
        ],
      },
    ]);

    const result = await service.getCycleSummary('cycle-1', adminWithCosts);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        productId: 'product-1',
        deliveredKg: '25.500',
        actualSoldKg: '10.000',
        expectedSales: '1479.00',
      }),
    );
    expect(result.totals).toEqual(
      expect.objectContaining({
        deliveredKg: '25.500',
        deliveredPieces: '0.000',
        expectedSoldKg: '25.500',
        expectedSoldPieces: '0.000',
        expectedSales: '1479.00',
        expectedCost: '1071.00',
        expectedProfit: '408.00',
      }),
    );
  });
});
