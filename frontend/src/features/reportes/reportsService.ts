import { apiClient } from '../../lib/api'
import type {
  AccountsReceivableReport,
  AccountsReceivableReportFilters,
  CashClosingReport,
  CashClosingReportFilters,
  DashboardReport,
  DashboardReportFilters,
  DeliveryOperationsReport,
  DeliveryOperationsReportFilters,
  InventoryReport,
  InventoryReportFilters,
  SalesDailyReport,
  SalesDailyReportFilters,
} from './types'

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T } | T
type ReportFilters = Record<string, boolean | number | string | undefined>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapData<T>(response: ApiEnvelope<T>): T {
  if (isRecord(response) && 'data' in response) return response.data as T
  return response as T
}

function authHeaders(accessToken?: string | null): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {}
}

function withParams(path: string, filters: ReportFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

async function getReport<TReport>(path: string, filters: ReportFilters, accessToken?: string | null) {
  const response = await apiClient.get<ApiEnvelope<TReport>>(withParams(path, filters), {
    headers: authHeaders(accessToken),
  })

  return unwrapData(response)
}

export const reportsService = {
  getAccountsReceivable(filters: AccountsReceivableReportFilters, accessToken?: string | null) {
    return getReport<AccountsReceivableReport>('/reports/accounts-receivable', filters, accessToken)
  },
  getCashClosing(filters: CashClosingReportFilters, accessToken?: string | null) {
    return getReport<CashClosingReport>('/reports/cash-closing', filters, accessToken)
  },
  getDashboard(filters: DashboardReportFilters, accessToken?: string | null) {
    return getReport<DashboardReport>('/reports/dashboard', filters, accessToken)
  },
  getDeliveryOperations(filters: DeliveryOperationsReportFilters, accessToken?: string | null) {
    return getReport<DeliveryOperationsReport>('/reports/delivery-operations', filters, accessToken)
  },
  getInventoryByLocation(filters: InventoryReportFilters, accessToken?: string | null) {
    return getReport<InventoryReport>('/reports/inventory-by-location', filters, accessToken)
  },
  getInventoryLowStock(filters: InventoryReportFilters, accessToken?: string | null) {
    return getReport<InventoryReport>('/reports/inventory-low-stock', filters, accessToken)
  },
  getSalesDaily(filters: SalesDailyReportFilters, accessToken?: string | null) {
    return getReport<SalesDailyReport>('/reports/sales-daily', filters, accessToken)
  },
}
