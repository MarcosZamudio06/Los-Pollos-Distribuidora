import { apiClient } from '../../../lib/api'
import type {
  InventoryAdjustmentValues,
  InventoryBalance,
  InventoryCategory,
  InventoryLocation,
  InventoryMovement,
  InventoryTransfer,
  InventoryTransferValues,
  Product,
  ProductFormValues,
} from '../types'

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

type ListEnvelope<T> = ApiEnvelope<T[] | { items?: T[] }> | { items?: T[] } | T[]
type ItemEnvelope<T> = ApiEnvelope<T> | T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapList<T>(response: ListEnvelope<T>): T[] {
  if (Array.isArray(response)) return response

  const payload = response as unknown

  if (isRecord(payload)) {
    const data = payload.data

    if (Array.isArray(data)) return data as T[]
    if (isRecord(data) && Array.isArray(data.items)) return data.items as T[]
    if (Array.isArray(payload.items)) return payload.items as T[]
  }

  throw new Error('La respuesta de inventario no incluyó una lista.')
}

function unwrapItem<T>(response: ItemEnvelope<T>) {
  const payload = response as unknown
  if (isRecord(payload) && 'data' in payload) return payload.data as T
  return payload as T
}

function authHeaders(accessToken?: string | null) {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
}

function withParams(path: string, filters: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export const productService = {
  async listCategories(accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<InventoryCategory>>('/categories?isActive=true&limit=100', {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async listLocations(accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<InventoryLocation>>('/locations?isActive=true&limit=100', {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async listProducts(filters: Record<string, string | boolean | undefined>, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<Product>>(withParams('/products', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async createProduct(values: ProductFormValues, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<Product>, ProductFormValues>('/products', {
      body: values,
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async updateProduct(id: string, values: ProductFormValues, accessToken?: string | null) {
    const response = await apiClient.patch<ItemEnvelope<Product>, ProductFormValues>(`/products/${id}`, {
      body: values,
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async listBalances(filters: Record<string, string | boolean | undefined>, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<InventoryBalance>>(withParams('/inventory/balances', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async createAdjustment(values: InventoryAdjustmentValues, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<InventoryMovement>, InventoryAdjustmentValues>('/inventory/adjustments', {
      body: values,
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async listMovements(filters: Record<string, string | undefined>, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<InventoryMovement>>(withParams('/inventory/movements', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async listTransfers(accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<InventoryTransfer>>('/inventory-transfers', {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async getTransfer(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<InventoryTransfer>>(`/inventory-transfers/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async createTransfer(values: InventoryTransferValues, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<InventoryTransfer>, InventoryTransferValues>('/inventory-transfers', {
      body: values,
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async confirmTransfer(id: string, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<InventoryTransfer>>(`/inventory-transfers/${id}/confirm`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async cancelTransfer(id: string, reason: string, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<InventoryTransfer>, { reason: string }>(`/inventory-transfers/${id}/cancel`, {
      body: { reason },
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
}
