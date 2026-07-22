import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { salesService } from './salesService'
import type { CancelSalePayload, CreateSalePayload, ListSalesFilters } from './types'

export function useSales(filters: ListSalesFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: () => salesService.listSales(filters, accessToken),
  })
}

export function useSale(saleId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(saleId),
    queryKey: ['sales', saleId],
    queryFn: () => salesService.getSale(saleId as string, accessToken),
  })
}

export function useCreateSale() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ idempotencyKey, payload }: { idempotencyKey: string; payload: CreateSalePayload }) => salesService.createSale(payload, idempotencyKey, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}

export function useSaleTicket(saleId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(saleId),
    queryKey: ['sales', saleId, 'ticket'],
    queryFn: () => salesService.getTicket(saleId as string, accessToken),
  })
}

export function useSaleDocuments(saleId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(saleId),
    queryKey: ['sales', saleId, 'documents'],
    queryFn: () => salesService.getSaleDocuments(saleId as string, accessToken),
  })
}

export function useCancelSale(saleId: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ idempotencyKey, payload }: { idempotencyKey: string; payload: CancelSalePayload }) => salesService.cancelSale(saleId, payload, idempotencyKey, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] })
    },
  })
}
