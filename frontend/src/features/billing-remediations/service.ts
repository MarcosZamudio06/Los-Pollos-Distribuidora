import { apiClient } from '../../lib/api'
import type { BillingRemediationFilters, BillingRemediationsList, ResolveBillingRemediationInput } from './types'

const auth = (token?: string | null) => token ? { authorization: `Bearer ${token}` } : undefined
export function buildBillingRemediationsPath(filters: BillingRemediationFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return `/billing/remediations?${params}`
}
export const billingRemediationsService = {
  list: (filters: BillingRemediationFilters, token?: string | null) => apiClient.get<BillingRemediationsList>(buildBillingRemediationsPath(filters), { headers: auth(token) }),
  resolve: ({ id, ...body }: ResolveBillingRemediationInput, token?: string | null) => apiClient.post(`/billing/remediations/${id}/resolve`, { body, headers: auth(token) }),
}
