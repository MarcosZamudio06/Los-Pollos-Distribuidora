import { apiClient } from '../../../lib/api'

type ApiEnvelope<T> = { data?: T; message?: string; success?: boolean }
type ListEnvelope<T> = ApiEnvelope<T[] | { items?: T[] }> | { items?: T[] } | T[]

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
  return []
}

export type CommercialPolicyOption = {
  id: string
  name: string
  priceListId?: string | null
  customerType?: string | null
  isActive?: boolean
}

export const commercialPoliciesService = {
  async listCommercialPolicies(accessToken?: string | null) {
    const response = await apiClient.get<ListEnvelope<CommercialPolicyOption>>('/commercial-policies?page=1&limit=100&isActive=true', {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    })
    return unwrapList(response)
  },
}
