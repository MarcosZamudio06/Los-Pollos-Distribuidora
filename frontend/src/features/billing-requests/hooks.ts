import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { billingRequestsService } from './billingRequestsService'
import type { BillingRequestFilters, BillingRequestMutation } from './types'

export function useBillingRequests(filters: BillingRequestFilters) {
  const { accessToken } = useAuth()
  return useQuery({ queryKey: ['billing-requests', filters], queryFn: () => billingRequestsService.list(filters, accessToken) })
}
export function useBillingRequest(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({ enabled: Boolean(id), queryKey: ['billing-requests', id], queryFn: () => billingRequestsService.get(id as string, accessToken) })
}
export function useCreateBillingRequest() {
  const { accessToken } = useAuth(); const client = useQueryClient()
  return useMutation({ mutationFn: (input: { customerId: string; saleId: string; reason: string; notes?: string }) => billingRequestsService.create(input, accessToken), onSuccess: () => { void client.invalidateQueries({ queryKey: ['billing-requests'] }); void client.invalidateQueries({ queryKey: ['sales'] }) } })
}
export function useUpdateBillingRequest(id: string) {
  const { accessToken } = useAuth(); const client = useQueryClient()
  return useMutation({ mutationFn: (input: BillingRequestMutation) => input.status === 'CANCELLED' ? billingRequestsService.cancel(id, { reason: input.reason ?? '', notes: input.notes }, accessToken) : billingRequestsService.update(id, input, accessToken), onSuccess: (result) => { client.setQueryData(['billing-requests', id], result); void client.invalidateQueries({ queryKey: ['billing-requests'] }) } })
}
