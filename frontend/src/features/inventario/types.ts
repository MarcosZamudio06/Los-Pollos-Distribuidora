export type OperationalUnit = 'KG' | 'PIECE' | 'KG_AND_PIECE'
export type ProductPresentation = 'KG' | 'WHOLE' | 'CUT'
export type EquivalentPolicyStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | string
export type InventoryMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'PURCHASE'
  | 'CANCEL_SALE'
  | 'CANCEL_PURCHASE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'SHRINKAGE'
  | 'RETURN'

export type ProductEquivalenceSummary = {
  id: string
  unitFrom: OperationalUnit
  unitTo: OperationalUnit
  factor: number
  roundingMode?: string | null
  effectiveFrom?: string | Date | null
}

export type InventoryBalance = {
  id?: string
  productId?: string
  productName?: string
  locationId: string
  locationName?: string
  quantityKg: number
  quantityPieces: number
  minQuantityKg?: number | null
  minQuantityPieces?: number | null
  minimumKg?: number | null
  minimumPieces?: number | null
  isLowStock?: boolean
}

export type Product = {
  id: string
  name: string
  sku?: string | null
  description?: string | null
  category?: { id: string; name: string } | string | null
  categoryId?: string | null
  presentationType?: ProductPresentation | null
  presentation?: ProductPresentation | null
  salePrice: number
  purchaseCost?: number | null
  cost?: number | null
  minStock?: number | null
  unit?: OperationalUnit | null
  operationalUnit?: OperationalUnit | null
  pieceWeightEquivalent?: number | null
  equivalentWeightKg?: number | null
  equivalentPolicyStatus?: EquivalentPolicyStatus | null
  equivalencePolicyStatus?: EquivalentPolicyStatus | string | null
  isActive?: boolean
  active?: boolean
  status?: ProductStatus
  inventoryBalance?: InventoryBalance | null
  locationBalance?: InventoryBalance | null
  balances?: InventoryBalance[]
  activeEquivalences?: ProductEquivalenceSummary[]
  visibleEquivalence?: string | null
}

export type ProductFormValues = {
  name: string
  sku: string
  description: string
  categoryId: string
  presentationType: ProductPresentation
  salePrice: number
  purchaseCost: number
  minStock: number
  unit: OperationalUnit
  pieceWeightEquivalent?: number | null
  equivalentPolicyStatus?: EquivalentPolicyStatus | null
}

export type InventoryMovement = {
  id: string
  productId?: string
  productName?: string
  locationId?: string
  locationName?: string
  type: InventoryMovementType | string
  unit?: OperationalUnit
  quantityKg?: number | null
  quantityPieces?: number | null
  previousQuantityKg?: number | null
  newQuantityKg?: number | null
  previousQuantityPieces?: number | null
  newQuantityPieces?: number | null
  reason?: string | null
  reference?: string | null
  referenceType?: string | null
  referenceId?: string | null
  userId?: string | null
  userName?: string | null
  createdAt: string
}

export type InventoryAdjustmentValues = {
  productId: string
  locationId: string
  type: Extract<InventoryMovementType, 'IN' | 'OUT' | 'ADJUSTMENT' | 'SHRINKAGE' | 'RETURN'>
  unit: OperationalUnit
  quantityKg?: number
  quantityPieces?: number
  reason: string
  referenceType?: string
  referenceId?: string
}

export type InventoryTransferLine = {
  productId: string
  productName?: string
  unit: OperationalUnit
  quantityKg?: number
  quantityPieces?: number
}

export type InventoryTransfer = {
  id: string
  transferNumber?: string
  originLocationId?: string
  originLocationName?: string
  destinationLocationId?: string
  destinationLocationName?: string
  status: 'DRAFT' | 'REQUESTED' | 'IN_TRANSIT' | 'CONFIRMED' | 'CANCELLED' | string
  userId?: string
  responsibleName?: string
  notes?: string | null
  requestedAt?: string | null
  createdAt: string
  updatedAt?: string
  confirmedAt?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  itemsCount?: number
  items?: InventoryTransferLine[]
  movements?: InventoryMovement[]
}

export type InventoryTransferValues = {
  originLocationId: string
  destinationLocationId: string
  notes?: string
  items: InventoryTransferLine[]
}
