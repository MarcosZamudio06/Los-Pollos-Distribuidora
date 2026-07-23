import { apiClient } from '../../lib/api'
import type { DailyClose, DailyCloseInventoryReconciliation, DailyCloseValidationResult } from './types'
type Envelope<T> = { data: T }
const headers = (token: string | null) => ({ authorization: `Bearer ${token ?? ''}` })
const idempotencyHeaders = (token: string | null, idempotencyKey: string) => ({ ...headers(token), 'idempotency-key': idempotencyKey })
export const dailyCloseService = {
  list: async (token: string | null) => (await apiClient.get<Envelope<DailyClose[]>>('/point-of-sale-daily-closes', { headers: headers(token) })).data,
  get: async (id: string, token: string | null) => (await apiClient.get<Envelope<DailyClose>>(`/point-of-sale-daily-closes/${id}`, { headers: headers(token) })).data,
  refresh: async (id: string, token: string | null) => (await apiClient.post<Envelope<DailyClose>, Record<string, never>>(`/point-of-sale-daily-closes/${id}/refresh`, { body: {}, headers: headers(token) })).data,
  open: async (body: { operationalLocationId: string; businessDate: string }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>('/point-of-sale-daily-closes', { body, headers: headers(token) })).data,
  expense: async (id: string, body: { amount: number; reason: string; reference?: string }, token: string | null, idempotencyKey: string) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/expenses`, { body, headers: idempotencyHeaders(token, idempotencyKey) })).data,
  ticket: async (id: string, body: { physicalFolio: string; capturedDate: string; saleId?: string; saleDocumentId?: string; productId?: string; weightKg?: number; grossWeightKg?: number; tareWeightKg?: number; netWeightKg?: number; pieceCount?: number; unitPrice?: number; amount?: number; scaleDeviceId?: string; notes?: string }, token: string | null, idempotencyKey: string) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/scale-ticket-references`, { body, headers: idempotencyHeaders(token, idempotencyKey) })).data,
  recordCashCount: async (id: string, body: { cashCountedTotal: number }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/cash-count`, { body, headers: headers(token) })).data,
  reconciliation: async (id: string, token: string | null) => (await apiClient.get<Envelope<DailyCloseInventoryReconciliation>>(`/point-of-sale-daily-closes/${id}/reconciliation`, { headers: headers(token) })).data,
  createInventoryCount: async (id: string, body: { productId: string; physicalQuantityKg?: number; physicalQuantityPieces?: number; reason: string }, token: string | null, idempotencyKey: string) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/inventory-counts`, { body, headers: idempotencyHeaders(token, idempotencyKey) })).data,
  updateInventoryCount: async (id: string, countId: string, body: { physicalQuantityKg?: number; physicalQuantityPieces?: number; reason?: string }, token: string | null) => (await apiClient.patch<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/inventory-counts/${countId}`, { body, headers: headers(token) })).data,
  deleteInventoryCount: async (id: string, countId: string, token: string | null) => (await apiClient.delete<Envelope<DailyClose>>(`/point-of-sale-daily-closes/${id}/inventory-counts/${countId}`, { headers: headers(token) })).data,
  validate: async (id: string, token: string | null) => (await apiClient.post<Envelope<DailyCloseValidationResult>, Record<string, never>>(`/point-of-sale-daily-closes/${id}/validate`, { body: {}, headers: headers(token) })).data,
  action: async (id: string, action: 'review' | 'close' | 'cancel' | 'reopen', body: Record<string, unknown>, token: string | null) => {
    const path = `/point-of-sale-daily-closes/${id}/${action}`
    return (await apiClient.patch<Envelope<DailyClose>, Record<string, unknown>>(path, { body, headers: headers(token) })).data
  },
}
