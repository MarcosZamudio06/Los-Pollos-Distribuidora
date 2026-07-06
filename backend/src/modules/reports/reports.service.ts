import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CollectionStatus,
  PaymentStatus,
  Prisma,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  CashClosingReportQueryDto,
  DashboardReportQueryDto,
  InventoryLowStockReportQueryDto,
  SalesDailyReportQueryDto,
} from './dto';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;
type ReportUser = Pick<AuthenticatedUser, 'id' | 'role'>;
type FreshnessMeta = {
  generatedAt: string;
  dataAsOf: string;
  freshnessSeconds: number;
  isStale: boolean;
};

type PaymentRecord = {
  amount: DecimalLike;
  paymentMethod: string;
  bankName?: string | null;
  status?: string;
  routeId?: string | null;
  accountReceivableId?: string | null;
  userId?: string;
  paidAt?: Date;
};

type SaleRecord = {
  id: string;
  saleNumber?: string;
  customer?: { name?: string | null } | null;
  user?: { id: string; name?: string | null } | null;
  userId?: string;
  location?: { id?: string; name?: string | null } | null;
  locationId?: string;
  paymentType: string;
  collectionStatus?: string;
  documentType?: string;
  physicalFolio?: string | null;
  subtotal?: DecimalLike;
  discount?: DecimalLike;
  total: DecimalLike;
  status?: string;
  cancellationReason?: string | null;
  updatedAt?: Date;
  payments?: PaymentRecord[];
  accountReceivable?: { agingStatus?: string; outstandingAmount?: DecimalLike } | null;
};

type InventoryBalanceRecord = {
  productId: string;
  locationId: string;
  quantityKg: DecimalLike;
  quantityPieces: number;
  minQuantityKg?: DecimalLike;
  minQuantityPieces?: number;
  updatedAt?: Date;
  product?: { name?: string; sku?: string | null; unit?: string; categoryId?: string | null } | null;
  location?: { name?: string | null } | null;
};

type ReceivableRecord = {
  outstandingAmount: DecimalLike;
  updatedAt?: Date;
};

type RouteSettlementRecord = {
  expectedCashAmount?: DecimalLike;
  expectedTransferAmount?: DecimalLike;
  paidAtDeliveryAmount?: DecimalLike;
  secondPassCollectionsAmount?: DecimalLike;
  updatedAt?: Date;
};

const FRESHNESS_TARGET_SECONDS = 60;
const ACTIVE_PAYMENT_STATUSES = { not: PaymentStatus.CANCELLED } as const;
const ACTIVE_PAYMENT_STATUSES_IN = { in: [PaymentStatus.REGISTERED, PaymentStatus.APPLIED] } as const;
const SALE_REPORT_STATUSES = [SaleStatus.CONFIRMED, SaleStatus.CANCELLED] as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: DashboardReportQueryDto, user: ReportUser) {
    const range = this.resolveDateRange(query.date);
    const baseSaleWhere = this.applySalesScope({
      createdAt: range,
      status: SaleStatus.CONFIRMED,
      ...(query.locationId ? { locationId: query.locationId } : {}),
    }, user);
    const paymentWhere = this.applyDashboardPaymentScope(this.applyPaymentScope({
      paidAt: range,
      status: ACTIVE_PAYMENT_STATUSES_IN,
      ...(query.locationId ? { operationalLocationId: query.locationId } : {}),
    }, user), user);

    const canViewSales = user.role === 'ADMIN' || user.role === 'SELLER';
    const canViewInventory = user.role === 'ADMIN' || user.role === 'WAREHOUSE';
    const canViewCollections = user.role === 'ADMIN' || user.role === 'COLLECTIONS';
    const canViewDelivery = user.role === 'ADMIN' || user.role === 'DRIVER' || user.role === 'COLLECTIONS';
    const canViewRouteCollectionAmounts = user.role === 'ADMIN' || user.role === 'COLLECTIONS';

    const sales = canViewSales ? await this.findSales(baseSaleWhere) : [];
    const payments = canViewCollections || canViewSales ? this.filterDashboardPayments(await this.findPayments(paymentWhere), user) : [];
    const receivables = canViewCollections ? await this.findReceivables({ status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] } }) : [];
    const lowStock = canViewInventory ? await this.findLowStockBalances({ locationId: query.locationId }) : [];
    const routeSettlements = canViewRouteCollectionAmounts ? await this.findRouteSettlements({ status: 'OPEN' }) : [];

    const dataDates = [
      ...sales.map((sale) => sale.updatedAt),
      ...payments.map((payment) => payment.paidAt),
      ...receivables.map((receivable) => receivable.updatedAt),
      ...lowStock.map((balance) => balance.updatedAt),
      ...routeSettlements.map((settlement) => settlement.updatedAt),
    ];

    return {
      salesToday: this.summarizeSalesToday(sales),
      cashSalesToday: this.sumSalesByPaymentType(sales, SalePaymentType.CASH_SALE),
      collectionsToday: this.sumPayments(payments.filter((payment) => payment.accountReceivableId)),
      overdueReceivables: {
        balance: this.sumValues(receivables.map((receivable) => receivable.outstandingAmount)),
        count: receivables.length,
      },
      customersBlockedForCredit: canViewCollections ? await this.prisma.customer.count({ where: { creditStatus: { in: ['BLOCKED', 'SUSPENDED'] } } }) : 0,
      billingRequestsToday: canViewSales ? await this.prisma.billingRequest.count({ where: { requestedAt: range } }) : 0,
      paymentsByMethodToday: this.groupPayments(payments, 'paymentMethod'),
      paymentsByBankToday: this.groupPayments(payments.filter((payment) => payment.bankName), 'bankName'),
      lowStockByLocation: lowStock.map((balance) => this.toLowStockItem(balance)),
      deliverySummary: canViewDelivery ? await this.buildDeliverySummary(range, user) : this.emptyDeliverySummary(),
      routeCollectionsPendingSettlement: this.sumValues(routeSettlements.map((settlement) =>
        this.toNumber(settlement.paidAtDeliveryAmount) + this.toNumber(settlement.secondPassCollectionsAmount),
      )),
      topProducts: [],
      ...this.buildFreshnessMeta(dataDates),
    };
  }

  async getSalesDaily(query: SalesDailyReportQueryDto, user: ReportUser) {
    const range = this.resolveRequiredDateRange(query.date);
    const where = this.applySalesScope({
      createdAt: range,
      status: { in: [...SALE_REPORT_STATUSES] },
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.paymentType ? { paymentType: query.paymentType } : {}),
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.paymentMethod ? { payments: { some: { paymentMethod: query.paymentMethod, status: ACTIVE_PAYMENT_STATUSES } } } : {}),
    }, user, query.userId);

    const sales = await this.findSales(where);
    const activeSales = sales.filter((sale) => sale.status !== SaleStatus.CANCELLED);
    const cancelledSales = sales.filter((sale) => sale.status === SaleStatus.CANCELLED);

    return {
      date: query.date,
      locationId: query.locationId ?? null,
      summary: {
        count: sales.length,
        subtotal: this.sumValues(activeSales.map((sale) => sale.subtotal)),
        discounts: this.sumValues(activeSales.map((sale) => sale.discount)),
        total: this.sumValues(activeSales.map((sale) => sale.total)),
        cash: this.sumSalesByPaymentType(activeSales, SalePaymentType.CASH_SALE),
        credit: this.sumSalesByPaymentType(activeSales, SalePaymentType.CREDIT_SALE),
        cancelled: this.sumValues(cancelledSales.map((sale) => sale.total)),
      },
      collectionStatusSummary: this.groupSalesBy(activeSales, 'collectionStatus', 'collectionStatus'),
      agingSummary: this.buildAgingSummary(activeSales),
      byPaymentMethod: this.groupPayments(activeSales.flatMap((sale) => this.activePayments(sale)), 'paymentMethod'),
      byDocumentType: this.groupSalesBy(activeSales, 'documentType', 'documentType'),
      bySeller: this.groupBySeller(activeSales),
      items: sales.map((sale) => this.toSalesDailyItem(sale)),
      canceledNotes: cancelledSales.map((sale) => ({
        saleNumber: sale.saleNumber ?? null,
        customerName: sale.customer?.name ?? null,
        reason: sale.cancellationReason ?? null,
        amount: this.toNumber(sale.total),
      })),
      ...this.buildFreshnessMeta(sales.map((sale) => sale.updatedAt)),
    };
  }

  async getInventoryLowStock(query: InventoryLowStockReportQueryDto, _user: ReportUser) {
    const balances = await this.findLowStockBalances(query);
    const items = balances.map((balance) => this.toLowStockItem(balance));

    return {
      items,
      ...this.buildFreshnessMeta(balances.map((balance) => balance.updatedAt)),
    };
  }

  async getCashClosing(query: CashClosingReportQueryDto, user: ReportUser) {
    if (user.role === 'DRIVER' || user.role === 'WAREHOUSE' || user.role === 'COLLECTIONS') {
      throw new ForbiddenException('User cannot access cash closing report');
    }

    const range = this.resolveRequiredDateRange(query.date);
    const saleWhere = this.applySalesScope({
      createdAt: range,
      status: SaleStatus.CONFIRMED,
      ...(query.locationId ? { locationId: query.locationId } : {}),
    }, user, query.userId);
    const paymentWhere = this.applyPaymentScope({
      paidAt: range,
      status: ACTIVE_PAYMENT_STATUSES_IN,
      ...(query.locationId ? { operationalLocationId: query.locationId } : {}),
    }, user, query.userId);

    const sales = await this.findSales(saleWhere);
    const payments = await this.findPayments(paymentWhere);
    const cashSalePayments = sales
      .filter((sale) => sale.paymentType === SalePaymentType.CASH_SALE)
      .flatMap((sale) => this.activePayments(sale).filter((payment) => !payment.accountReceivableId && !payment.routeId));
    const accountsReceivablePayments = payments.filter((payment) => payment.accountReceivableId && !payment.routeId);
    const routeCollections = payments.filter((payment) => payment.routeId);
    const bankPayments = payments.filter((payment) => payment.paymentMethod === 'TRANSFER' || payment.paymentMethod === 'DEPOSIT');

    return {
      cashSales: this.groupPayments(cashSalePayments, 'paymentMethod'),
      creditSales: {
        amount: this.sumSalesByPaymentType(sales, SalePaymentType.CREDIT_SALE),
        count: sales.filter((sale) => sale.paymentType === SalePaymentType.CREDIT_SALE).length,
      },
      accountsReceivablePayments: this.groupPayments(accountsReceivablePayments, 'paymentMethod'),
      routeCollections: this.groupPayments(routeCollections, 'paymentMethod'),
      bankTransfersAndDeposits: this.groupPayments(bankPayments, 'paymentMethod'),
      totalsByPaymentMethod: this.groupPayments([...cashSalePayments, ...accountsReceivablePayments, ...routeCollections], 'paymentMethod'),
      paymentsByBank: this.groupPayments(payments.filter((payment) => payment.bankName), 'bankName'),
      sellerSummary: this.groupSellerClosing(sales, payments),
      ...this.buildFreshnessMeta([
        ...sales.map((sale) => sale.updatedAt),
        ...payments.map((payment) => payment.paidAt),
      ]),
    };
  }

  private findSales(where: Record<string, unknown>): Promise<SaleRecord[]> {
    return this.prisma.sale.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        payments: { where: { status: ACTIVE_PAYMENT_STATUSES }, orderBy: { paidAt: 'asc' } },
        accountReceivable: { select: { agingStatus: true, outstandingAmount: true } },
      },
      orderBy: { createdAt: 'asc' },
    }) as Promise<SaleRecord[]>;
  }

  private findPayments(where: Record<string, unknown>): Promise<PaymentRecord[]> {
    return this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'asc' },
    }) as Promise<PaymentRecord[]>;
  }

  private findReceivables(where: Record<string, unknown>): Promise<ReceivableRecord[]> {
    return this.prisma.accountReceivable.findMany({ where }) as Promise<ReceivableRecord[]>;
  }

  private findRouteSettlements(where: Record<string, unknown>): Promise<RouteSettlementRecord[]> {
    return this.prisma.routeSettlement.findMany({ where }) as Promise<RouteSettlementRecord[]>;
  }

  private async buildDeliverySummary(range: { gte: Date; lt: Date }, user: ReportUser) {
    const driverScope = user.role === 'DRIVER' ? { route: { driverId: user.id } } : {};

    const [pending, inRoute, delivered, incident] = await Promise.all([
      this.prisma.deliveryOrder.count({ where: { createdAt: range, status: 'PENDING', ...driverScope } }),
      this.prisma.deliveryOrder.count({ where: { createdAt: range, status: 'IN_ROUTE', ...driverScope } }),
      this.prisma.deliveryOrder.count({ where: { createdAt: range, status: 'DELIVERED', ...driverScope } }),
      this.prisma.deliveryOrder.count({ where: { createdAt: range, status: { in: ['NOT_DELIVERED', 'PARTIALLY_REJECTED', 'RETURNED'] }, ...driverScope } }),
    ]);

    return { pending, inRoute, delivered, incident };
  }

  private emptyDeliverySummary() {
    return { pending: 0, inRoute: 0, delivered: 0, incident: 0 };
  }

  private async findLowStockBalances(query: Pick<InventoryLowStockReportQueryDto, 'locationId' | 'categoryId' | 'productId' | 'page' | 'limit'>): Promise<InventoryBalanceRecord[]> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.categoryId ? { product: { categoryId: query.categoryId } } : {}),
      },
      include: { product: true, location: true },
      orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
    }) as InventoryBalanceRecord[];

    return this.paginateItems(balances.filter((balance) => this.isLowStock(balance)), query);
  }

  private buildPagination(query: { page?: number; limit?: number }) {
    const limit = query.limit;
    const page = query.page ?? 1;

    return {
      ...(limit ? { take: limit } : {}),
      ...(limit ? { skip: (page - 1) * limit } : {}),
    };
  }

  private paginateItems<T>(items: T[], query: { page?: number; limit?: number }) {
    if (!query.limit) {
      return items;
    }

    const start = ((query.page ?? 1) - 1) * query.limit;
    return items.slice(start, start + query.limit);
  }

  private applySalesScope(where: Record<string, unknown>, user: ReportUser, requestedUserId?: string) {
    if (user.role === 'SELLER') {
      return { ...where, userId: user.id };
    }

    if (requestedUserId && user.role === 'ADMIN') {
      return { ...where, userId: requestedUserId };
    }

    return where;
  }

  private applyDashboardPaymentScope(where: Record<string, unknown>, user: ReportUser) {
    if (user.role === 'COLLECTIONS') {
      return { ...where, OR: [{ accountReceivableId: { not: null } }, { routeId: { not: null } }] };
    }

    return where;
  }

  private filterDashboardPayments(payments: PaymentRecord[], user: ReportUser) {
    if (user.role !== 'COLLECTIONS') {
      return payments;
    }

    return payments.filter((payment) => payment.accountReceivableId || payment.routeId);
  }

  private applyPaymentScope(where: Record<string, unknown>, user: ReportUser, requestedUserId?: string) {
    if (user.role === 'SELLER') {
      return { ...where, userId: user.id };
    }

    if (requestedUserId && user.role === 'ADMIN') {
      return { ...where, userId: requestedUserId };
    }

    return where;
  }

  private resolveRequiredDateRange(date: string) {
    return this.resolveDateRange(date);
  }

  private resolveDateRange(date?: string) {
    const source = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    const start = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);

    return { gte: start, lt: end };
  }

  private summarizeSalesToday(sales: SaleRecord[]) {
    return {
      total: this.sumValues(sales.map((sale) => sale.total)),
      count: sales.length,
      cash: this.sumSalesByPaymentType(sales, SalePaymentType.CASH_SALE),
      credit: this.sumSalesByPaymentType(sales, SalePaymentType.CREDIT_SALE),
    };
  }

  private sumSalesByPaymentType(sales: SaleRecord[], paymentType: SalePaymentType) {
    return this.sumValues(sales.filter((sale) => sale.paymentType === paymentType).map((sale) => sale.total));
  }

  private activePayments(sale: SaleRecord) {
    return (sale.payments ?? []).filter((payment) => payment.status !== PaymentStatus.CANCELLED);
  }

  private toSalesDailyItem(sale: SaleRecord) {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber ?? null,
      customerName: sale.customer?.name ?? null,
      sellerId: sale.user?.id ?? sale.userId ?? null,
      sellerName: sale.user?.name ?? null,
      locationId: sale.location?.id ?? sale.locationId ?? null,
      locationName: sale.location?.name ?? null,
      paymentType: sale.paymentType,
      collectionStatus: sale.collectionStatus ?? null,
      paymentMethods: [...new Set(this.activePayments(sale).map((payment) => payment.paymentMethod))],
      documentType: sale.documentType ?? null,
      physicalFolio: sale.physicalFolio ?? null,
      total: this.toNumber(sale.total),
    };
  }

  private toLowStockItem(balance: InventoryBalanceRecord) {
    return {
      productId: balance.productId,
      productName: balance.product?.name,
      sku: balance.product?.sku ?? null,
      unit: balance.product?.unit,
      locationId: balance.locationId,
      locationName: balance.location?.name,
      quantityKg: this.toNumber(balance.quantityKg),
      quantityPieces: balance.quantityPieces ?? 0,
      minQuantityKg: this.toNumber(balance.minQuantityKg),
      minQuantityPieces: balance.minQuantityPieces ?? 0,
      isLowStock: this.isLowStock(balance),
    };
  }

  private isLowStock(balance: InventoryBalanceRecord) {
    return this.toNumber(balance.quantityKg) < this.toNumber(balance.minQuantityKg)
      || (balance.quantityPieces ?? 0) < (balance.minQuantityPieces ?? 0);
  }

  private buildAgingSummary(sales: SaleRecord[]) {
    const summary = new Map<string, { agingStatus: string; count: number; outstandingAmount: number }>();

    for (const sale of sales) {
      const agingStatus = sale.accountReceivable?.agingStatus;
      if (!agingStatus) continue;

      const current = summary.get(agingStatus) ?? { agingStatus, count: 0, outstandingAmount: 0 };
      current.count += 1;
      current.outstandingAmount = this.roundMoney(current.outstandingAmount + this.toNumber(sale.accountReceivable?.outstandingAmount ?? sale.total));
      summary.set(agingStatus, current);
    }

    return [...summary.values()];
  }

  private groupSalesBy(sales: SaleRecord[], field: keyof SaleRecord, label: string) {
    const grouped = new Map<string, { [key: string]: string | number }>();

    for (const sale of sales) {
      const rawKey = sale[field];
      if (!rawKey) continue;
      const key = String(rawKey);
      const current = grouped.get(key) ?? { [label]: key, count: 0, amount: 0 };
      current.count = Number(current.count) + 1;
      current.amount = this.roundMoney(Number(current.amount) + this.toNumber(sale.total));
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private groupBySeller(sales: SaleRecord[]) {
    const grouped = new Map<string, { sellerId: string | null; sellerName: string | null; count: number; total: number }>();

    for (const sale of sales) {
      const sellerId = sale.user?.id ?? sale.userId ?? null;
      const key = sellerId ?? 'unknown';
      const current = grouped.get(key) ?? { sellerId, sellerName: sale.user?.name ?? null, count: 0, total: 0 };
      current.count += 1;
      current.total = this.roundMoney(current.total + this.toNumber(sale.total));
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private groupSellerClosing(sales: SaleRecord[], payments: PaymentRecord[]) {
    const grouped = new Map<string, { sellerId: string | null; sellerName: string | null; cashSales: number; creditSales: number; collections: number; routeCollections: number }>();

    for (const sale of sales) {
      const sellerId = sale.user?.id ?? sale.userId ?? null;
      const key = sellerId ?? 'unknown';
      const current = grouped.get(key) ?? { sellerId, sellerName: sale.user?.name ?? null, cashSales: 0, creditSales: 0, collections: 0, routeCollections: 0 };
      if (sale.paymentType === SalePaymentType.CASH_SALE) current.cashSales = this.roundMoney(current.cashSales + this.toNumber(sale.total));
      if (sale.paymentType === SalePaymentType.CREDIT_SALE) current.creditSales = this.roundMoney(current.creditSales + this.toNumber(sale.total));
      grouped.set(key, current);
    }

    for (const payment of payments.filter((item) => item.accountReceivableId || item.routeId)) {
      const sellerId = payment.userId ?? null;
      const key = sellerId ?? 'unknown';
      const current = grouped.get(key) ?? { sellerId, sellerName: null, cashSales: 0, creditSales: 0, collections: 0, routeCollections: 0 };
      if (payment.routeId) {
        current.routeCollections = this.roundMoney(current.routeCollections + this.toNumber(payment.amount));
      } else {
        current.collections = this.roundMoney(current.collections + this.toNumber(payment.amount));
      }
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private groupPayments(payments: PaymentRecord[], field: 'paymentMethod' | 'bankName') {
    const grouped = new Map<string, { [key: string]: string | number }>();

    for (const payment of payments) {
      const rawKey = payment[field];
      if (!rawKey) continue;
      const key = String(rawKey);
      const current = grouped.get(key) ?? { [field]: key, amount: 0, count: 0 };
      current.amount = this.roundMoney(Number(current.amount) + this.toNumber(payment.amount));
      current.count = Number(current.count) + 1;
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private sumPayments(payments: PaymentRecord[]) {
    return this.sumValues(payments.map((payment) => payment.amount));
  }

  private sumValues(values: Array<DecimalLike | number>) {
    return this.roundMoney(values.reduce<number>((sum, value) => sum + this.toNumber(value), 0));
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return value.toNumber();
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildFreshnessMeta(dates: Array<Date | undefined>): FreshnessMeta {
    const generatedAtDate = new Date();
    const validDates = dates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
    const dataAsOfDate = validDates.length > 0
      ? new Date(Math.max(...validDates.map((date) => date.getTime())))
      : generatedAtDate;
    const freshnessSeconds = Math.max(0, Math.floor((generatedAtDate.getTime() - dataAsOfDate.getTime()) / 1000));

    return {
      generatedAt: generatedAtDate.toISOString(),
      dataAsOf: dataAsOfDate.toISOString(),
      freshnessSeconds,
      isStale: freshnessSeconds > FRESHNESS_TARGET_SECONDS,
    };
  }
}
