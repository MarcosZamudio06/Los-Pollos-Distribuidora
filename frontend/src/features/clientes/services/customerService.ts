import { apiClient } from '../../../lib/api'
import type { Customer, CustomerCreditSummary, CustomerFilters, CustomerFormValues, CustomerPayment, CustomerSale } from '../types'

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
  throw new Error('La respuesta de clientes no incluyó una lista.')
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

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toPayload(values: CustomerFormValues, canManageCommercialTerms: boolean) {
  const basePayload = {
    customerNumber: cleanText(values.customerNumber),
    name: values.name.trim(),
    commercialName: cleanText(values.commercialName),
    phone: cleanText(values.phone),
    email: cleanText(values.email),
    billingEmail: cleanText(values.billingEmail),
    address: cleanText(values.address),
    customerType: values.customerType,

    requiresBilling: values.requiresBilling,
    deliveryAddress: cleanText(values.deliveryAddress),
    assignedRouteId: cleanText(values.assignedRouteId),
    fiscalName: cleanText(values.fiscalName),
    taxId: cleanText(values.taxId),
    fiscalAddress: cleanText(values.fiscalAddress),
  }

  if (!canManageCommercialTerms) {
    return basePayload
  }

  return {
    ...basePayload,
    priceListId: cleanText(values.priceListId),
    creditLimit: values.creditLimit ?? undefined,
    creditDays: values.creditDays ?? undefined,
    creditStatus: values.creditStatus,
    commercialPolicyId: cleanText(values.commercialPolicyId),
  }
}

export const customerService = {
  async listCustomers(filters: CustomerFilters, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<Customer>>(withParams('/customers', filters), {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async getCustomer(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<Customer>>(`/customers/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async getCreditSummary(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ItemEnvelope<CustomerCreditSummary>>(`/customers/${id}/credit-summary`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async listSales(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<CustomerSale>>(`/customers/${id}/sales`, {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async listPayments(id: string, accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<CustomerPayment>>(`/customers/${id}/payments`, {
      headers: authHeaders(accessToken),
    })
    return unwrapList(response)
  },
  async createCustomer(values: CustomerFormValues, canManageCommercialTerms: boolean, accessToken?: string | null) {
    const response = await apiClient.post<ItemEnvelope<Customer>, ReturnType<typeof toPayload>>('/customers', {
      body: toPayload(values, canManageCommercialTerms),
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async updateCustomer(id: string, values: CustomerFormValues, canManageCommercialTerms: boolean, accessToken?: string | null) {
    const response = await apiClient.patch<ItemEnvelope<Customer>, ReturnType<typeof toPayload>>(`/customers/${id}`, {
      body: toPayload(values, canManageCommercialTerms),
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
  async deactivateCustomer(id: string, accessToken?: string | null) {
    const response = await apiClient.delete<ItemEnvelope<Customer>>(`/customers/${id}`, {
      headers: authHeaders(accessToken),
    })
    return unwrapItem(response)
  },
}
