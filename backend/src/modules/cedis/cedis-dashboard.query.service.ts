import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BranchSupplyCycleStatus, Prisma, ProductUnit } from '@prisma/client';
import { toMoneyString, Money } from '../../../../shared/money';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  toInventoryBalanceAvailability,
  type InventoryBalanceAvailability,
} from '../inventory/inventory-balance.service';
import { CedisBranchHistoryQueryDto, CedisDashboardQueryDto } from './dto';

type QueryActor = Pick<
  AuthenticatedUser,
  'role' | 'permissions' | 'operationalLocationId'
>;

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type LocationRecord = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  latitude: DecimalLike;
  longitude: DecimalLike;
};

type DashboardCycleRecord = {
  id: string;
  distributionCenterLocationId: string;
  branchLocationId: string;
  businessDate: Date;
  status: BranchSupplyCycleStatus;
  version: number;
  totalDeliveredKg: DecimalLike;
  totalDeliveredPieces: DecimalLike;
  totalReturnedKg: DecimalLike;
  totalReturnedPieces: DecimalLike;
  totalExpectedSoldKg: DecimalLike;
  totalExpectedSoldPieces: DecimalLike;
  totalActualSoldKg: DecimalLike;
  totalActualSoldPieces: DecimalLike;
  expectedSalesTotal: DecimalLike;
  actualSalesTotal: DecimalLike;
  expectedCashTotal: DecimalLike;
  cashCountedTotal: DecimalLike;
  cashDifferenceTotal: DecimalLike;
  expectedCostTotal?: DecimalLike;
  actualCostTotal?: DecimalLike;
  expectedProfitTotal?: DecimalLike;
  actualProfitTotal?: DecimalLike;
  actualNetProfitTotal?: DecimalLike;
  updatedAt: Date;
  branchLocation?: LocationRecord;
  distributionCenterLocation?: LocationRecord;
  pointOfSaleDailyClose?: DashboardDailyCloseRecord | null;
  transfers?: DashboardTransferActivity[];
  productSnapshots?: DashboardProductSnapshot[];
  events?: Array<{ occurredAt: Date }>;
};

type DashboardProductSnapshot = {
  productId: string;
  productUnitSnapshot: ProductUnit;
  unitPriceSnapshot: DecimalLike;
  unitCostSnapshot?: DecimalLike;
  appliedEquivalentFactorSnapshot: DecimalLike;
  equivalenceFromUnitSnapshot: ProductUnit | null;
  equivalenceToUnitSnapshot: ProductUnit | null;
};

type DashboardDailyCloseRecord = {
  id: string;
  updatedAt: Date;
  differences: Array<{ status: string }>;
  sales?: Array<{
    paymentType: string;
    total: DecimalLike;
    payments?: Array<{ amount: DecimalLike }>;
  }>;
};

type DashboardTransferActivity = {
  role: string;
  linkedAt: Date;
  inventoryTransfer: {
    status: string;
    updatedAt: Date;
    items?: Array<{
      productId: string;
      unit?: string;
      quantityKg: DecimalLike;
      quantityPieces: number | null;
      appliedEquivalentFactor?: DecimalLike;
      unitEquivalent?: {
        unitFrom: string;
        unitTo: string;
        factor: DecimalLike;
      } | null;
      product?: {
        name?: string;
        sku?: string | null;
        unit?: string;
        salePrice?: DecimalLike;
      };
    }>;
  };
};

type HistoryCycleRecord = DashboardCycleRecord & {
  branchLocation: LocationRecord;
};

type DetailItemRecord = {
  id: string;
  cycleVersion: number;
  snapshotKey: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  productUnitSnapshot: string;
  unitPriceSnapshot: DecimalLike;
  unitCostSnapshot?: DecimalLike;
  deliveredKg: DecimalLike;
  deliveredPieces: DecimalLike;
  returnedKg: DecimalLike;
  returnedPieces: DecimalLike;
  expectedSoldKg: DecimalLike;
  expectedSoldPieces: DecimalLike;
  actualSoldKg: DecimalLike;
  actualSoldPieces: DecimalLike;
  expectedSalesAmount: DecimalLike;
  expectedCostAmount?: DecimalLike;
  actualSalesAmount: DecimalLike;
  actualCostAmount?: DecimalLike;
  expectedProfitAmount?: DecimalLike;
  actualProfitAmount?: DecimalLike;
};

type DetailTransferItemRecord = {
  id: string;
  productId: string;
  unit: string;
  quantityKg: DecimalLike;
  quantityPieces: number | null;
  product: {
    name: string;
    sku: string | null;
    unit?: string;
    salePrice?: DecimalLike;
  };
};

type DetailSaleItemRecord = {
  productId: string;
  quantityKg: DecimalLike;
  quantityPieces: number | null;
  total: DecimalLike;
};

type DetailSaleRecord = {
  items: DetailSaleItemRecord[];
};

type DetailSalesAggregate = {
  quantityKg: number;
  quantityPieces: number;
  salesAmount: Money;
};

type DetailTransferRecord = {
  id: string;
  transferNumber: string;
  status: string;
  originLocationId: string;
  destinationLocationId: string;
  requestedAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
  items: DetailTransferItemRecord[];
  branchSupplyReceipt: {
    id: string;
    receivedAt: Date;
    notes: string | null;
    receivedBy: { id: string; name: string };
    items: Array<{
      transferItemId: string;
      productId: string;
      productNameSnapshot: string;
      unit: string;
      sentKg: DecimalLike;
      sentPieces: number;
      receivedKg: DecimalLike;
      receivedPieces: number;
      differenceKg: DecimalLike;
      differencePieces: number;
    }>;
  } | null;
};

type DetailTransferLinkRecord = {
  id: string;
  role: string;
  linkedAt: Date;
  inventoryTransfer: DetailTransferRecord;
};

type DetailCashMovementRecord = {
  id: string;
  type: string;
  movementChannel: string;
  amount: DecimalLike;
  reason: string;
  reference: string | null;
  isOpening: boolean;
  occurredAt: Date;
};

type DetailPaymentRecord = {
  id: string;
  amount: DecimalLike;
  paymentMethod: string;
  paidAt: Date;
};

type DetailCashShiftRecord = {
  id: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  initialCashFund: DecimalLike;
  initialCashIn: DecimalLike;
  initialCashOut: DecimalLike;
  cashCountedTotal: DecimalLike;
  cashDifferenceTotal: DecimalLike;
  closeMode: string | null;
};

type DetailDifferenceRecord = {
  id: string;
  code: string;
  scope: string;
  unit: string;
  expectedValue: DecimalLike;
  recordedValue: DecimalLike;
  differenceValue: DecimalLike;
  differenceType: string;
  status: string;
  reason: string | null;
  evidence: string | null;
};

type DetailDailyCloseRecord = {
  id: string;
  businessDate: Date;
  status: string;
  version: number;
  cashTotal: DecimalLike;
  cardVoucherTotal: DecimalLike;
  transferTotal: DecimalLike;
  expenseTotal: DecimalLike;
  grossSalesTotal: DecimalLike;
  netCashExpected: DecimalLike;
  cashCountedTotal: DecimalLike;
  cashDifferenceTotal: DecimalLike;
  purchaseCostTotal?: DecimalLike;
  grossProfitTotal?: DecimalLike;
  netProfitTotal?: DecimalLike;
  updatedAt: Date;
  cashMovements: DetailCashMovementRecord[];
  payments: DetailPaymentRecord[];
  cashShifts: DetailCashShiftRecord[];
  sales?: Array<{
    paymentType: string;
    total: DecimalLike;
    payments?: Array<{ amount: DecimalLike }>;
  }>;
  differences: DetailDifferenceRecord[];
};

type DetailCycleRecord = Omit<
  DashboardCycleRecord,
  | 'branchLocation'
  | 'distributionCenterLocation'
  | 'pointOfSaleDailyClose'
  | 'transfers'
> & {
  notes: string | null;
  branchLocation: LocationRecord;
  distributionCenterLocation: LocationRecord;
  pointOfSaleDailyClose: DetailDailyCloseRecord | null;
  items: DetailItemRecord[];
  transfers: DetailTransferLinkRecord[];
  events: Array<{ occurredAt: Date }>;
};

const LOCATION_SELECT = {
  id: true,
  name: true,
  code: true,
  address: true,
  latitude: true,
  longitude: true,
} as const;

const PRODUCT_SNAPSHOT_SELECT = {
  productId: true,
  productUnitSnapshot: true,
  unitPriceSnapshot: true,
  appliedEquivalentFactorSnapshot: true,
  equivalenceFromUnitSnapshot: true,
  equivalenceToUnitSnapshot: true,
} as const;

const DASHBOARD_CYCLE_SELECT = {
  id: true,
  distributionCenterLocationId: true,
  branchLocationId: true,
  businessDate: true,
  status: true,
  version: true,
  totalDeliveredKg: true,
  totalDeliveredPieces: true,
  totalReturnedKg: true,
  totalReturnedPieces: true,
  totalExpectedSoldKg: true,
  totalExpectedSoldPieces: true,
  totalActualSoldKg: true,
  totalActualSoldPieces: true,
  expectedSalesTotal: true,
  actualSalesTotal: true,
  expectedCashTotal: true,
  cashCountedTotal: true,
  cashDifferenceTotal: true,
  updatedAt: true,
  pointOfSaleDailyClose: {
    select: {
      id: true,
      updatedAt: true,
      differences: { select: { status: true } },
      sales: {
        where: { status: 'CONFIRMED' as const },
        select: {
          paymentType: true,
          total: true,
          payments: {
            where: { status: 'APPLIED' as const },
            select: { amount: true },
          },
        },
      },
    },
  },
  transfers: {
    select: {
      role: true,
      linkedAt: true,
      inventoryTransfer: {
        select: {
          status: true,
          updatedAt: true,
          items: {
            select: {
              productId: true,
              unit: true,
              quantityKg: true,
              quantityPieces: true,
              appliedEquivalentFactor: true,
              unitEquivalent: {
                select: { unitFrom: true, unitTo: true, factor: true },
              },
              product: { select: { unit: true, salePrice: true } },
            },
          },
        },
      },
    },
  },
  events: {
    take: 1,
    orderBy: { occurredAt: 'desc' as const },
    select: { occurredAt: true },
  },
  productSnapshots: { select: PRODUCT_SNAPSHOT_SELECT },
} as const;

const COST_TOTAL_SELECT = {
  expectedCostTotal: true,
  actualCostTotal: true,
  expectedProfitTotal: true,
  actualProfitTotal: true,
  actualNetProfitTotal: true,
} as const;

@Injectable()
export class CedisDashboardQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(query: CedisDashboardQueryDto, actor: QueryActor) {
    await this.assertDashboardScope(query.cedisLocationId, actor);
    const businessDate = this.parseDateOnly(query.businessDate);
    const canViewCosts = this.canViewCosts(actor);
    const search = query.search?.trim() || undefined;

    const branchWhere = {
      type: 'BRANCH' as const,
      isActive: true,
      parentId: query.cedisLocationId,
      parent: {
        type: 'DISTRIBUTION_CENTER' as const,
        isActive: true,
      },
      ...(actor.role === 'SELLER'
        ? { id: actor.operationalLocationId ?? '__seller_without_location__' }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const cycleWhere = {
      distributionCenterLocationId: query.cedisLocationId,
      businessDate,
      ...(query.status ? { status: query.status } : {}),
      ...(actor.role === 'SELLER'
        ? {
            branchLocationId:
              actor.operationalLocationId ?? '__seller_without_location__',
          }
        : {}),
    };

    const [branches, cycles] = await Promise.all([
      this.prisma.operationalLocation.findMany({
        where: branchWhere,
        select: LOCATION_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.branchSupplyCycle.findMany({
        where: cycleWhere,
        select: this.dashboardCycleSelect(canViewCosts),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const branchRecords = branches as unknown as LocationRecord[];
    const cycleRecords = cycles as unknown as DashboardCycleRecord[];
    const cycleByBranch = new Map<string, DashboardCycleRecord>();
    for (const cycle of cycleRecords) {
      if (!cycleByBranch.has(cycle.branchLocationId)) {
        cycleByBranch.set(cycle.branchLocationId, cycle);
      }
    }

    const items = branchRecords.map((branch) =>
      this.toDashboardCard(branch, cycleByBranch.get(branch.id), canViewCosts),
    );
    const dataAsOf = this.maxDate(
      cycleRecords.map((cycle) => this.lastActivityDate(cycle)),
    );
    const generatedAt = new Date();

    return {
      cedisLocationId: query.cedisLocationId,
      businessDate: query.businessDate,
      items,
      generatedAt: generatedAt.toISOString(),
      dataAsOf: (dataAsOf ?? generatedAt).toISOString(),
      timeZone: this.timeZone(),
    };
  }

  async getBranchHistory(
    branchId: string,
    query: CedisBranchHistoryQueryDto,
    actor: QueryActor,
  ) {
    if (actor.role === 'SELLER' && actor.operationalLocationId !== branchId) {
      throw this.locationForbidden();
    }

    const dateFrom = this.parseDateOnly(query.dateFrom);
    const dateTo = this.parseDateOnly(query.dateTo);
    if (dateFrom > dateTo) {
      throw new BadRequestException('INVALID_DATE_RANGE');
    }

    const canViewCosts = this.canViewCosts(actor);
    const where = {
      branchLocationId: branchId,
      businessDate: { gte: dateFrom, lte: dateTo },
      ...(query.status ? { status: query.status } : {}),
      ...(actor.role === 'WAREHOUSE'
        ? {
            distributionCenterLocationId:
              actor.operationalLocationId ?? '__warehouse_without_location__',
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [cycles, total] = await Promise.all([
      this.prisma.branchSupplyCycle.findMany({
        where,
        select: {
          ...this.dashboardCycleSelect(canViewCosts),
          branchLocation: { select: LOCATION_SELECT },
        },
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.branchSupplyCycle.count({ where }),
    ]);

    const records = cycles as unknown as HistoryCycleRecord[];
    const generatedAt = new Date();
    return {
      branchId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      items: records.map((cycle) =>
        this.toDashboardCard(cycle.branchLocation, cycle, canViewCosts),
      ),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      generatedAt: generatedAt.toISOString(),
      dataAsOf: (
        this.maxDate(records.map((cycle) => this.lastActivityDate(cycle))) ??
        generatedAt
      ).toISOString(),
      timeZone: this.timeZone(),
    };
  }

  async getCycleSummary(id: string, actor: QueryActor) {
    const canViewCosts = this.canViewCosts(actor);
    const cycle = (await this.prisma.branchSupplyCycle.findUnique({
      where: { id },
      select: this.detailCycleSelect(canViewCosts),
    })) as unknown as DetailCycleRecord | null;

    if (!cycle) {
      throw new NotFoundException('BRANCH_SUPPLY_CYCLE_NOT_FOUND');
    }
    this.assertCycleScope(cycle, actor);

    if (!cycle.pointOfSaleDailyClose) {
      cycle.pointOfSaleDailyClose =
        await this.prisma.pointOfSaleDailyClose.findFirst({
          where: {
            operationalLocationId: cycle.branchLocationId,
            businessDate: cycle.businessDate,
            status: { not: 'CANCELLED' },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: this.detailDailyCloseSelect(canViewCosts),
        });
    }

    const itemVersion = cycle.items.reduce(
      (latest, item) =>
        item.cycleVersion <= cycle.version
          ? Math.max(latest, item.cycleVersion)
          : latest,
      0,
    );
    const persistedItems = cycle.items.filter(
      (item) => item.cycleVersion === itemVersion,
    );
    const items = await this.detailItems(cycle, persistedItems, canViewCosts);
    const transferBalances = await this.findTransferBalances(cycle.transfers);
    const lastActivityAt = this.lastActivityDate(cycle);
    const generatedAt = new Date();

    return {
      id: cycle.id,
      businessDate: this.dateOnly(cycle.businessDate),
      status: cycle.status,
      version: cycle.version,
      notes: cycle.notes,
      branch: this.toLocation(cycle.branchLocation),
      distributionCenter: this.toLocation(cycle.distributionCenterLocation),
      totals: this.toTotals(cycle, canViewCosts),
      items,
      transfers: cycle.transfers.map((link) =>
        this.toTransfer(link, transferBalances),
      ),
      dailyClose: cycle.pointOfSaleDailyClose
        ? this.toDailyClose(cycle.pointOfSaleDailyClose, canViewCosts)
        : null,
      cashMovementSummary: cycle.pointOfSaleDailyClose
        ? this.toCashMovementSummary(cycle.pointOfSaleDailyClose)
        : null,
      warningCount: this.warningCount(cycle),
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString(),
      dataAsOf: (lastActivityAt ?? generatedAt).toISOString(),
      timeZone: this.timeZone(),
    };
  }

  private dashboardCycleSelect(canViewCosts: boolean) {
    return {
      ...DASHBOARD_CYCLE_SELECT,
      ...(canViewCosts ? COST_TOTAL_SELECT : {}),
      productSnapshots: {
        select: {
          ...PRODUCT_SNAPSHOT_SELECT,
          ...(canViewCosts ? { unitCostSnapshot: true } : {}),
        },
      },
    } as Prisma.BranchSupplyCycleSelect;
  }

  private detailCycleSelect(canViewCosts: boolean) {
    return {
      ...this.dashboardCycleSelect(canViewCosts),
      notes: true,
      branchLocation: { select: LOCATION_SELECT },
      distributionCenterLocation: { select: LOCATION_SELECT },
      items: {
        orderBy: [
          { cycleVersion: 'desc' as const },
          { snapshotKey: 'asc' as const },
        ],
        select: this.detailItemSelect(canViewCosts),
      },
      transfers: {
        orderBy: { linkedAt: 'asc' as const },
        select: {
          id: true,
          role: true,
          linkedAt: true,
          inventoryTransfer: {
            select: {
              id: true,
              transferNumber: true,
              status: true,
              originLocationId: true,
              destinationLocationId: true,
              requestedAt: true,
              confirmedAt: true,
              cancelledAt: true,
              updatedAt: true,
              items: {
                orderBy: { createdAt: 'asc' as const },
                select: {
                  id: true,
                  productId: true,
                  unit: true,
                  quantityKg: true,
                  quantityPieces: true,
                  product: {
                    select: {
                      name: true,
                      sku: true,
                      unit: true,
                      salePrice: true,
                    },
                  },
                },
              },
              branchSupplyReceipt: {
                select: {
                  id: true,
                  receivedAt: true,
                  notes: true,
                  receivedBy: { select: { id: true, name: true } },
                  items: {
                    orderBy: { createdAt: 'asc' as const },
                    select: {
                      transferItemId: true,
                      productId: true,
                      productNameSnapshot: true,
                      unit: true,
                      sentKg: true,
                      sentPieces: true,
                      receivedKg: true,
                      receivedPieces: true,
                      differenceKg: true,
                      differencePieces: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      pointOfSaleDailyClose: {
        select: this.detailDailyCloseSelect(canViewCosts),
      },
      events: {
        take: 1,
        orderBy: { occurredAt: 'desc' as const },
        select: { occurredAt: true },
      },
    } as Prisma.BranchSupplyCycleSelect;
  }

  private detailItemSelect(canViewCosts: boolean) {
    return {
      id: true,
      cycleVersion: true,
      snapshotKey: true,
      productId: true,
      productNameSnapshot: true,
      productSkuSnapshot: true,
      productUnitSnapshot: true,
      unitPriceSnapshot: true,
      ...(canViewCosts
        ? {
            unitCostSnapshot: true,
          }
        : {}),
      deliveredKg: true,
      deliveredPieces: true,
      returnedKg: true,
      returnedPieces: true,
      expectedSoldKg: true,
      expectedSoldPieces: true,
      actualSoldKg: true,
      actualSoldPieces: true,
      expectedSalesAmount: true,
      ...(canViewCosts
        ? {
            expectedCostAmount: true,
            actualCostAmount: true,
            expectedProfitAmount: true,
            actualProfitAmount: true,
          }
        : {}),
    } as Prisma.BranchSupplyCycleItemSelect;
  }

  private detailDailyCloseSelect(canViewCosts: boolean) {
    return {
      id: true,
      businessDate: true,
      status: true,
      version: true,
      cashTotal: true,
      cardVoucherTotal: true,
      transferTotal: true,
      expenseTotal: true,
      grossSalesTotal: true,
      netCashExpected: true,
      cashCountedTotal: true,
      cashDifferenceTotal: true,
      ...(canViewCosts
        ? {
            purchaseCostTotal: true,
            grossProfitTotal: true,
            netProfitTotal: true,
          }
        : {}),
      updatedAt: true,
      cashMovements: {
        orderBy: { occurredAt: 'asc' as const },
        select: {
          id: true,
          type: true,
          movementChannel: true,
          amount: true,
          reason: true,
          reference: true,
          isOpening: true,
          occurredAt: true,
        },
      },
      payments: {
        where: { status: 'APPLIED' as const },
        orderBy: { paidAt: 'asc' as const },
        select: { id: true, amount: true, paymentMethod: true, paidAt: true },
      },
      sales: {
        where: { status: 'CONFIRMED' as const },
        select: {
          paymentType: true,
          total: true,
          payments: {
            where: { status: 'APPLIED' as const },
            select: { amount: true },
          },
        },
      },
      cashShifts: {
        orderBy: { openedAt: 'asc' as const },
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          initialCashFund: true,
          initialCashIn: true,
          initialCashOut: true,
          cashCountedTotal: true,
          cashDifferenceTotal: true,
          closeMode: true,
        },
      },
      differences: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          code: true,
          scope: true,
          unit: true,
          expectedValue: true,
          recordedValue: true,
          differenceValue: true,
          differenceType: true,
          status: true,
          reason: true,
          evidence: true,
        },
      },
    } as Prisma.PointOfSaleDailyCloseSelect;
  }

  private toDashboardCard(
    branch: LocationRecord,
    cycle: DashboardCycleRecord | undefined,
    canViewCosts: boolean,
  ) {
    if (!cycle) {
      return {
        branch: this.toLocation(branch),
        cycle: null,
        physical: null,
        financial: null,
        cash: null,
        warningCount: 0,
        lastActivityAt: null,
      };
    }

    const expectedFinancials = this.expectedFinancials(cycle);
    const financial: Record<string, string> = {
      expectedSales: expectedFinancials.expectedSales,
      actualSales: this.money(cycle.actualSalesTotal),
      creditSales: this.creditSales(cycle.pointOfSaleDailyClose?.sales),
    };
    const physical = this.physicalTotals(cycle.transfers);
    const deliveredKg = physical?.deliveredKg ?? Number(cycle.totalDeliveredKg);
    const deliveredPieces =
      physical?.deliveredPieces ?? Number(cycle.totalDeliveredPieces);
    const returnedKg = physical?.returnedKg ?? Number(cycle.totalReturnedKg);
    const returnedPieces =
      physical?.returnedPieces ?? Number(cycle.totalReturnedPieces);
    const expectedSoldKg =
      physical?.expectedSoldKg ?? Number(cycle.totalExpectedSoldKg);
    const expectedSoldPieces =
      physical?.expectedSoldPieces ?? Number(cycle.totalExpectedSoldPieces);
    if (canViewCosts) {
      financial.expectedCost = expectedFinancials.expectedCost;
      financial.actualCost = this.money(cycle.actualCostTotal);
      financial.expectedProfit = expectedFinancials.expectedProfit;
      financial.actualProfit = this.money(cycle.actualProfitTotal);
      financial.actualNetProfit = this.money(cycle.actualNetProfitTotal);
    }

    return {
      branch: this.toLocation(branch),
      cycle: {
        id: cycle.id,
        businessDate: this.dateOnly(cycle.businessDate),
        status: cycle.status,
        version: cycle.version,
      },
      physical: {
        deliveredKg: this.quantity(deliveredKg),
        deliveredPieces: this.quantity(deliveredPieces),
        returnedKg: this.quantity(returnedKg),
        returnedPieces: this.quantity(returnedPieces),
        expectedSoldKg: this.quantity(expectedSoldKg),
        expectedSoldPieces: this.quantity(expectedSoldPieces),
        actualSoldKg: this.quantity(cycle.totalActualSoldKg),
        actualSoldPieces: this.quantity(cycle.totalActualSoldPieces),
      },
      financial,
      cash: {
        expected: this.money(cycle.expectedCashTotal),
        counted: this.nullableMoney(cycle.cashCountedTotal),
        difference: this.nullableMoney(cycle.cashDifferenceTotal),
      },
      warningCount: this.warningCount(cycle),
      lastActivityAt: this.lastActivityDate(cycle)?.toISOString() ?? null,
    };
  }

  private toTotals(cycle: DetailCycleRecord, canViewCosts: boolean) {
    const physical = this.physicalTotals(cycle.transfers);
    const expectedFinancials = this.expectedFinancials(cycle);
    const deliveredKg = physical?.deliveredKg ?? Number(cycle.totalDeliveredKg);
    const deliveredPieces =
      physical?.deliveredPieces ?? Number(cycle.totalDeliveredPieces);
    const returnedKg = physical?.returnedKg ?? Number(cycle.totalReturnedKg);
    const returnedPieces =
      physical?.returnedPieces ?? Number(cycle.totalReturnedPieces);
    const totals: Record<string, string | null> = {
      deliveredKg: this.quantity(deliveredKg),
      deliveredPieces: this.quantity(deliveredPieces),
      returnedKg: this.quantity(returnedKg),
      returnedPieces: this.quantity(returnedPieces),
      expectedSoldKg: this.quantity(
        physical?.expectedSoldKg ?? Number(cycle.totalExpectedSoldKg),
      ),
      expectedSoldPieces: this.quantity(
        physical?.expectedSoldPieces ?? Number(cycle.totalExpectedSoldPieces),
      ),
      actualSoldKg: this.quantity(cycle.totalActualSoldKg),
      actualSoldPieces: this.quantity(cycle.totalActualSoldPieces),
      expectedSales: expectedFinancials.expectedSales,
      actualSales: this.money(cycle.actualSalesTotal),
      creditSales: this.creditSales(cycle.pointOfSaleDailyClose?.sales),
      expectedCash: this.money(cycle.expectedCashTotal),
      cashCounted: this.nullableMoney(cycle.cashCountedTotal),
      cashDifference: this.nullableMoney(cycle.cashDifferenceTotal),
    };
    if (canViewCosts) {
      totals.expectedCost = expectedFinancials.expectedCost;
      totals.actualCost = this.money(cycle.actualCostTotal);
      totals.expectedProfit = expectedFinancials.expectedProfit;
      totals.actualProfit = this.money(cycle.actualProfitTotal);
      totals.actualNetProfit = this.money(cycle.actualNetProfitTotal);
    }
    return totals;
  }

  private physicalTotals(
    transfers:
      | Array<{
          role: string;
          inventoryTransfer: {
            status: string;
            items?: Array<{
              quantityKg: DecimalLike;
              quantityPieces: number | null;
            }>;
          };
        }>
      | undefined,
  ) {
    if (!transfers) return null;

    let hasLoadedItems = false;
    const totals = {
      deliveredKg: 0,
      deliveredPieces: 0,
      returnedKg: 0,
      returnedPieces: 0,
      expectedSoldKg: 0,
      expectedSoldPieces: 0,
    };

    for (const link of transfers) {
      const items = link.inventoryTransfer.items;
      if (!items) continue;
      hasLoadedItems = true;
      if (link.inventoryTransfer.status !== 'CONFIRMED') continue;
      if (link.role !== 'SUPPLY' && link.role !== 'RETURN') continue;

      for (const item of items) {
        const quantityKg = Number(item.quantityKg ?? 0);
        const quantityPieces = item.quantityPieces ?? 0;
        if (link.role === 'SUPPLY') {
          totals.deliveredKg += quantityKg;
          totals.deliveredPieces += quantityPieces;
        } else {
          totals.returnedKg += quantityKg;
          totals.returnedPieces += quantityPieces;
        }
      }
    }

    if (!hasLoadedItems) return null;
    totals.expectedSoldKg = totals.deliveredKg - totals.returnedKg;
    totals.expectedSoldPieces = totals.deliveredPieces - totals.returnedPieces;
    return totals;
  }

  private async detailItems(
    cycle: DetailCycleRecord,
    persistedItems: DetailItemRecord[],
    canViewCosts: boolean,
  ) {
    if (persistedItems.length > 0) {
      return persistedItems.map((item) =>
        this.toDetailItem(item, canViewCosts),
      );
    }

    const sales = await this.findSalesByProduct(cycle);
    return this.projectTransferItems(cycle, sales, canViewCosts);
  }

  private async findSalesByProduct(cycle: DetailCycleRecord) {
    const saleDelegate = (
      this.prisma as unknown as {
        sale?: {
          findMany(args: unknown): Promise<DetailSaleRecord[]>;
        };
      }
    ).sale;
    if (!saleDelegate) return new Map<string, DetailSalesAggregate>();

    const sales = await saleDelegate.findMany({
      where: {
        locationId: cycle.branchLocationId,
        businessDate: cycle.businessDate,
        status: 'CONFIRMED',
      },
      select: {
        items: {
          select: {
            productId: true,
            quantityKg: true,
            quantityPieces: true,
            total: true,
          },
        },
      },
    });
    const result = new Map<string, DetailSalesAggregate>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const current = result.get(item.productId) ?? {
          quantityKg: 0,
          quantityPieces: 0,
          salesAmount: Money.zero(),
        };
        current.quantityKg += Number(item.quantityKg ?? 0);
        current.quantityPieces += item.quantityPieces ?? 0;
        current.salesAmount = current.salesAmount.add(Money.from(item.total));
        result.set(item.productId, current);
      }
    }

    return result;
  }

  private projectTransferItems(
    cycle: DetailCycleRecord,
    sales: Map<string, DetailSalesAggregate>,
    canViewCosts: boolean,
  ) {
    const snapshots = new Map(
      (cycle.productSnapshots ?? []).map((snapshot) => [
        snapshot.productId,
        snapshot,
      ]),
    );
    const aggregates = new Map<
      string,
      {
        productName: string;
        productSku: string | null;
        unit: string;
        unitPrice: DecimalLike;
        unitCost: DecimalLike;
        deliveredKg: number;
        deliveredPieces: number;
        returnedKg: number;
        returnedPieces: number;
        snapshot: DashboardProductSnapshot | undefined;
      }
    >();

    for (const link of cycle.transfers) {
      if (
        link.inventoryTransfer.status !== 'CONFIRMED' ||
        (link.role !== 'SUPPLY' && link.role !== 'RETURN')
      ) {
        continue;
      }

      for (const item of link.inventoryTransfer.items) {
        const snapshot = snapshots.get(item.productId);
        const aggregate = aggregates.get(item.productId) ?? {
          productName: item.product.name,
          productSku: item.product.sku,
          unit:
            snapshot?.productUnitSnapshot ??
            item.unit ??
            item.product.unit ??
            ProductUnit.KG,
          unitPrice: snapshot?.unitPriceSnapshot ?? item.product.salePrice ?? 0,
          unitCost: snapshot?.unitCostSnapshot ?? 0,
          deliveredKg: 0,
          deliveredPieces: 0,
          returnedKg: 0,
          returnedPieces: 0,
          snapshot,
        };
        const quantityKg = Number(item.quantityKg ?? 0);
        const quantityPieces = item.quantityPieces ?? 0;
        if (link.role === 'SUPPLY') {
          aggregate.deliveredKg += quantityKg;
          aggregate.deliveredPieces += quantityPieces;
        } else {
          aggregate.returnedKg += quantityKg;
          aggregate.returnedPieces += quantityPieces;
        }
        aggregates.set(item.productId, aggregate);
      }
    }

    return [...aggregates.entries()].map(([productId, aggregate]) => {
      const expectedSoldKg = Math.max(
        aggregate.deliveredKg - aggregate.returnedKg,
        0,
      );
      const expectedSoldPieces = Math.max(
        aggregate.deliveredPieces - aggregate.returnedPieces,
        0,
      );
      const snapshot = aggregate.snapshot;
      const equivalent =
        snapshot?.equivalenceFromUnitSnapshot &&
        snapshot.equivalenceToUnitSnapshot
          ? {
              unitFrom: snapshot.equivalenceFromUnitSnapshot,
              unitTo: snapshot.equivalenceToUnitSnapshot,
              factor: snapshot.appliedEquivalentFactorSnapshot,
            }
          : null;
      const expectedQuantity = this.valuationQuantity(
        aggregate.unit,
        expectedSoldKg,
        expectedSoldPieces,
        snapshot?.appliedEquivalentFactorSnapshot,
        equivalent,
      );
      const expectedSales = Money.from(aggregate.unitPrice).multiply(
        expectedQuantity ?? 0,
      );
      const actual = sales.get(productId) ?? {
        quantityKg: 0,
        quantityPieces: 0,
        salesAmount: Money.zero(),
      };
      const result: Record<string, unknown> = {
        id: `projected-${productId}`,
        snapshotKey: productId,
        productId,
        name: aggregate.productName,
        sku: aggregate.productSku,
        unit: aggregate.unit,
        unitPrice: this.money(aggregate.unitPrice),
        deliveredKg: this.quantity(aggregate.deliveredKg),
        deliveredPieces: this.quantity(aggregate.deliveredPieces),
        returnedKg: this.quantity(aggregate.returnedKg),
        returnedPieces: this.quantity(aggregate.returnedPieces),
        expectedSoldKg: this.quantity(expectedSoldKg),
        expectedSoldPieces: this.quantity(expectedSoldPieces),
        actualSoldKg: this.quantity(actual.quantityKg),
        actualSoldPieces: this.quantity(actual.quantityPieces),
        expectedSales: this.money(expectedSales.toString()),
        actualSales: this.money(actual.salesAmount.toString()),
      };
      if (canViewCosts) {
        const expectedCost = Money.from(aggregate.unitCost).multiply(
          expectedQuantity ?? 0,
        );
        Object.assign(result, {
          unitCost: this.money(aggregate.unitCost),
          expectedCost: this.money(expectedCost.toString()),
          expectedProfit: this.money(
            expectedSales.subtract(expectedCost).toString(),
          ),
        });
      }
      return result;
    });
  }

  private toDetailItem(item: DetailItemRecord, canViewCosts: boolean) {
    const result: Record<string, unknown> = {
      id: item.id,
      snapshotKey: item.snapshotKey,
      productId: item.productId,
      name: item.productNameSnapshot,
      sku: item.productSkuSnapshot,
      unit: item.productUnitSnapshot,
      unitPrice: this.money(item.unitPriceSnapshot),
      deliveredKg: this.quantity(item.deliveredKg),
      deliveredPieces: this.quantity(item.deliveredPieces),
      returnedKg: this.quantity(item.returnedKg),
      returnedPieces: this.quantity(item.returnedPieces),
      expectedSoldKg: this.quantity(item.expectedSoldKg),
      expectedSoldPieces: this.quantity(item.expectedSoldPieces),
      actualSoldKg: this.quantity(item.actualSoldKg),
      actualSoldPieces: this.quantity(item.actualSoldPieces),
      expectedSales: this.money(item.expectedSalesAmount),
      actualSales: this.money(item.actualSalesAmount),
    };
    if (canViewCosts) {
      result.unitCost = this.money(item.unitCostSnapshot);
      result.expectedCost = this.money(item.expectedCostAmount);
      result.actualCost = this.money(item.actualCostAmount);
      result.expectedProfit = this.money(item.expectedProfitAmount);
      result.actualProfit = this.money(item.actualProfitAmount);
    }
    return result;
  }

  private expectedFinancials(cycle: DashboardCycleRecord) {
    const projection = this.projectExpectedFinancials(cycle);
    const expectedSales =
      projection?.sales ?? Money.from(cycle.expectedSalesTotal);
    const expectedCost =
      projection?.cost ?? Money.from(cycle.expectedCostTotal);
    const expectedProfit = projection?.cost
      ? expectedSales.subtract(projection.cost)
      : Money.from(cycle.expectedProfitTotal);

    return {
      expectedSales: expectedSales.toString(),
      expectedCost: expectedCost.toString(),
      expectedProfit: expectedProfit.toString(),
    };
  }

  // Confirmed transfers can update physical projections before refresh persists financial totals.
  private projectExpectedFinancials(cycle: DashboardCycleRecord): {
    sales: Money;
    cost: Money | null;
  } | null {
    const snapshots = new Map(
      (cycle.productSnapshots ?? []).map((snapshot) => [
        snapshot.productId,
        snapshot,
      ]),
    );
    let sales = Money.zero();
    let cost: Money | null = Money.zero();
    let hasTransferItems = false;

    for (const link of cycle.transfers ?? []) {
      if (
        (link.role !== 'SUPPLY' && link.role !== 'RETURN') ||
        link.inventoryTransfer.status !== 'CONFIRMED'
      ) {
        continue;
      }

      for (const item of link.inventoryTransfer.items ?? []) {
        if (link.role === 'SUPPLY') hasTransferItems = true;
        const snapshot = snapshots.get(item.productId);
        const productUnit = snapshot?.productUnitSnapshot ?? item.product?.unit;
        if (!productUnit) return null;
        const quantity = this.valuationQuantity(
          productUnit,
          item.quantityKg,
          item.quantityPieces,
          snapshot?.appliedEquivalentFactorSnapshot ??
            item.appliedEquivalentFactor,
          snapshot?.equivalenceFromUnitSnapshot &&
            snapshot.equivalenceToUnitSnapshot
            ? {
                unitFrom: snapshot.equivalenceFromUnitSnapshot,
                unitTo: snapshot.equivalenceToUnitSnapshot,
                factor:
                  snapshot.appliedEquivalentFactorSnapshot ??
                  item.unitEquivalent?.factor,
              }
            : item.unitEquivalent,
        );
        const unitPrice =
          snapshot?.unitPriceSnapshot ?? item.product?.salePrice;

        if (
          quantity === null ||
          unitPrice === null ||
          unitPrice === undefined
        ) {
          return null;
        }

        const value = Money.from(unitPrice).multiply(quantity);
        sales =
          link.role === 'SUPPLY' ? sales.add(value) : sales.subtract(value);

        if (link.role === 'SUPPLY' && cost !== null) {
          const unitCost = snapshot?.unitCostSnapshot;
          if (unitCost === null || unitCost === undefined) {
            cost = null;
          } else {
            cost = cost.add(Money.from(unitCost).multiply(quantity));
          }
        }
      }
    }

    return hasTransferItems ? { sales, cost } : null;
  }

  private valuationQuantity(
    unit: string | undefined,
    quantityKg: DecimalLike,
    quantityPieces: number | null,
    appliedFactor: DecimalLike,
    equivalent:
      | {
          unitFrom: string;
          unitTo: string;
          factor: DecimalLike;
        }
      | null
      | undefined,
  ): number | null {
    const kg = Number(quantityKg ?? 0);
    const pieces = Number(quantityPieces ?? 0);
    if (unit === ProductUnit.KG) return kg;
    if (unit === ProductUnit.PIECE) return pieces;
    if (kg > 0) return kg;
    if (pieces === 0) return 0;

    const factor = Number(appliedFactor ?? equivalent?.factor);
    if (!Number.isFinite(factor) || factor <= 0 || !equivalent) return null;
    if (
      equivalent.unitFrom === ProductUnit.PIECE &&
      equivalent.unitTo === ProductUnit.KG
    ) {
      return pieces * factor;
    }
    if (
      equivalent.unitFrom === ProductUnit.KG &&
      equivalent.unitTo === ProductUnit.PIECE
    ) {
      return pieces / factor;
    }
    return null;
  }

  private toTransfer(
    link: DetailTransferLinkRecord,
    balanceByItem?: Map<
      string,
      (InventoryBalanceAvailability & { locationId: string }) | null
    >,
  ) {
    const transfer = link.inventoryTransfer;
    return {
      id: link.id,
      role: link.role,
      linkedAt: link.linkedAt.toISOString(),
      transfer: {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        status: transfer.status,
        originLocationId: transfer.originLocationId,
        destinationLocationId: transfer.destinationLocationId,
        requestedAt: transfer.requestedAt?.toISOString() ?? null,
        confirmedAt: transfer.confirmedAt?.toISOString() ?? null,
        cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
        updatedAt: transfer.updatedAt.toISOString(),
        items: transfer.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          productSku: item.product.sku,
          unit: item.unit,
          quantityKg: this.nullableQuantity(item.quantityKg),
          quantityPieces: item.quantityPieces,
          ...(balanceByItem
            ? {
                balance: balanceByItem.get(`${transfer.id}:${item.id}`) ?? null,
              }
            : {}),
        })),
        receipt: transfer.branchSupplyReceipt
          ? {
              id: transfer.branchSupplyReceipt.id,
              receivedAt: transfer.branchSupplyReceipt.receivedAt.toISOString(),
              notes: transfer.branchSupplyReceipt.notes,
              receivedBy: transfer.branchSupplyReceipt.receivedBy,
              items: transfer.branchSupplyReceipt.items.map((item) => ({
                transferItemId: item.transferItemId,
                productId: item.productId,
                productName: item.productNameSnapshot,
                unit: item.unit,
                sentKg: this.quantity(item.sentKg),
                sentPieces: item.sentPieces,
                receivedKg: this.quantity(item.receivedKg),
                receivedPieces: item.receivedPieces,
                differenceKg: this.quantity(item.differenceKg),
                differencePieces: item.differencePieces,
              })),
            }
          : null,
      },
    };
  }

  private async findTransferBalances(
    links: DetailTransferLinkRecord[],
  ): Promise<
    Map<string, (InventoryBalanceAvailability & { locationId: string }) | null>
  > {
    const pairs = links.flatMap((link) =>
      link.inventoryTransfer.items.map((item) => ({
        key: `${link.inventoryTransfer.id}:${item.id}`,
        productId: item.productId,
        locationId: link.inventoryTransfer.originLocationId,
      })),
    );
    if (pairs.length === 0) return new Map();

    const balances = (await this.prisma.inventoryBalance.findMany({
      where: {
        OR: pairs.map(({ productId, locationId }) => ({
          productId,
          locationId,
        })),
      },
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
        reservedQuantityKg: true,
        reservedQuantityPieces: true,
      },
    })) as Array<{
      productId: string;
      locationId: string;
      quantityKg: DecimalLike;
      quantityPieces: number;
      reservedQuantityKg: DecimalLike;
      reservedQuantityPieces: number;
    }>;
    const byLocationAndProduct = new Map<
      string,
      InventoryBalanceAvailability & { locationId: string }
    >();
    for (const balance of balances ?? []) {
      byLocationAndProduct.set(`${balance.locationId}:${balance.productId}`, {
        locationId: balance.locationId,
        ...toInventoryBalanceAvailability(balance),
      });
    }

    return new Map(
      pairs.map((pair) => [
        pair.key,
        byLocationAndProduct.get(`${pair.locationId}:${pair.productId}`) ??
          null,
      ]),
    );
  }

  private toDailyClose(close: DetailDailyCloseRecord, canViewCosts: boolean) {
    const response: Record<string, unknown> = {
      id: close.id,
      businessDate: this.dateOnly(close.businessDate),
      status: close.status,
      version: close.version,
      totals: {
        cash: this.money(close.cashTotal),
        cardVoucher: this.money(close.cardVoucherTotal),
        transfer: this.money(close.transferTotal),
        expenses: this.money(close.expenseTotal),
        grossSales: this.money(close.grossSalesTotal),
        creditSales: this.creditSales(close.sales),
        netCashExpected: this.money(close.netCashExpected),
        cashCounted: this.nullableMoney(close.cashCountedTotal),
        cashDifference: this.nullableMoney(close.cashDifferenceTotal),
        ...(canViewCosts
          ? {
              purchaseCost: this.money(close.purchaseCostTotal),
              grossProfit: this.money(close.grossProfitTotal),
              netProfit: this.money(close.netProfitTotal),
            }
          : {}),
      },
      unresolvedDifferences: close.differences
        .filter((difference) => difference.status !== 'AUTHORIZED')
        .map((difference) => ({
          id: difference.id,
          code: difference.code,
          scope: difference.scope,
          unit: difference.unit,
          expectedValue: this.quantity(difference.expectedValue),
          recordedValue: this.nullableQuantity(difference.recordedValue),
          differenceValue: this.quantity(difference.differenceValue),
          differenceType: difference.differenceType,
          status: difference.status,
          reason: difference.reason,
          evidence: difference.evidence,
        })),
      updatedAt: close.updatedAt.toISOString(),
    };
    return response;
  }

  private toCashMovementSummary(close: DetailDailyCloseRecord) {
    const groups = new Map<
      string,
      {
        type: string;
        movementChannel: string;
        isOpening: boolean;
        count: number;
        grossAmount: Money;
        cashImpact: Money;
      }
    >();

    for (const movement of close.cashMovements) {
      const key = `${movement.type}:${movement.movementChannel}:${movement.isOpening}`;
      const group = groups.get(key) ?? {
        type: movement.type,
        movementChannel: movement.movementChannel,
        isOpening: movement.isOpening,
        count: 0,
        grossAmount: Money.zero(),
        cashImpact: Money.zero(),
      };
      group.count += 1;
      group.grossAmount = group.grossAmount.add(movement.amount);
      if (!movement.isOpening && movement.movementChannel === 'CASH') {
        group.cashImpact = group.cashImpact.add(
          movement.type === 'CASH_IN'
            ? movement.amount
            : Money.from(movement.amount).multiply(-1),
        );
      }
      groups.set(key, group);
    }

    const expenseTotal = Money.sum(
      close.cashMovements
        .filter((movement) => movement.type === 'EXPENSE')
        .map((movement) => movement.amount),
    );
    const cashInTotal = Money.sum(
      close.cashMovements
        .filter(
          (movement) =>
            movement.type === 'CASH_IN' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const cashOutTotal = Money.sum(
      close.cashMovements
        .filter(
          (movement) =>
            movement.type === 'CASH_OUT' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const cashAdjustmentTotal = Money.sum(
      close.cashMovements
        .filter(
          (movement) =>
            movement.type === 'ADJUSTMENT' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const paymentsByMethod = new Map<
      string,
      { count: number; amount: Money }
    >();
    for (const payment of close.payments) {
      const current = paymentsByMethod.get(payment.paymentMethod) ?? {
        count: 0,
        amount: Money.zero(),
      };
      current.count += 1;
      current.amount = current.amount.add(payment.amount);
      paymentsByMethod.set(payment.paymentMethod, current);
    }

    const activeShifts = close.cashShifts.filter(
      (shift) => shift.status !== 'CANCELLED',
    );
    const shiftCashCounted =
      activeShifts.length > 0 &&
      activeShifts.every(
        (shift) => shift.status === 'CLOSED' && shift.cashCountedTotal !== null,
      )
        ? Money.sum(activeShifts.map((shift) => shift.cashCountedTotal))
        : null;

    return {
      dailyCloseId: close.id,
      movementCount: close.cashMovements.length,
      expenseTotal: expenseTotal.toString(),
      cashInTotal: cashInTotal.toString(),
      cashOutTotal: cashOutTotal.toString(),
      cashAdjustmentTotal: cashAdjustmentTotal.toString(),
      movementsByTypeAndChannel: [...groups.values()]
        .sort((a, b) =>
          `${a.type}:${a.movementChannel}:${a.isOpening}`.localeCompare(
            `${b.type}:${b.movementChannel}:${b.isOpening}`,
          ),
        )
        .map((group) => ({
          type: group.type,
          movementChannel: group.movementChannel,
          isOpening: group.isOpening,
          count: group.count,
          grossAmount: group.grossAmount.toString(),
          cashImpact: group.cashImpact.toString(),
        })),
      paymentsByMethod: [...paymentsByMethod.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([paymentMethod, value]) => ({
          paymentMethod,
          count: value.count,
          amount: value.amount.toString(),
        })),
      shifts: {
        activeShiftCount: activeShifts.length,
        openShiftCount: activeShifts.filter((shift) => shift.status === 'OPEN')
          .length,
        openingCash: Money.sum(
          activeShifts.map((shift) =>
            Money.from(shift.initialCashFund)
              .add(shift.initialCashIn)
              .subtract(shift.initialCashOut),
          ),
        ).toString(),
        shiftCashCounted: shiftCashCounted?.toString() ?? null,
      },
    };
  }

  private warningCount(cycle: {
    transfers?: DashboardTransferActivity[];
    pointOfSaleDailyClose?: { differences: Array<{ status: string }> } | null;
  }) {
    const pendingTransfers = (cycle.transfers ?? []).filter((link) =>
      ['DRAFT', 'REQUESTED', 'IN_TRANSIT'].includes(
        link.inventoryTransfer.status,
      ),
    ).length;
    const unresolvedDifferences = (
      cycle.pointOfSaleDailyClose?.differences ?? []
    ).filter((difference) => difference.status !== 'AUTHORIZED').length;
    return pendingTransfers + unresolvedDifferences;
  }

  private lastActivityDate(cycle: {
    updatedAt: Date;
    events?: Array<{ occurredAt: Date }>;
    transfers?: DashboardTransferActivity[];
    pointOfSaleDailyClose?: { updatedAt: Date } | null;
  }) {
    return this.maxDate([
      cycle.updatedAt,
      ...(cycle.events ?? []).map((event) => event.occurredAt),
      ...(cycle.transfers ?? []).flatMap((link) => [
        link.linkedAt,
        link.inventoryTransfer.updatedAt,
      ]),
      ...(cycle.pointOfSaleDailyClose?.updatedAt
        ? [cycle.pointOfSaleDailyClose.updatedAt]
        : []),
    ]);
  }

  private maxDate(values: Array<Date | null | undefined>) {
    const valid = values.filter(
      (value): value is Date =>
        value instanceof Date && !Number.isNaN(value.getTime()),
    );
    if (valid.length === 0) return null;
    return new Date(Math.max(...valid.map((value) => value.getTime())));
  }

  private toLocation(location: LocationRecord) {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      address: location.address,
      latitude: this.nullableQuantity(location.latitude, 6),
      longitude: this.nullableQuantity(location.longitude, 6),
    };
  }

  private quantity(value: DecimalLike) {
    return new Prisma.Decimal(value ?? 0).toFixed(3);
  }

  private nullableQuantity(value: DecimalLike, scale = 3) {
    return value === null || value === undefined
      ? null
      : new Prisma.Decimal(value).toFixed(scale);
  }

  private money(value: DecimalLike) {
    return toMoneyString(value ?? 0);
  }

  private creditSales(
    sales:
      | Array<{
          paymentType: string;
          total: DecimalLike;
          payments?: Array<{ amount: DecimalLike }>;
        }>
      | undefined,
  ) {
    return Money.sum(
      (sales ?? [])
        .filter((sale) => sale.paymentType === 'CREDIT_SALE')
        .map((sale) => {
          const paid = Money.sum(
            (sale.payments ?? []).map((payment) => payment.amount),
          );
          const outstanding = Money.from(sale.total).subtract(paid);
          return outstanding.compare(Money.zero()) > 0
            ? outstanding
            : Money.zero();
        }),
    ).toString();
  }

  private nullableMoney(value: DecimalLike) {
    return value === null || value === undefined ? null : toMoneyString(value);
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private parseDateOnly(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('INVALID_BUSINESS_DATE');
    }
    return date;
  }

  private canViewCosts(actor: QueryActor) {
    return actor.permissions?.includes(PERMISSIONS.CEDIS_VIEW_COSTS) ?? false;
  }

  private async assertDashboardScope(
    cedisLocationId: string,
    actor: QueryActor,
  ): Promise<void> {
    if (actor.role === 'ADMIN') return;
    if (
      actor.role === 'WAREHOUSE' &&
      actor.operationalLocationId === cedisLocationId
    ) {
      return;
    }
    if (actor.role === 'SELLER' && actor.operationalLocationId) {
      const branch = await this.prisma.operationalLocation.findUnique({
        where: { id: actor.operationalLocationId },
        select: { id: true, type: true, parentId: true, isActive: true },
      });
      if (
        branch?.type === 'BRANCH' &&
        branch.isActive &&
        branch.parentId === cedisLocationId
      ) {
        return;
      }
    }
    throw this.locationForbidden();
  }

  private assertCycleScope(
    cycle: Pick<
      DetailCycleRecord,
      'distributionCenterLocationId' | 'branchLocationId'
    >,
    actor: QueryActor,
  ) {
    if (actor.role === 'ADMIN') return;
    const allowed =
      (actor.role === 'WAREHOUSE' &&
        actor.operationalLocationId === cycle.distributionCenterLocationId) ||
      (actor.role === 'SELLER' &&
        actor.operationalLocationId === cycle.branchLocationId);
    if (!allowed) throw this.locationForbidden();
  }

  private locationForbidden() {
    return new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }

  private timeZone() {
    return (
      this.config.get<string>('app.timezone') ??
      process.env.APP_TIMEZONE?.trim() ??
      'America/Mexico_City'
    );
  }
}
