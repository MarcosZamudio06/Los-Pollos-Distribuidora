import { apiClient } from '../../lib/api'
import type { CancelPurchasePayload, CreatePurchasePayload, CreateSupplierPayload, ListPurchasesFilters, OperationalLocation, PurchaseDetail, PurchaseListItem, Supplier, SupplierListFilters, UpdateSupplierPayload } from './types'

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T }
type ListEnvelope<T> = ApiEnvelope<T[] | { items?: T[] }> | { items?: T[] } | T[]
type ItemEnvelope<T> = ApiEnvelope<T> | T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapList<T>(response: ListEnvelope<T>): { items: T[] } {
  if (Array.isArray(response)) return { items: response }
  const payload = response as unknown
  if (isRecord(payload)) {
    const data = payload.data
    if (Array.isArray(data)) return { items: data as T[] }
    if (isRecord(data) && Array.isArray(data.items)) return { ...(data as Record<string, unknown>), items: data.items as T[] } as { items: T[] }
    if (Array.isArray(payload.items)) return { items: payload.items as T[] }
  }
  return { items: [] }
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

function withParams(path: string, filters: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export const purchasesService = {
  async listPurchases(filters: ListPurchasesFilters, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<PurchaseListItem>>(withParams('/purchases', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async getPurchase(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<PurchaseDetail>>(`/purchases/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async createPurchase(payload: CreatePurchasePayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<PurchaseDetail>, CreatePurchasePayload>('/purchases', {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async cancelPurchase(id: string, payload: CancelPurchasePayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<PurchaseDetail>, CancelPurchasePayload>(`/purchases/${id}/cancel`, {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async listSuppliers(filters: SupplierListFilters, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<Supplier>>(withParams('/suppliers', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response).items
  },
  async createSupplier(payload: CreateSupplierPayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<Supplier>, CreateSupplierPayload>('/suppliers', {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async updateSupplier(id: string, payload: UpdateSupplierPayload, accessToken?: string | null) {
    const response = await apiClient.patch<ItemEnvelope<Supplier>, UpdateSupplierPayload>(`/suppliers/${id}`, {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async deactivateSupplier(id: string, accessToken?: string | null) {
    const response = await apiClient.delete<ItemEnvelope<Supplier>>(`/suppliers/${id}`, {
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async listLocations(filters: { search?: string; isActive?: boolean | string; page?: number; limit?: number }, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<OperationalLocation>>(withParams('/locations', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response).items
  },
}
