export type ReportFreshness = {
  dataAsOf?: string | null
  freshnessSeconds?: number | null
  generatedAt?: string | null
  isStale?: boolean | null
}

export type DashboardReportFilters = {
  date?: string
  locationId?: string
}

export type BaseReportFilters = {
  date?: string
  dateFrom?: string
  dateTo?: string
  locationId?: string
  userId?: string
}

export type SalesDailyReportFilters = BaseReportFilters & {
  documentType?: string
  paymentMethod?: string
  paymentType?: string
}

export type CashClosingReportFilters = BaseReportFilters

export type InventoryReportFilters = {
  categoryId?: string
  locationId?: string
  productId?: string
  search?: string
}

export type AccountsReceivableReportFilters = {
  agingStatus?: string
  customerId?: string
  dueDateFrom?: string
  dueDateTo?: string
  onlyDueSoon?: boolean
  onlyOverdue?: boolean
  status?: string
}

export type DeliveryOperationsReportFilters = {
  dateFrom?: string
  dateTo?: string
  driverId?: string
  routeId?: string
  status?: string
}

export type MoneyGroup = {
  amount: number
  bankName?: string | null
  count?: number
  paymentMethod?: string | null
  method?: string | null
}

export type DashboardSalesToday = {
  cash: number
  count: number
  credit: number
  total: number
}

export type DashboardOverdueReceivables = {
  balance: number
  count: number
}

export type InventoryReportItem = {
  isLowStock?: boolean
  lastMovementAt?: string | null
  locationId: string
  locationName?: string | null
  minQuantityKg?: number | null
  minQuantityPieces?: number | null
  productId: string
  productName?: string | null
  quantityKg?: number | null
  quantityPieces?: number | null
  sku?: string | null
  unit?: string | null
}

export type DashboardLowStockItem = InventoryReportItem & {
  status?: string | null
}

export type DashboardDeliverySummary = {
  delivered: number
  inRoute: number
  incident: number
  pending: number
}

export type DashboardTopProduct = {
  amount?: number
  count?: number
  productId?: string
  productName?: string | null
  quantityKg?: number | null
  quantityPieces?: number | null
  total?: number
}

export type DashboardReport = ReportFreshness & {
  billingRequestsToday?: number
  cashSalesToday: number
  collectionsToday: number
  customersBlockedForCredit?: number
  deliverySummary: DashboardDeliverySummary
  lowStockByLocation: DashboardLowStockItem[]
  overdueReceivables: DashboardOverdueReceivables
  paymentsByBankToday?: MoneyGroup[]
  paymentsByMethodToday?: MoneyGroup[]
  routeCollectionsPendingSettlement: number
  salesToday: DashboardSalesToday
  topProducts: DashboardTopProduct[]
}

export type CountAmountSummary = {
  amount?: number
  count?: number
  label?: string | null
  status?: string | null
  total?: number
}

export type SalesDailyReportItem = {
  clientName?: string | null
  collectionStatus?: string | null
  customerName?: string | null
  documentNumber?: string | null
  documentType?: string | null
  locationName?: string | null
  paymentMethods?: string[]
  paymentType?: string | null
  saleId?: string
  saleNumber?: string | null
  sellerName?: string | null
  total?: number
}

export type SalesDailyReport = ReportFreshness & {
  agingSummary?: CountAmountSummary[]
  byDocumentType?: CountAmountSummary[]
  byPaymentMethod?: MoneyGroup[]
  bySeller?: CountAmountSummary[]
  canceledNotes?: SalesDailyReportItem[]
  collectionStatusSummary?: CountAmountSummary[]
  date?: string
  items?: SalesDailyReportItem[]
  locationId?: string | null
  summary?: {
    canceled?: number
    cash?: number
    count?: number
    credit?: number
    discounts?: number
    subtotal?: number
    total?: number
  }
}

export type CashClosingReport = ReportFreshness & {
  accountsReceivablePayments?: MoneyGroup[]
  bankTransfersAndDeposits?: MoneyGroup[]
  cashSales?: MoneyGroup[]
  creditSales?: MoneyGroup[]
  paymentsByBank?: MoneyGroup[]
  routeCollections?: MoneyGroup[]
  sellerSummary?: CountAmountSummary[]
  totalsByPaymentMethod?: MoneyGroup[]
}

export type InventoryReport = ReportFreshness & {
  items?: InventoryReportItem[]
}

export type AccountsReceivableReportItem = {
  accountReceivableId?: string
  agingStatus?: string | null
  balance?: number
  clientName?: string | null
  customerName?: string | null
  dueDate?: string | null
  physicalFolio?: string | null
  saleId?: string | null
  saleNumber?: string | null
  status?: string | null
}

export type AccountsReceivableByCustomer = {
  billedBalance?: number
  creditStatus?: string | null
  customerId?: string
  customerName?: string | null
  dueSoon?: number
  finalBalance?: number
  lastPaymentAt?: string | null
  overdue?: number
  paidBalance?: number
}

export type AccountsReceivableReport = ReportFreshness & {
  byCustomer?: AccountsReceivableByCustomer[]
  items?: AccountsReceivableReportItem[]
  paymentsByBank?: MoneyGroup[]
  paymentsByMethod?: MoneyGroup[]
  summary?: {
    blockedCustomers?: number
    finalBalanceByCustomer?: number
    originalBalance?: number
    overdueBalance?: number
    overdueCredit?: number
    paymentsInPeriod?: number
    pendingBalance?: number
  }
}

export type DeliveryOperationsReport = ReportFreshness & {
  collectionsSummary?: MoneyGroup[]
  deliverySummary?: Record<string, number>
  evidenceSummary?: Record<string, number>
  incidents?: Array<{
    description?: string | null
    routeName?: string | null
    severity?: string | null
    status?: string | null
    type?: string | null
  }>
  settlementsSummary?: Record<string, number>
}
