import { apiClient } from '../../lib/api'
import type { DailyClose } from './types'
type Envelope<T> = { data: T }
const headers = (token: string | null) => ({ authorization: `Bearer ${token ?? ''}` })
export const dailyCloseService = {
  list: async (token: string | null) => (await apiClient.get<Envelope<DailyClose[]>>('/point-of-sale-daily-closes', { headers: headers(token) })).data,
  get: async (id: string, token: string | null) => (await apiClient.get<Envelope<DailyClose>>(`/point-of-sale-daily-closes/${id}`, { headers: headers(token) })).data,
  refresh: async (id: string, token: string | null) => (await apiClient.post<Envelope<DailyClose>, Record<string, never>>(`/point-of-sale-daily-closes/${id}/refresh`, { body: {}, headers: headers(token) })).data,
  open: async (body: { operationalLocationId: string; businessDate: string }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>('/point-of-sale-daily-closes', { body, headers: headers(token) })).data,
  expense: async (id: string, body: { amount: number; reason: string; reference?: string }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/expenses`, { body, headers: headers(token) })).data,
  ticket: async (id: string, body: { physicalFolio: string; capturedDate: string; weightKg?: number; pieceCount?: number; amount?: number }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/scale-tickets`, { body, headers: headers(token) })).data,
  recordCashCount: async (id: string, body: { cashCountedTotal: number }, token: string | null) => (await apiClient.post<Envelope<DailyClose>, typeof body>(`/point-of-sale-daily-closes/${id}/cash-count`, { body, headers: headers(token) })).data,
  action: async (id: string, action: 'validate' | 'review' | 'close' | 'cancel' | 'reopen', body: Record<string, unknown>, token: string | null) => {
    const path = `/point-of-sale-daily-closes/${id}/${action}`
    const response = action === 'validate'
      ? await apiClient.post<Envelope<DailyClose | { close: DailyClose }>, Record<string, unknown>>(path, { body, headers: headers(token) })
      : await apiClient.patch<Envelope<DailyClose>, Record<string, unknown>>(path, { body, headers: headers(token) })
    const data = response.data
    return 'close' in data ? data.close : data
  },
}
