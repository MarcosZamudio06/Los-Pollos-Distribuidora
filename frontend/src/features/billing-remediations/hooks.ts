import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { billingRemediationsService } from './service'
import type { BillingRemediationFilters, ResolveBillingRemediationInput } from './types'

export function useBillingRemediations(filters: BillingRemediationFilters) {
  const { accessToken } = useAuth()
  return useQuery({ queryKey: ['billing-remediations', filters], queryFn: () => billingRemediationsService.list(filters, accessToken), placeholderData: (previous) => previous })
}
export function useResolveBillingRemediation() {
  const { accessToken } = useAuth()
  const client = useQueryClient()
  return useMutation({ mutationFn: (input: ResolveBillingRemediationInput) => billingRemediationsService.resolve(input, accessToken), onSuccess: () => {
    void client.invalidateQueries({ queryKey: ['billing-remediations'] })
    void client.invalidateQueries({ queryKey: ['billing-report'] })
    void client.invalidateQueries({ queryKey: ['billing-report-detail'] })
  } })
}
