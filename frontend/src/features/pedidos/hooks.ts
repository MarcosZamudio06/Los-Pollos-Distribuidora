import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { ordersService, type BranchOrderFilters } from './ordersService'

export function useBranchOrders(filters: BranchOrderFilters | null) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(filters?.locationId),
    queryKey: ['branch-orders', filters],
    queryFn: () => ordersService.listBranchOrders(filters as BranchOrderFilters, accessToken),
    refetchInterval: 10 * 60 * 1_000,
    refetchIntervalInBackground: true,
  })
}
