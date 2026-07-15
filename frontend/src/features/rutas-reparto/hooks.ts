import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { deliveryService } from './deliveryService'
import type { AssignDeliveryRouteOrdersPayload, CloseRouteSettlementPayload, CreateDeliveryEvidencePayload, CreateDeliveryIncidentPayload, CreateDeliveryRoutePayload, CreateRouteCollectionPayload, CreateDeliveryRoutePlanPayload, DeliveryRoutesFilters, UpdateDeliveryOrderStatusPayload } from './types'

export function useRoutePlannerCatalog(search = '') {
  const { accessToken } = useAuth()
  const drivers = useQuery({ queryKey: ['route-planner', 'drivers'], queryFn: () => deliveryService.listPlannerDrivers(accessToken) })
  const locations = useQuery({ queryKey: ['route-planner', 'locations'], queryFn: () => deliveryService.listPlannerLocations(accessToken) })
  const sales = useQuery({ queryKey: ['route-planner', 'eligible-sales', search], queryFn: () => deliveryService.listEligibleSales({ limit: 100, search: search || undefined }, accessToken) })
  return { drivers, locations, sales }
}

export function useAddressSearch() {
  const { accessToken } = useAuth()
  return useMutation({ mutationFn: (params: { q: string; latitude?: number; longitude?: number }) => deliveryService.searchAddresses(params, accessToken) })
}

export function useReverseAddress() {
  const { accessToken } = useAuth()
  return useMutation({ mutationFn: ({ latitude, longitude }: { latitude: number; longitude: number }) => deliveryService.reverseAddress(latitude, longitude, accessToken) })
}

export function useCreateRoutePlan() {
  const { accessToken } = useAuth()
  return useMutation({ mutationFn: (payload: CreateDeliveryRoutePlanPayload) => deliveryService.createRoutePlan(payload, accessToken) })
}

export function useCreateOptimizedRoute() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: Omit<CreateDeliveryRoutePayload, 'orders'> & { routePlanId: string }; idempotencyKey: string }) => deliveryService.createOptimizedRoute(payload, idempotencyKey, accessToken),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] }); void queryClient.invalidateQueries({ queryKey: ['route-planner', 'eligible-sales'] }) },
  })
}

export function useDeliveryRoutes(filters: DeliveryRoutesFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ['delivery-routes', filters],
    queryFn: () => deliveryService.listRoutes(filters, accessToken),
  })
}

export function useRoutingTechnicalStatus(enabled = true) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled,
    queryKey: ['delivery-routing', 'technical-status'],
    queryFn: () => deliveryService.getRoutingTechnicalStatus(accessToken),
    refetchInterval: 60_000,
  })
}

export function useDeliveryRoute(routeId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(routeId),
    queryKey: ['delivery-routes', routeId],
    queryFn: () => deliveryService.getRoute(routeId as string, accessToken),
  })
}

export function useCreateDeliveryRoute() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateDeliveryRoutePayload) => deliveryService.createRoute(payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
    },
  })
}

export function useAssignDeliveryRouteOrders(routeId: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AssignDeliveryRouteOrdersPayload) => deliveryService.assignOrders(routeId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
    },
  })
}

export function useOpenRouteSettlement() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (routeId: string) => deliveryService.openSettlement(routeId, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      void queryClient.invalidateQueries({ queryKey: ['route-settlements'] })
    },
  })
}

export function useRouteSettlement(settlementId?: string) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled: Boolean(settlementId),
    queryKey: ['route-settlements', settlementId],
    queryFn: () => deliveryService.getSettlement(settlementId as string, accessToken),
  })
}

export function useCloseRouteSettlement(settlementId: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CloseRouteSettlementPayload) => deliveryService.closeSettlement(settlementId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      void queryClient.invalidateQueries({ queryKey: ['route-settlements'] })
    },
  })
}


export function useUpdateDeliveryOrderStatus(routeId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: UpdateDeliveryOrderStatusPayload }) =>
      deliveryService.updateOrderStatus(orderId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      if (routeId) void queryClient.invalidateQueries({ queryKey: ['delivery-routes', routeId] })
    },
  })
}

export function useCreateDeliveryEvidence(routeId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: CreateDeliveryEvidencePayload }) =>
      deliveryService.createOrderEvidence(orderId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      if (routeId) void queryClient.invalidateQueries({ queryKey: ['delivery-routes', routeId] })
    },
  })
}

export function useCreateRouteCollection(routeId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: CreateRouteCollectionPayload }) =>
      deliveryService.createOrderCollection(orderId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      if (routeId) void queryClient.invalidateQueries({ queryKey: ['delivery-routes', routeId] })
      void queryClient.invalidateQueries({ queryKey: ['route-settlements'] })
    },
  })
}

export function useCreateDeliveryIncident(routeId?: string) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: CreateDeliveryIncidentPayload }) =>
      deliveryService.createOrderIncident(orderId, payload, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-routes'] })
      if (routeId) void queryClient.invalidateQueries({ queryKey: ['delivery-routes', routeId] })
    },
  })
}
