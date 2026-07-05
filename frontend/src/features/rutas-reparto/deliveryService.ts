import { apiClient } from '../../lib/api'
import type {
  AssignDeliveryRouteOrdersPayload,
  CloseRouteSettlementPayload,
  CreateDeliveryRoutePayload,
  DeliveryRouteDetail,
  DeliveryRouteListItem,
  DeliveryRoutesFilters,
  RouteSettlementDetail,
  RouteSettlementListItem,
} from './types'

type ApiEnvelope<T> = { data?: T; message?: string; success?: boolean }
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
    if (isRecord(data) && Array.isArray(data.items)) {
      return { ...(data as Record<string, unknown>), items: data.items as T[] } as { items: T[] }
    }
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

export const deliveryService = {
  async listRoutes(filters: DeliveryRoutesFilters, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<DeliveryRouteListItem>>(withParams('/delivery-routes', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async getRoute(routeId: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<DeliveryRouteDetail>>(`/delivery-routes/${routeId}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async createRoute(payload: CreateDeliveryRoutePayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<DeliveryRouteDetail>, CreateDeliveryRoutePayload>('/delivery-routes', {
      body: payload,
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
  async assignOrders(routeId: string, payload: AssignDeliveryRouteOrdersPayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<DeliveryRouteDetail>, AssignDeliveryRouteOrdersPayload>(
      `/delivery-routes/${routeId}/orders`,
      { body: payload, headers: authHeaders(accessToken, crypto.randomUUID()) },
    )
    return unwrapItem(response)
  },
  async openSettlement(routeId: string, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<RouteSettlementDetail>, Record<string, never>>(
      `/delivery-routes/${routeId}/settlement`,
      { body: {}, headers: authHeaders(accessToken, crypto.randomUUID()) },
    )
    return unwrapItem(response)
  },
  async listSettlements(filters: { page?: number; limit?: number; routeId?: string; driverId?: string; status?: string; dateFrom?: string; dateTo?: string }, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<RouteSettlementListItem>>(withParams('/route-settlements', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async getSettlement(settlementId: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<RouteSettlementDetail>>(`/route-settlements/${settlementId}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async closeSettlement(settlementId: string, payload: CloseRouteSettlementPayload, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<RouteSettlementDetail>, CloseRouteSettlementPayload>(
      `/route-settlements/${settlementId}/close`,
      { body: payload, headers: authHeaders(accessToken, crypto.randomUUID()) },
    )
    return unwrapItem(response)
  },
}
