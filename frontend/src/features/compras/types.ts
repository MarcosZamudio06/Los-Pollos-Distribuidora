import type { InventoryMovement, OperationalUnit, Product, ProductEquivalenceSummary, ProductPresentation } from '../inventario/types'

export type PurchaseStatus = 'CONFIRMED' | 'CANCELLED' | string
export type LocationType = 'BRANCH' | 'WAREHOUSE' | 'MIXED' | 'EXTERNAL_POINT_OF_SALE' | 'ROUTE_STOCK'

export type Supplier = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  isActive?: boolean
}

export type OperationalLocation = {
  id: string
  name: string
  code?: string | null
  type: LocationType | string
  parentId?: string | null
  address?: string | null
  isActive?: boolean
}

export type PurchaseListItem = {
  id: string
  purchaseNumber?: string
  supplierId: string
  supplierName?: string | null
  userId?: string
  userName?: string | null
  locationId: string
  locationName?: string | null
  subtotal?: number | string | null
  total?: number | string | null
  status: PurchaseStatus
  createdAt?: string
  updatedAt?: string
}

export type PurchaseItem = {
  id?: string
  productId: string
  productName?: string | null
  presentationType?: ProductPresentation | null
  unit: OperationalUnit
  quantity?: number | string | null
  quantityKg?: number | string | null
  quantityPieces?: number | string | null
  unitCost: number | string
  unitEquivalentId?: string | null
  appliedEquivalentFactor?: number | string | null
  subtotal?: number | string | null
}

export type PurchaseDetail = PurchaseListItem & {
  items?: PurchaseItem[]
  inventoryMovements?: InventoryMovement[]
}

export type PurchaseFormItem = {
  productId: string
  productName: string
  presentationType: ProductPresentation
  unit: OperationalUnit
  quantityKg: number
  quantityPieces: number
  unitCost: number
  unitEquivalentId?: string
  appliedEquivalentFactor?: number | null
  availableEquivalences?: ProductEquivalenceSummary[]
}

export type CreatePurchaseItemPayload = {
  productId: string
  unit: OperationalUnit
  quantityKg?: number
  quantityPieces?: number
  unitCost: number
  unitEquivalentId?: string
}

export type CreatePurchasePayload = {
  supplierId: string
  locationId: string
  allowCostUpdate: boolean
  items: CreatePurchaseItemPayload[]
}

export type CancelPurchasePayload = {
  reason: string
}

export type ListPurchasesFilters = {
  page?: number
  limit?: number
  supplierId?: string
  locationId?: string
  status?: PurchaseStatus | ''
  dateFrom?: string
  dateTo?: string
}

export type ProductPurchaseOption = Product & {
  name: string
  presentationType?: ProductPresentation | null
  unit?: OperationalUnit | null
}
