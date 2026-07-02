import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth'
import { accountsReceivableService } from '../services/accountsReceivableService'
import type { AccountsReceivableFilters, ReceivablePaymentFormValues } from '../types'

export function useAccountsReceivable(filters: AccountsReceivableFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['accounts-receivable', filters],
    queryFn: () => accountsReceivableService.list(filters, accessToken),
  })
}

export function useAccountReceivableDetail(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['accounts-receivable', id],
    queryFn: () => accountsReceivableService.get(id as string, accessToken),
  })
}

export function useRegisterReceivablePayment(accountReceivableId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ReceivablePaymentFormValues) =>
      accountsReceivableService.registerPayment(accountReceivableId as string, values, accessToken),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] })
      void queryClient.setQueryData(['accounts-receivable', result.accountReceivable.id], result.accountReceivable)
    },
  })
}
