import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { reportsService } from './reportsService'
import type {
  AccountsReceivableReportFilters,
  CashClosingReportFilters,
  DashboardReportFilters,
  DeliveryOperationsReportFilters,
  InventoryReportFilters,
  SalesDailyReportFilters,
} from './types'

const REPORT_REFRESH_INTERVAL_MS = 60_000

export function useDashboardReport(filters: DashboardReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ['reports', 'dashboard', filters],
    queryFn: () => reportsService.getDashboard(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useSalesDailyReport(filters: SalesDailyReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken && filters.date),
    queryKey: ['reports', 'sales-daily', filters],
    queryFn: () => reportsService.getSalesDaily(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useCashClosingReport(filters: CashClosingReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken && filters.date),
    queryKey: ['reports', 'cash-closing', filters],
    queryFn: () => reportsService.getCashClosing(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useInventoryLowStockReport(filters: InventoryReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ['reports', 'inventory-low-stock', filters],
    queryFn: () => reportsService.getInventoryLowStock(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useInventoryByLocationReport(filters: InventoryReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ['reports', 'inventory-by-location', filters],
    queryFn: () => reportsService.getInventoryByLocation(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useAccountsReceivableReport(filters: AccountsReceivableReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ['reports', 'accounts-receivable', filters],
    queryFn: () => reportsService.getAccountsReceivable(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}

export function useDeliveryOperationsReport(filters: DeliveryOperationsReportFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ['reports', 'delivery-operations', filters],
    queryFn: () => reportsService.getDeliveryOperations(filters, accessToken),
    refetchInterval: REPORT_REFRESH_INTERVAL_MS,
  })
}
