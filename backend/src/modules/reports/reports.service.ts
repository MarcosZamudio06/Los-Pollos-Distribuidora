import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AgingStatus,
  CollectionStatus,
  DeliveryOrderStatus,
  PaymentStatus,
  Prisma,
  RouteSettlementStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  AccountsReceivableReportQueryDto,
  CashClosingReportQueryDto,
  DashboardReportQueryDto,
  DeliveryOperationsReportQueryDto,
  InventoryByLocationReportQueryDto,
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
  collectionPass?: number | null;
  userId?: string;
  paidAt?: Date;
  route?: { id: string; name?: string | null; driverId?: string | null } | null;
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
  id?: string;
  customerId?: string;
  saleId?: string;
  originalAmount?: DecimalLike;
  outstandingAmount: DecimalLike;
  dueDate?: Date;
  status?: string;
  agingStatus?: string;
  physicalDocumentFolio?: string | null;
  updatedAt?: Date;
  customer?: { id: string; name: string; creditStatus?: string | null } | null;
  sale?: { id: string; saleNumber?: string | null } | null;
  payments?: PaymentRecord[];
};

type RouteSettlementRecord = {
  id?: string;
  routeId?: string;
  driverId?: string;
  status?: string;
  expectedCashAmount?: DecimalLike;
  expectedTransferAmount?: DecimalLike;
  differenceAmount?: DecimalLike;
  paidAtDeliveryAmount?: DecimalLike;
  secondPassCollectionsAmount?: DecimalLike;
  updatedAt?: Date;
};

type InventoryMovementRecord = {
  productId: string;
  locationId: string;
  createdAt: Date;
};

type DeliveryEvidenceRecord = {
  type: string;
  capturedAt?: Date;
};

type DeliveryOrderRecord = {
  id: string;
  routeId: string;
  saleId: string;
  accountReceivableId?: string | null;
  status: string;
  notes?: string | null;
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

  async getInventoryByLocation(query: InventoryByLocationReportQueryDto, _user: ReportUser) {
    const balances = await this.findInventoryBalances(query);
    const lastMovements = await this.findLastInventoryMovements(balances);
    const items = balances.map((balance) => this.toInventoryByLocationItem(balance, lastMovements));

    return {
      items,
      ...this.buildFreshnessMeta([
        ...balances.map((balance) => balance.updatedAt),
        ...lastMovements.values(),
      ]),
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

  async getAccountsReceivable(query: AccountsReceivableReportQueryDto, _user: ReportUser) {
    const receivables = await this.findDetailedReceivables(query);
    const activePayments = receivables.flatMap((receivable) => this.activeReceivablePayments(receivable));
    const paginatedReceivables = this.paginateItems(receivables, query);

    return {
      summary: {
        originalBalance: this.sumValues(receivables.map((receivable) => receivable.originalAmount)),
        outstandingBalance: this.sumValues(receivables.map((receivable) => receivable.outstandingAmount)),
        overdueBalance: this.sumValues(receivables
          .filter((receivable) => receivable.agingStatus === AgingStatus.OVERDUE)
          .map((receivable) => receivable.outstandingAmount)),
        paymentsInPeriod: this.sumPayments(activePayments),
        finalCustomerBalance: this.sumValues(receivables.map((receivable) => receivable.outstandingAmount)),
        customersBlockedForCredit: await this.prisma.customer.count({ where: { creditStatus: { in: ['BLOCKED', 'SUSPENDED'] } } }),
      },
      byCustomer: this.groupReceivablesByCustomer(receivables),
      items: paginatedReceivables.map((receivable) => this.toReceivableReportItem(receivable)),
      paymentsByMethod: this.groupPayments(activePayments, 'paymentMethod'),
      paymentsByBank: this.groupPayments(activePayments.filter((payment) => payment.bankName), 'bankName'),
      ...this.buildFreshnessMeta([
        ...receivables.map((receivable) => receivable.updatedAt),
        ...activePayments.map((payment) => payment.paidAt),
      ]),
    };
  }

  async getDeliveryOperations(query: DeliveryOperationsReportQueryDto, user: ReportUser) {
    const range = this.resolveOptionalDateRange(query.dateFrom, query.dateTo);
    const routeScope = this.buildDeliveryRouteScope(query, user);
    const deliveryWhere = {
      ...(range ? { createdAt: range } : {}),
      ...routeScope,
    };
    const paymentWhere = {
      ...(range ? { paidAt: range } : {}),
      status: ACTIVE_PAYMENT_STATUSES_IN,
      routeId: { not: null },
      ...this.buildPaymentRouteScope(query, user),
    };
    const settlementWhere = this.buildDeliveryRouteScope(query, user);

    const [deliverySummary, evidence, routePayments, settlements, incidents] = await Promise.all([
      this.buildDeliveryOperationsSummary(deliveryWhere),
      this.findDeliveryEvidence(range, routeScope),
      user.role === 'DRIVER' ? Promise.resolve([]) : this.findPaymentsWithRoute(paymentWhere),
      this.findRouteSettlements(settlementWhere),
      this.findDeliveryIncidents(deliveryWhere),
    ]);

    return {
      deliverySummary,
      evidenceSummary: this.groupEvidence(evidence),
      collectionsSummary: user.role === 'DRIVER' ? [] : this.groupRouteCollections(routePayments),
      settlementsSummary: this.summarizeSettlements(settlements),
      incidents: incidents.map((incident) => this.toDeliveryIncidentItem(incident)),
      ...this.buildFreshnessMeta([
        ...evidence.map((item) => item.capturedAt),
        ...routePayments.map((payment) => payment.paidAt),
        ...settlements.map((settlement) => settlement.updatedAt),
        ...incidents.map((incident) => incident.updatedAt),
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

  private findPaymentsWithRoute(where: Record<string, unknown>): Promise<PaymentRecord[]> {
    return this.prisma.payment.findMany({
      where,
      include: { route: { select: { id: true, name: true, driverId: true } } },
      orderBy: { paidAt: 'asc' },
    }) as Promise<PaymentRecord[]>;
  }

  private findDetailedReceivables(query: AccountsReceivableReportQueryDto): Promise<ReceivableRecord[]> {
    return this.prisma.accountReceivable.findMany({
      where: this.buildReceivableWhere(query),
      include: {
        customer: { select: { id: true, name: true, creditStatus: true } },
        sale: { select: { id: true, saleNumber: true } },
        payments: { where: { status: ACTIVE_PAYMENT_STATUSES }, orderBy: { paidAt: 'asc' } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }) as Promise<ReceivableRecord[]>;
  }

  private buildReceivableWhere(query: AccountsReceivableReportQueryDto) {
    const dueDate = this.resolveDateRangeFilter(query.dueDateFrom, query.dueDateTo);
    const agingStatus = query.onlyOverdue
      ? AgingStatus.OVERDUE
      : query.onlyDueSoon
        ? AgingStatus.DUE_SOON
        : query.agingStatus;

    return {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(agingStatus ? { agingStatus } : {}),
      ...(dueDate ? { dueDate } : {}),
    };
  }

  private async findInventoryBalances(query: InventoryByLocationReportQueryDto): Promise<InventoryBalanceRecord[]> {
    return this.prisma.inventoryBalance.findMany({
      where: {
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.categoryId || query.search ? {
          product: {
            ...(query.categoryId ? { categoryId: query.categoryId } : {}),
            ...(query.search ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            } : {}),
          },
        } : {}),
      },
      include: { product: true, location: true },
      orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
      ...this.buildPagination(query),
    }) as Promise<InventoryBalanceRecord[]>;
  }

  private async findLastInventoryMovements(balances: InventoryBalanceRecord[]) {
    const movementMap = new Map<string, Date>();

    if (balances.length === 0) {
      return movementMap;
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        OR: balances.map((balance) => ({
          productId: balance.productId,
          locationId: balance.locationId,
        })),
      },
      select: { productId: true, locationId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }) as InventoryMovementRecord[];

    for (const movement of movements) {
      const key = this.inventoryPairKey(movement.productId, movement.locationId);
      if (!movementMap.has(key)) {
        movementMap.set(key, movement.createdAt);
      }
    }

    return movementMap;
  }

  private findDeliveryEvidence(range: { gte: Date; lt: Date } | undefined, routeScope: Record<string, unknown>): Promise<DeliveryEvidenceRecord[]> {
    return this.prisma.deliveryEvidence.findMany({
      where: {
        ...(range ? { capturedAt: range } : {}),
        deliveryOrder: routeScope,
      },
      orderBy: { capturedAt: 'asc' },
    }) as Promise<DeliveryEvidenceRecord[]>;
  }

  private findDeliveryIncidents(where: Record<string, unknown>): Promise<DeliveryOrderRecord[]> {
    return this.prisma.deliveryOrder.findMany({
      where: {
        ...where,
        status: {
          in: [
            DeliveryOrderStatus.NOT_DELIVERED,
            DeliveryOrderStatus.PARTIALLY_REJECTED,
            DeliveryOrderStatus.RETURNED,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<DeliveryOrderRecord[]>;
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

  private async buildDeliveryOperationsSummary(where: Record<string, unknown>) {
    const [pending, inRoute, delivered, incident] = await Promise.all([
      this.prisma.deliveryOrder.count({ where: { ...where, status: DeliveryOrderStatus.PENDING } }),
      this.prisma.deliveryOrder.count({ where: { ...where, status: DeliveryOrderStatus.IN_ROUTE } }),
      this.prisma.deliveryOrder.count({ where: { ...where, status: DeliveryOrderStatus.DELIVERED } }),
      this.prisma.deliveryOrder.count({
        where: {
          ...where,
          status: {
            in: [
              DeliveryOrderStatus.NOT_DELIVERED,
              DeliveryOrderStatus.PARTIALLY_REJECTED,
              DeliveryOrderStatus.RETURNED,
            ],
          },
        },
      }),
    ]);

    return { pending, inRoute, delivered, incident };
  }

  private buildDeliveryRouteScope(query: DeliveryOperationsReportQueryDto, user: ReportUser) {
    const driverId = user.role === 'DRIVER' ? user.id : query.driverId;
    const routeFilters = {
      ...(driverId ? { driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return {
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(Object.keys(routeFilters).length > 0 ? { route: routeFilters } : {}),
    };
  }

  private buildPaymentRouteScope(query: DeliveryOperationsReportQueryDto, user: ReportUser) {
    const driverId = user.role === 'DRIVER' ? user.id : query.driverId;
    const routeFilters = {
      ...(driverId ? { driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return {
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(Object.keys(routeFilters).length > 0 ? { route: routeFilters } : {}),
    };
  }

  private toInventoryByLocationItem(balance: InventoryBalanceRecord, lastMovements: Map<string, Date>) {
    const lastMovementAt = lastMovements.get(this.inventoryPairKey(balance.productId, balance.locationId));

    return {
      locationId: balance.locationId,
      locationName: balance.location?.name,
      productId: balance.productId,
      productName: balance.product?.name,
      sku: balance.product?.sku ?? null,
      unit: balance.product?.unit,
      quantityKg: this.toNumber(balance.quantityKg),
      quantityPieces: balance.quantityPieces ?? 0,
      minQuantityKg: this.toNumber(balance.minQuantityKg),
      minQuantityPieces: balance.minQuantityPieces ?? 0,
      isLowStock: this.isLowStock(balance),
      lastMovementAt: lastMovementAt?.toISOString() ?? null,
    };
  }

  private inventoryPairKey(productId: string, locationId: string) {
    return `${productId}:${locationId}`;
  }

  private activeReceivablePayments(receivable: ReceivableRecord) {
    return (receivable.payments ?? []).filter((payment) => payment.status !== PaymentStatus.CANCELLED && payment.accountReceivableId !== null);
  }

  private toReceivableReportItem(receivable: ReceivableRecord) {
    return {
      id: receivable.id,
      customerId: receivable.customer?.id ?? receivable.customerId ?? null,
      customerName: receivable.customer?.name ?? null,
      saleId: receivable.sale?.id ?? receivable.saleId ?? null,
      saleNumber: receivable.sale?.saleNumber ?? null,
      dueDate: receivable.dueDate?.toISOString() ?? null,
      physicalFolio: receivable.physicalDocumentFolio ?? null,
      originalAmount: this.toNumber(receivable.originalAmount),
      outstandingAmount: this.toNumber(receivable.outstandingAmount),
      status: receivable.status ?? null,
      agingStatus: receivable.agingStatus ?? null,
    };
  }

  private groupReceivablesByCustomer(receivables: ReceivableRecord[]) {
    const grouped = new Map<string, {
      customerId: string | null;
      customerName: string | null;
      creditStatus: string | null;
      invoicedBalance: number;
      paidBalance: number;
      finalBalance: number;
      overdueBalance: number;
      dueSoonBalance: number;
      lastPaymentAt: string | null;
    }>();

    for (const receivable of receivables) {
      const customerId = receivable.customer?.id ?? receivable.customerId ?? null;
      const key = customerId ?? 'unknown';
      const current = grouped.get(key) ?? {
        customerId,
        customerName: receivable.customer?.name ?? null,
        creditStatus: receivable.customer?.creditStatus ?? null,
        invoicedBalance: 0,
        paidBalance: 0,
        finalBalance: 0,
        overdueBalance: 0,
        dueSoonBalance: 0,
        lastPaymentAt: null,
      };
      const originalAmount = this.toNumber(receivable.originalAmount);
      const outstandingAmount = this.toNumber(receivable.outstandingAmount);
      const paidAmount = this.sumPayments(this.activeReceivablePayments(receivable));
      const lastPayment = this.activeReceivablePayments(receivable)
        .map((payment) => payment.paidAt)
        .filter((date): date is Date => date instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      current.invoicedBalance = this.roundMoney(current.invoicedBalance + originalAmount);
      current.paidBalance = this.roundMoney(current.paidBalance + paidAmount);
      current.finalBalance = this.roundMoney(current.finalBalance + outstandingAmount);
      if (receivable.agingStatus === AgingStatus.OVERDUE) {
        current.overdueBalance = this.roundMoney(current.overdueBalance + outstandingAmount);
      }
      if (receivable.agingStatus === AgingStatus.DUE_SOON) {
        current.dueSoonBalance = this.roundMoney(current.dueSoonBalance + outstandingAmount);
      }
      if (lastPayment && (!current.lastPaymentAt || lastPayment.toISOString() > current.lastPaymentAt)) {
        current.lastPaymentAt = lastPayment.toISOString();
      }
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private groupEvidence(evidence: DeliveryEvidenceRecord[]) {
    const grouped = new Map<string, { evidenceType: string; count: number }>();

    for (const item of evidence) {
      const current = grouped.get(item.type) ?? { evidenceType: item.type, count: 0 };
      current.count += 1;
      grouped.set(item.type, current);
    }

    return [...grouped.values()];
  }

  private groupRouteCollections(payments: PaymentRecord[]) {
    const grouped = new Map<string, { routeId: string | null; routeName: string | null; paymentMethod: string; collectionPass: number | null; amount: number; count: number }>();

    for (const payment of payments) {
      const routeId = payment.route?.id ?? payment.routeId ?? null;
      const collectionPass = payment.collectionPass ?? null;
      const key = `${routeId ?? 'unknown'}:${payment.paymentMethod}:${collectionPass ?? 'none'}`;
      const current = grouped.get(key) ?? {
        routeId,
        routeName: payment.route?.name ?? null,
        paymentMethod: payment.paymentMethod,
        collectionPass,
        amount: 0,
        count: 0,
      };
      current.amount = this.roundMoney(current.amount + this.toNumber(payment.amount));
      current.count += 1;
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private summarizeSettlements(settlements: RouteSettlementRecord[]) {
    return {
      open: settlements.filter((settlement) => settlement.status === RouteSettlementStatus.OPEN).length,
      closed: settlements.filter((settlement) => settlement.status === RouteSettlementStatus.CLOSED).length,
      reviewRequired: settlements.filter((settlement) => settlement.status === RouteSettlementStatus.REVIEW_REQUIRED).length,
    };
  }

  private toDeliveryIncidentItem(incident: DeliveryOrderRecord) {
    return {
      id: incident.id,
      routeId: incident.routeId,
      saleId: incident.saleId,
      accountReceivableId: incident.accountReceivableId ?? null,
      status: incident.status,
      notes: incident.notes ?? null,
      updatedAt: incident.updatedAt?.toISOString() ?? null,
    };
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

  private resolveOptionalDateRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) {
      return undefined;
    }

    return this.resolveDateRangeFilter(dateFrom, dateTo);
  }

  private resolveDateRangeFilter(dateFrom?: string, dateTo?: string) {
    const startSource = dateFrom ?? dateTo;
    const endSource = dateTo ?? dateFrom;

    if (!startSource || !endSource) {
      return undefined;
    }

    const start = this.startOfUtcDay(startSource);
    const end = this.startOfUtcDay(endSource);
    end.setUTCDate(end.getUTCDate() + 1);

    return { gte: start, lt: end };
  }

  private resolveDateRange(date?: string) {
    const source = date ? `${date}T00:00:00.000Z` : new Date().toISOString();
    const start = this.startOfUtcDay(source);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);

    return { gte: start, lt: end };
  }

  private startOfUtcDay(value: string) {
    const source = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
    return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
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
