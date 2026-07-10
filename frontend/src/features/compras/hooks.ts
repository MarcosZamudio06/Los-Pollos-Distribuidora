import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { purchasesService } from './purchasesService'
import type { CancelPurchasePayload, CreatePurchasePayload, CreateSupplierPayload, ListPurchasesFilters, SupplierListFilters, UpdateSupplierPayload } from './types'

export function usePurchases(filters: ListPurchasesFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['purchases', filters],
    queryFn: () => purchasesService.listPurchases(filters, accessToken),
  })
}

export function usePurchase(purchaseId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(purchaseId),
    queryKey: ['purchases', purchaseId],
    queryFn: () => purchasesService.getPurchase(purchaseId as string, accessToken),
  })
}

export function useCreatePurchase() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePurchasePayload) => purchasesService.createPurchase(payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    },
  })
}

export function useCancelPurchase(purchaseId: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CancelPurchasePayload) => purchasesService.cancelPurchase(purchaseId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    },
  })
}

export function useSuppliers(filters: SupplierListFilters | string = '') {
  const { accessToken } = useAuth()
  const resolvedFilters = typeof filters === 'string' ? { isActive: true, limit: 50, page: 1, search: filters } : filters
  return useQuery({
    queryKey: ['suppliers', resolvedFilters],
    queryFn: () => purchasesService.listSuppliers(resolvedFilters, accessToken),
  })
}

export function useCreateSupplier() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSupplierPayload) => purchasesService.createSupplier(payload, accessToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useUpdateSupplier(supplierId: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateSupplierPayload) => purchasesService.updateSupplier(supplierId, payload, accessToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeactivateSupplier() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (supplierId: string) => purchasesService.deactivateSupplier(supplierId, accessToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function usePurchaseLocations(search = '') {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['locations', 'purchase-receivers', search],
    queryFn: () => purchasesService.listLocations({ isActive: true, limit: 50, page: 1, search }, accessToken),
  })
}
