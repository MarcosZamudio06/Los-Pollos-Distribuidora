import { apiClient } from '@/lib/api'
import type { SaleOrder } from '@/lib/salesSocket'

type ApiEnvelope<T> = { data?: T } | T

export type BranchOrderFilters = {
  dateFrom?: string
  dateTo?: string
  limit?: number
  locationId: string
  paymentType?: 'CASH_SALE' | 'CREDIT_SALE' | ''
  saleChannel?: 'COUNTER' | 'EXTERNAL_POINT_OF_SALE' | 'ROUTE' | 'INSTITUTIONAL' | 'WHOLESALE' | ''
}

function unwrap<T>(response: ApiEnvelope<T>): T {
  return typeof response === 'object' && response !== null && 'data' in response
    ? response.data as T
    : response as T
}

export const ordersService = {
  async listBranchOrders(filters: BranchOrderFilters, accessToken?: string | null) {
    const query = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, String(value))
    })
    const response = await apiClient.get<ApiEnvelope<{ items: SaleOrder[] }>>(`/sales/orders?${query.toString()}`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    })
    return unwrap(response)
  },
}
