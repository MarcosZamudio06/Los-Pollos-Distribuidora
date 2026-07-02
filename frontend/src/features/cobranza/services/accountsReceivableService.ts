import { apiClient } from '../../../lib/api'
import type { AccountReceivable, AccountReceivableDetail, AccountsReceivableFilters, ReceivablePaymentFormValues, RegisterPaymentResponse } from '../types'

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T }
type ListEnvelope<T> = ApiEnvelope<T[] | { items?: T[] }> | { items?: T[] } | T[]
type ItemEnvelope<T> = ApiEnvelope<T> | T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapList<T>(response: ListEnvelope<T>): T[] {
  if (Array.isArray(response)) return response
  const payload = response as unknown
  if (isRecord(payload)) {
    if (Array.isArray(payload.data)) return payload.data as T[]
    if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items as T[]
    if (Array.isArray(payload.items)) return payload.items as T[]
  }
  throw new Error('La respuesta de cuentas por cobrar no incluyó una lista.')
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

function withParams(path: string, filters: AccountsReceivableFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== '' &&
      key !== 'onlyOverdue' &&
      key !== 'onlyUpcoming' &&
      !(key === 'agingStatus' && (filters.onlyOverdue || filters.onlyUpcoming))
    ) {
      params.set(key, String(value))
    }
  })
  if (filters.onlyOverdue) params.set('agingStatus', 'OVERDUE')
  if (filters.onlyUpcoming) params.set('agingStatus', 'DUE_SOON')
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function cleanText(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function toPaymentPayload(values: ReceivablePaymentFormValues) {
  return {
    accountReceivableId: values.accountReceivableId,
    amount: values.amount,
    paymentMethod: values.paymentMethod,
    bankName: cleanText(values.bankName),
    referenceNumber: cleanText(values.referenceNumber),
    appliedDocumentId: cleanText(values.appliedDocumentId),
    appliedDocumentType: cleanText(values.appliedDocumentType),
    collectionPass: values.collectionPass,
    paidAt: cleanText(values.paidAt),
  }
}

export const accountsReceivableService = {
  async list(filters: AccountsReceivableFilters, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<AccountReceivable>>(withParams('/accounts-receivable', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async get(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<AccountReceivableDetail>>(`/accounts-receivable/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async registerPayment(id: string, values: ReceivablePaymentFormValues, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<RegisterPaymentResponse>, ReturnType<typeof toPaymentPayload>>(`/accounts-receivable/${id}/payments`, {
      body: toPaymentPayload(values),
      headers: authHeaders(accessToken, crypto.randomUUID()),
    })
    return unwrapItem(response)
  },
}
