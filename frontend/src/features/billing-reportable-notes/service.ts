import { apiClient } from '../../lib/api'
import type { BillingReportDetail, BillingReportFilters, BillingReportList } from './types'

const auth = (token?: string | null, extra?: HeadersInit) => ({ ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra })
export function buildBillingReportPath(filters: BillingReportFilters) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) }); return `/billing/reportable-notes${params.size ? `?${params}` : ''}` }
export function normalizeBillingReportDetail(detail: Partial<BillingReportDetail>): BillingReportDetail {
  return {
    ...detail,
    items: Array.isArray(detail.items) ? detail.items : [],
    requests: Array.isArray(detail.requests) ? detail.requests : [],
    invoices: Array.isArray(detail.invoices) ? detail.invoices : [],
    payments: Array.isArray(detail.payments) ? detail.payments : [],
    delivery: detail.delivery ?? null,
    audit: Array.isArray(detail.audit) ? detail.audit : [],
  } as BillingReportDetail
}
export const billingReportService = {
  list: (filters: BillingReportFilters, token?: string | null) => apiClient.get<BillingReportList>(buildBillingReportPath(filters), { headers: auth(token) }),
  detail: (id: string, token?: string | null) => apiClient.get<Partial<BillingReportDetail>>(`/billing/reportable-notes/${id}`, { headers: auth(token) }).then(normalizeBillingReportDetail),
  createRequest: (body: unknown, token?: string | null) => apiClient.post<{ data: { id: string } }, unknown>('/billing/requests', { body, headers: auth(token, { 'Idempotency-Key': crypto.randomUUID() }) }),
  reviewRequest: (id: string, action: 'approve' | 'reject' | 'cancel', body: { expectedVersion: number; reason: string }, token?: string | null) => apiClient.post(`/billing/requests/${id}/${action}`, { body, headers: auth(token) }),
}
