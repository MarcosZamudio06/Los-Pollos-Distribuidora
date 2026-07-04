import { apiClient } from '../../lib/api'
import type { CancelSalePayload, CreateSalePayload, CreateSaleResponse, ListSalesFilters, SaleDetail, SaleDocument, SaleListItem, TicketData } from './types'

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T }
type ItemEnvelope<T> = ApiEnvelope<T> | T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapItem<T>(response: ItemEnvelope<T>) {
  const payload = response as unknown
  if (isRecord(payload) && 'data' in payload) return payload.data as T
  return payload as T
}

function authHeaders(accessToken?: string | null, idempotencyKey?: string) {
  return {
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }
}

export const salesService = {
  async listSales(filters: ListSalesFilters, accessToken?: string | null) {
    const searchParams = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') searchParams.set(key, String(value))
    })
    const queryString = searchParams.toString()
    const response = await apiClient.get<ItemEnvelope<{ items: SaleListItem[] }>>(`/sales${queryString ? `?${queryString}` : ''}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async getSale(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<SaleDetail>>(`/sales/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async createSale(payload: CreateSalePayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<CreateSaleResponse>, CreateSalePayload>('/sales', {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async getTicket(saleId: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<TicketData>>(`/sales/${saleId}/ticket`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async getSaleDocuments(saleId: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<{ items: SaleDocument[] }>>(`/sales/${saleId}/documents`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async cancelSale(saleId: string, payload: CancelSalePayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<{ sale?: SaleDetail; inventoryMovements?: Array<Record<string, unknown>>; accountReceivable?: Record<string, unknown> | null }>, CancelSalePayload>(`/sales/${saleId}/cancel`, {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
}
