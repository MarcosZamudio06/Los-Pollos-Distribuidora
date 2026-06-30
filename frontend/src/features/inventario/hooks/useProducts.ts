import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth'
import { productService } from '../services/productService'
import type { InventoryAdjustmentValues, InventoryTransferValues, ProductFormValues } from '../types'

export type ProductFilters = {
  search?: string
  categoryId?: string
  presentationType?: string
  unit?: string
  locationId?: string
  lowStock?: boolean
  isActive?: string
}

export function useProducts(filters: ProductFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => productService.listProducts(filters, accessToken),
  })
}

export function useSaveProduct(productId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ProductFormValues) =>
      productId
        ? productService.updateProduct(productId, values, accessToken)
        : productService.createProduct(values, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useInventoryBalances(filters: { locationId?: string; productId?: string; lowStock?: boolean }) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['inventory-balances', filters],
    queryFn: () => productService.listBalances(filters, accessToken),
  })
}

export function useCreateInventoryAdjustment() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: InventoryAdjustmentValues) => productService.createAdjustment(values, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    },
  })
}

export function useInventoryMovements(filters: Record<string, string | undefined>) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['inventory-movements', filters],
    queryFn: () => productService.listMovements(filters, accessToken),
  })
}

export function useInventoryTransfers() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: () => productService.listTransfers(accessToken),
  })
}

export function useInventoryTransferDetail(id?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(id),
    queryKey: ['inventory-transfers', id],
    queryFn: () => productService.getTransfer(id as string, accessToken),
  })
}

export function useCreateInventoryTransfer() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: InventoryTransferValues) => productService.createTransfer(values, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] }),
  })
}

export function useConfirmInventoryTransfer() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productService.confirmTransfer(id, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] }),
  })
}

export function useCancelInventoryTransfer() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => productService.cancelTransfer(id, reason, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] }),
  })
}
