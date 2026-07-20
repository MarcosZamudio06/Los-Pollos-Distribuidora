import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { billingRequestsService } from './billingRequestsService'
import type { BillingRequestFilters, BillingRequestMutation, InvoiceReconciliationInput } from './types'

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
  return useMutation({ mutationFn: (input: BillingRequestMutation) => {
    if (!input.status) return billingRequestsService.update(id, input, accessToken)
    if (!input.expectedVersion) throw new Error('expectedVersion is required for billing request transitions')
    const command = input.status === 'IN_REVIEW' ? 'start-review' : input.status.toLowerCase() as 'approve' | 'reject' | 'cancel'
    return billingRequestsService.transition(id, command, { expectedVersion: input.expectedVersion, reason: input.reason ?? '', notes: input.notes }, accessToken)
  }, onSuccess: (result) => { client.setQueryData(['billing-requests', id], result); void client.invalidateQueries({ queryKey: ['billing-requests'] }) } })
}
export function useLinkBillingInvoice(id: string) {
  const { accessToken } = useAuth(); const client = useQueryClient()
  return useMutation({ mutationFn: (input: InvoiceReconciliationInput) => billingRequestsService.linkInvoice(id, input, accessToken), onSuccess: () => { void client.invalidateQueries({ queryKey: ['billing-requests', id] }); void client.invalidateQueries({ queryKey: ['billing-requests'] }); void client.invalidateQueries({ queryKey: ['billing-reportable-notes'] }) } })
}
