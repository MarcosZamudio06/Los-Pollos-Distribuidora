import { apiClient } from '../../lib/api'
import type { BillingRequestDetail, BillingRequestFilters, BillingRequestList, BillingRequestMutation, InvoiceReconciliationInput } from './types'

type Envelope<T> = { data?: T } | T
const headers = (token?: string | null) => token ? { authorization: `Bearer ${token}` } : undefined
function unwrap<T>(value: Envelope<T>): T { return typeof value === 'object' && value !== null && 'data' in value ? (value as { data: T }).data : value as T }
function path(filters: BillingRequestFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return `/billing-requests${params.size ? `?${params}` : ''}`
}

export const billingRequestsService = {
  async list(filters: BillingRequestFilters, token?: string | null) { return unwrap(await apiClient.get<Envelope<BillingRequestList>>(path(filters), { headers: headers(token) })) },
  async get(id: string, token?: string | null) { return unwrap(await apiClient.get<Envelope<BillingRequestDetail>>(`/billing-requests/${id}`, { headers: headers(token) })) },
  async create(input: { customerId: string; saleId: string; reason: string; notes?: string }, token?: string | null) { return unwrap(await apiClient.post<Envelope<BillingRequestDetail>, typeof input>('/billing-requests', { body: input, headers: headers(token) })) },
  async update(id: string, input: BillingRequestMutation, token?: string | null) { return unwrap(await apiClient.patch<Envelope<BillingRequestDetail>, BillingRequestMutation>(`/billing-requests/${id}`, { body: input, headers: headers(token) })) },
  async transition(id: string, command: 'start-review' | 'approve' | 'reject' | 'cancel', input: { expectedVersion: number; reason: string; notes?: string }, token?: string | null) { return unwrap(await apiClient.post<Envelope<BillingRequestDetail>, typeof input>(`/billing/requests/${id}/${command}`, { body: input, headers: headers(token) })) },
  async linkInvoice(id: string, input: InvoiceReconciliationInput, token?: string | null) {
    const { applications, ...body } = input
    const normalized = applications.map((application) => ({
      saleDocumentId: application.saleDocumentId, subtotalApplied: application.subtotalApplied, taxApplied: application.taxApplied, totalApplied: application.totalApplied,
      items: application.items.map((item) => ({ saleItemId: item.saleItemId, subtotalApplied: item.subtotalApplied, taxApplied: item.taxApplied, totalApplied: item.totalApplied })),
    }))
    return unwrap(await apiClient.post<Envelope<BillingRequestDetail>, unknown>(`/billing/requests/${id}/link-invoice`, { body: { ...body, applications: normalized }, headers: { ...headers(token), 'Idempotency-Key': crypto.randomUUID() } }))
  },
}
