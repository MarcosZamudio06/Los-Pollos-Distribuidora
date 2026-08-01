export type ReportFreshness = {
  dataAsOf?: string | null;
  freshnessSeconds?: number | null;
  generatedAt?: string | null;
  isStale?: boolean | null;
};

export type DashboardReportFilters = {
  date?: string;
  locationId?: string;
};

export type BaseReportFilters = {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
  userId?: string;
};

export type SalesDailyReportFilters = BaseReportFilters & {
  documentType?: string;
  paymentMethod?: string;
  paymentType?: string;
};

export type CashClosingReportFilters = BaseReportFilters;

export type InventoryReportFilters = {
  categoryId?: string;
  locationId?: string;
  productId?: string;
  search?: string;
};

export type AccountsReceivableReportFilters = {
  agingStatus?: string;
  customerId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  onlyDueSoon?: boolean;
  onlyOverdue?: boolean;
  status?: string;
};

export type DeliveryOperationsReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  routeId?: string;
  status?: string;
};

/** API responses are canonical strings; number remains for legacy fixtures during cutover. */
export type MoneyValue = string | number;

export type MoneyGroup = {
  amount: MoneyValue;
  bankName?: string | null;
  count?: number;
  paymentMethod?: string | null;
  method?: string | null;
};

export type DashboardSalesToday = {
  cash: MoneyValue;
  count: number;
  credit: MoneyValue;
  total: MoneyValue;
};

export type DashboardOverdueReceivables = {
  balance: MoneyValue;
  count: number;
};

export type InventoryReportItem = {
  isLowStock?: boolean;
  lastMovementAt?: string | null;
  locationId: string;
  locationName?: string | null;
  minQuantityKg?: number | null;
  minQuantityPieces?: number | null;
  productId: string;
  productName?: string | null;
  quantityKg?: number | null;
  quantityPieces?: number | null;
  sku?: string | null;
  unit?: string | null;
};

export type DashboardLowStockItem = InventoryReportItem & {
  status?: string | null;
};

export type DashboardDeliverySummary = {
  delivered: number;
  inRoute: number;
  incident: number;
  pending: number;
};

export type DashboardTopProduct = {
  amount?: MoneyValue;
  count?: number;
  productId?: string;
  productName?: string | null;
  quantityKg?: number | null;
  quantityPieces?: number | null;
  total?: MoneyValue;
};

export type DashboardReport = ReportFreshness & {
  billingRequestsToday?: number;
  cashSalesToday: MoneyValue;
  collectionsToday: MoneyValue;
  customersBlockedForCredit?: number;
  deliverySummary: DashboardDeliverySummary;
  lowStockByLocation: DashboardLowStockItem[];
  overdueReceivables: DashboardOverdueReceivables;
  paymentsByBankToday?: MoneyGroup[];
  paymentsByMethodToday?: MoneyGroup[];
  routeCollectionsPendingSettlement: MoneyValue;
  salesToday: DashboardSalesToday;
  topProducts: DashboardTopProduct[];
};

export type CountAmountSummary = {
  amount?: MoneyValue;
  count?: number;
  label?: string | null;
  status?: string | null;
  total?: MoneyValue;
};

export type SalesDailyReportItem = {
  clientName?: string | null;
  collectionStatus?: string | null;
  customerName?: string | null;
  documentNumber?: string | null;
  documentType?: string | null;
  locationName?: string | null;
  paymentMethods?: string[];
  paymentType?: string | null;
  saleId?: string;
  saleNumber?: string | null;
  sellerName?: string | null;
  total?: MoneyValue;
};

export type SalesDailyReport = ReportFreshness & {
  agingSummary?: CountAmountSummary[];
  byDocumentType?: CountAmountSummary[];
  byPaymentMethod?: MoneyGroup[];
  bySeller?: CountAmountSummary[];
  canceledNotes?: SalesDailyReportItem[];
  collectionStatusSummary?: CountAmountSummary[];
  date?: string;
  items?: SalesDailyReportItem[];
  locationId?: string | null;
  summary?: {
    canceled?: MoneyValue;
    cash?: MoneyValue;
    count?: number;
    credit?: MoneyValue;
    discounts?: MoneyValue;
    subtotal?: MoneyValue;
    total?: MoneyValue;
  };
};

export type CashClosingReport = ReportFreshness & {
  accountsReceivablePayments?: MoneyGroup[];
  bankTransfersAndDeposits?: MoneyGroup[];
  cashSales?: MoneyGroup[];
  creditSales?: CountAmountSummary;
  paymentsByBank?: MoneyGroup[];
  routeCollections?: MoneyGroup[];
  sellerSummary?: CountAmountSummary[];
  totalsByPaymentMethod?: MoneyGroup[];
};

export type InventoryReport = ReportFreshness & {
  items?: InventoryReportItem[];
};

export type AccountsReceivableReportItem = {
  accountReceivableId?: string;
  agingStatus?: string | null;
  balance?: MoneyValue;
  clientName?: string | null;
  customerName?: string | null;
  dueDate?: string | null;
  physicalFolio?: string | null;
  saleId?: string | null;
  saleNumber?: string | null;
  status?: string | null;
};

export type AccountsReceivableByCustomer = {
  billedBalance?: MoneyValue;
  creditStatus?: string | null;
  customerId?: string;
  customerName?: string | null;
  dueSoon?: MoneyValue;
  finalBalance?: MoneyValue;
  lastPaymentAt?: string | null;
  overdue?: MoneyValue;
  paidBalance?: MoneyValue;
};

export type AccountsReceivableReport = ReportFreshness & {
  byCustomer?: AccountsReceivableByCustomer[];
  items?: AccountsReceivableReportItem[];
  paymentsByBank?: MoneyGroup[];
  paymentsByMethod?: MoneyGroup[];
  summary?: {
    blockedCustomers?: number;
    finalBalanceByCustomer?: MoneyValue;
    originalBalance?: MoneyValue;
    overdueBalance?: MoneyValue;
    overdueCredit?: MoneyValue;
    paymentsInPeriod?: MoneyValue;
    pendingBalance?: MoneyValue;
  };
};

export type DeliveryOperationsReport = ReportFreshness & {
  collectionsSummary?: MoneyGroup[];
  deliverySummary?: Record<string, number>;
  evidenceSummary?: Record<string, number>;
  incidents?: Array<{
    description?: string | null;
    routeName?: string | null;
    severity?: string | null;
    status?: string | null;
    type?: string | null;
  }>;
  settlementsSummary?: Record<string, number>;
};
