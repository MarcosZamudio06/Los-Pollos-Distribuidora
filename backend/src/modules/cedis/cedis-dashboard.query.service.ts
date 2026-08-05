import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BranchSupplyCycleStatus, Prisma } from '@prisma/client';
import { toMoneyString, Money } from '../../../../shared/money';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
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
  events?: Array<{ occurredAt: Date }>;
};

type DashboardDailyCloseRecord = {
  id: string;
  updatedAt: Date;
  differences: Array<{ status: string }>;
};

type DashboardTransferActivity = {
  linkedAt: Date;
  inventoryTransfer: { status: string; updatedAt: Date };
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
  product: { name: string; sku: string | null };
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
    },
  },
  transfers: {
    select: {
      linkedAt: true,
      inventoryTransfer: { select: { status: true, updatedAt: true } },
    },
  },
  events: {
    take: 1,
    orderBy: { occurredAt: 'desc' as const },
    select: { occurredAt: true },
  },
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
    this.assertDashboardScope(query.cedisLocationId, actor);
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
    const items = cycle.items.filter(
      (item) => item.cycleVersion === itemVersion,
    );
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
      items: items.map((item) => this.toDetailItem(item, canViewCosts)),
      transfers: cycle.transfers.map((link) => this.toTransfer(link)),
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
    } as Prisma.BranchSupplyCycleSelect;
  }

  private detailCycleSelect(canViewCosts: boolean) {
    return {
      ...DASHBOARD_CYCLE_SELECT,
      ...(canViewCosts ? COST_TOTAL_SELECT : {}),
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
                  product: { select: { name: true, sku: true } },
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

    const financial: Record<string, string> = {
      expectedSales: this.money(cycle.expectedSalesTotal),
      actualSales: this.money(cycle.actualSalesTotal),
    };
    if (canViewCosts) {
      financial.expectedCost = this.money(cycle.expectedCostTotal);
      financial.actualCost = this.money(cycle.actualCostTotal);
      financial.expectedProfit = this.money(cycle.expectedProfitTotal);
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
        deliveredKg: this.quantity(cycle.totalDeliveredKg),
        deliveredPieces: this.quantity(cycle.totalDeliveredPieces),
        returnedKg: this.quantity(cycle.totalReturnedKg),
        returnedPieces: this.quantity(cycle.totalReturnedPieces),
        expectedSoldKg: this.quantity(cycle.totalExpectedSoldKg),
        expectedSoldPieces: this.quantity(cycle.totalExpectedSoldPieces),
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
    const totals: Record<string, string | null> = {
      deliveredKg: this.quantity(cycle.totalDeliveredKg),
      deliveredPieces: this.quantity(cycle.totalDeliveredPieces),
      returnedKg: this.quantity(cycle.totalReturnedKg),
      returnedPieces: this.quantity(cycle.totalReturnedPieces),
      expectedSoldKg: this.quantity(cycle.totalExpectedSoldKg),
      expectedSoldPieces: this.quantity(cycle.totalExpectedSoldPieces),
      actualSoldKg: this.quantity(cycle.totalActualSoldKg),
      actualSoldPieces: this.quantity(cycle.totalActualSoldPieces),
      expectedSales: this.money(cycle.expectedSalesTotal),
      actualSales: this.money(cycle.actualSalesTotal),
      expectedCash: this.money(cycle.expectedCashTotal),
      cashCounted: this.nullableMoney(cycle.cashCountedTotal),
      cashDifference: this.nullableMoney(cycle.cashDifferenceTotal),
    };
    if (canViewCosts) {
      totals.expectedCost = this.money(cycle.expectedCostTotal);
      totals.actualCost = this.money(cycle.actualCostTotal);
      totals.expectedProfit = this.money(cycle.expectedProfitTotal);
      totals.actualProfit = this.money(cycle.actualProfitTotal);
      totals.actualNetProfit = this.money(cycle.actualNetProfitTotal);
    }
    return totals;
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

  private toTransfer(link: DetailTransferLinkRecord) {
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
        })),
      },
    };
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

  private assertDashboardScope(cedisLocationId: string, actor: QueryActor) {
    if (actor.role === 'ADMIN') return;
    if (
      actor.role === 'WAREHOUSE' &&
      actor.operationalLocationId === cedisLocationId
    ) {
      return;
    }
    if (actor.role === 'SELLER' && actor.operationalLocationId) return;
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
