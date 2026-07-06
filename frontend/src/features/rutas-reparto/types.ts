export type DeliveryRouteStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | string
export type DeliveryOrderStatus =
  | 'PENDING'
  | 'IN_ROUTE'
  | 'DELIVERED'
  | 'NOT_DELIVERED'
  | 'CANCELLED'
  | 'PARTIALLY_REJECTED'
  | 'RETURNED'
  | string
export type EvidenceType = 'PHOTO' | 'SIGNATURE' | 'GEOLOCATION' | 'NOTE' | string
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'DEPOSIT' | string
export type RouteSettlementStatus = 'OPEN' | 'CLOSED' | 'REVIEW_REQUIRED' | string
export type CollectionPass = 'FIRST' | 'SECOND' | string
export type ReturnedItemUnit = 'KG' | 'PIECE' | 'KG_AND_PIECE' | string

export type DeliveryRoutesFilters = {
  page?: number
  limit?: number
  driverId?: string
  status?: DeliveryRouteStatus | ''
  scheduledDate?: string
  originLocationId?: string
}

export type DeliveryRouteListItem = {
  id: string
  name: string
  driverId?: string | null
  driverName?: string | null
  status: DeliveryRouteStatus
  scheduledDate?: string | null
  originLocationId?: string | null
  originLocationName?: string | null
  routeStockLocationId?: string | null
  routeStockLocationName?: string | null
  startedAt?: string | null
  completedAt?: string | null
  ordersCount?: number | string | null
  pendingOrdersCount?: number | string | null
  routeSettlementId?: string | null
  createdAt?: string | null
}

export type DeliveryOrder = {
  id: string
  saleId?: string | null
  saleNumber?: string | null
  customerName?: string | null
  accountReceivableId?: string | null
  status: DeliveryOrderStatus
  deliveryAddress?: string | null
  deliveredAt?: string | null
  deliveredByUserId?: string | null
  deliveredByUserName?: string | null
  collectedByUserId?: string | null
  collectedByUserName?: string | null
  collectionPass?: CollectionPass | null
  notes?: string | null
  outstandingAmount?: number | string | null
  derivedCollectedAmount?: number | string | null
  expectedAmount?: number | string | null
}

export type EvidenceSummaryItem = {
  orderId?: string | null
  deliveryOrderId?: string | null
  saleNumber?: string | null
  type: EvidenceType
  value?: string | null
  capturedAt?: string | null
  capturedByUserName?: string | null
}

export type CollectionSummary = {
  expectedAmount?: number | string | null
  derivedCollectedAmount?: number | string | null
  expectedCashAmount?: number | string | null
  derivedCollectedCashAmount?: number | string | null
  expectedTransferAmount?: number | string | null
  derivedCollectedTransferAmount?: number | string | null
  firstPassAmount?: number | string | null
  secondPassAmount?: number | string | null
}

export type DeliveryRouteDetail = DeliveryRouteListItem & {
  orders?: DeliveryOrder[]
  evidenceSummary?: EvidenceSummaryItem[]
  collectionsSummary?: CollectionSummary
}

export type CreateDeliveryRouteOrderPayload = {
  saleId: string
  accountReceivableId?: string
  deliveryAddress: string
}

export type CreateDeliveryRoutePayload = {
  name: string
  driverId: string
  scheduledDate: string
  originLocationId?: string
  routeStockLocationId?: string
  orders: CreateDeliveryRouteOrderPayload[]
}

export type AssignDeliveryRouteOrdersPayload = {
  orders: CreateDeliveryRouteOrderPayload[]
}

export type UpdateDeliveryOrderStatusPayload = {
  status: DeliveryOrderStatus
  notes?: string
  deliveredAt?: string
}

export type CreateDeliveryEvidencePayload = {
  type: EvidenceType
  value: string
  capturedAt: string
}

export type CreateRouteCollectionPayload = {
  accountReceivableId: string
  amount: number
  paymentMethod: PaymentMethod
  reference?: string
  paidAt: string
  collectionPass?: CollectionPass
}

export type RouteCollectionPayment = {
  id: string
  accountReceivableId: string
  customerId?: string | null
  routeId?: string | null
  routeSettlementId?: string | null
  amount: number | string
  paymentMethod: PaymentMethod
  status?: string | null
  paidAt?: string | null
}

export type RouteCollectionResponse = {
  payment: RouteCollectionPayment
  deliveryOrder: Pick<DeliveryOrder, 'id' | 'status' | 'derivedCollectedAmount'>
}

export type DeliveryIncidentReturnedItem = {
  productId: string
  unit: ReturnedItemUnit
  quantityKg?: number
  quantityPieces?: number
  reason: string
}

export type CreateDeliveryIncidentPayload = {
  status: Extract<DeliveryOrderStatus, 'NOT_DELIVERED' | 'PARTIALLY_REJECTED' | 'RETURNED'> | DeliveryOrderStatus
  reason: string
  returnedItems?: DeliveryIncidentReturnedItem[]
}

export type RouteSettlementListItem = {
  id: string
  routeId: string
  driverId?: string | null
  driverName?: string | null
  status: RouteSettlementStatus
  expectedCashAmount?: number | string | null
  derivedCollectedCashAmount?: number | string | null
  expectedTransferAmount?: number | string | null
  derivedCollectedTransferAmount?: number | string | null
  differenceAmount?: number | string | null
  paidAtDeliveryAmount?: number | string | null
  creditAmount?: number | string | null
  overdueAmount?: number | string | null
  secondPassCollectionsAmount?: number | string | null
  closedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  expectedVersion?: number | null
  version?: number | null
}

export type RouteSettlementPayment = {
  id: string
  accountReceivableId: string
  paymentMethod: PaymentMethod
  amount: number | string
  status?: string | null
  paidAt?: string | null
  collectionPass?: string | null
  routeId?: string | null
  routeSettlementId?: string | null
}

export type RouteSettlementOrder = {
  id: string
  saleNumber?: string | null
  status: DeliveryOrderStatus
  expectedAmount?: number | string | null
  derivedCollectedAmount?: number | string | null
  incidentReason?: string | null
  deliveredByUserName?: string | null
  collectedByUserName?: string | null
}

export type RouteSettlementInventoryMovement = {
  id: string
  productName?: string | null
  type?: string | null
  reason?: string | null
  quantityKg?: number | string | null
  quantityPieces?: number | string | null
  createdAt?: string | null
}

export type RouteSettlementDetail = RouteSettlementListItem & {
  route?: DeliveryRouteListItem | null
  orders?: RouteSettlementOrder[]
  payments?: RouteSettlementPayment[]
  inventoryMovements?: RouteSettlementInventoryMovement[]
  routeStockLocationId?: string | null
}

export type CloseRouteSettlementPayload = {
  notes?: string
  expectedVersion: number
}
