import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth'
import { customerService } from '../services/customerService'
import type { CustomerFilters, CustomerFormValues } from '../types'

export function useCustomers(filters: CustomerFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: () => customerService.listCustomers(filters, accessToken),
  })
}

export function useCustomerDetail(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['customers', id],
    queryFn: () => customerService.getCustomer(id as string, accessToken),
  })
}

export function useCustomerCreditSummary(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['customers', id, 'credit-summary'],
    queryFn: () => customerService.getCreditSummary(id as string, accessToken),
  })
}

export function useCustomerSales(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['customers', id, 'sales'],
    queryFn: () => customerService.listSales(id as string, accessToken),
  })
}

export function useCustomerPayments(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['customers', id, 'payments'],
    queryFn: () => customerService.listPayments(id as string, accessToken),
  })
}

export function useSaveCustomer(customerId?: string, canManageCommercialTerms = false) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: CustomerFormValues) =>
      customerId
        ? customerService.updateCustomer(customerId, values, canManageCommercialTerms, accessToken)
        : customerService.createCustomer(values, canManageCommercialTerms, accessToken),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.setQueryData(['customers', customer.id], customer)
    },
  })
}

export function useDeactivateCustomer() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customerService.deactivateCustomer(id, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })
}
