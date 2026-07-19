import type { Customer, CustomerCreditSummary, CustomerType } from '../clientes/types'
import type { OperationalUnit, ProductPresentation } from '../inventario/types'

export type PaymentType = 'CASH_SALE' | 'CREDIT_SALE'
export type PaymentMethod = '' | 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK'
export type SaleChannel = 'COUNTER' | 'EXTERNAL_POINT_OF_SALE' | 'ROUTE' | 'INSTITUTIONAL' | 'WHOLESALE'
export type SaleDocumentType = 'SCALE_TICKET' | 'SIMPLE_NOTE' | 'LARGE_NOTE' | 'INTERNAL_RECEIPT'
export type SaleStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
export type CollectionStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

export type CustomerOption = Pick<
  Customer,
  | 'id'
  | 'name'
  | 'commercialName'
  | 'customerNumber'
  | 'customerType'
  | 'creditStatus'
  | 'creditLimit'
  | 'isActive'
  | 'active'
  | 'isBlockedForCredit'
  | 'effectiveCreditStatus'
  | 'commercialPolicyId'
> & {
  creditSummary?: CustomerCreditSummary | null
  customerType: CustomerType
}

export type ProductOption = {
  id: string
  name: string
  sku?: string | null
  presentationType: ProductPresentation
  unit: OperationalUnit
  salePrice: number
  unitPrice: number
  locationId: string
  locationName?: string | null
  availableKg: number
  availablePieces: number
  isLowStock?: boolean
  equivalentPolicyStatus?: string | null
  unitEquivalentId?: string | null
}

export type CartItem = ProductOption & {
  productId: string
  quantityKg: number
  quantityPieces: number
}

export type CreateSaleItemPayload = {
  productId: string
  presentationType: ProductPresentation
  unit: OperationalUnit
  quantityKg: number
  quantityPieces: number
  unitEquivalentId?: string
}

export type CreateSalePayload = {
  customerId?: string
  locationId: string
  saleChannel: SaleChannel
  documentType: SaleDocumentType
  physicalFolio?: string
  requiresAdministrativeInvoice: boolean
  billingRequest?: {
    reason: string
    notes?: string
  }
  paymentType: PaymentType
  initialPayment?: {
    amount: number
    paymentMethod: Exclude<PaymentMethod, ''>
    paidAt: string
  }
  discount: number
  commercialPolicyId?: string
  administrativeOverrideReason?: string
  items: CreateSaleItemPayload[]
}

export type BuildCreateSalePayloadInput = {
  administrativeOverrideReason?: string
  billingRequestReason?: string
  billingRequestNotes?: string
  cart: CartItem[]
  customer: CustomerOption | null
  documentType: SaleDocumentType
  initialPaymentAmount?: number
  locationId: string
  paymentMethod: PaymentMethod
  paymentType: PaymentType
  physicalFolio: string
  requiresAdministrativeInvoice: boolean
  saleChannel: SaleChannel
  total: number
}

export type CreateSaleResponse = {
  creditWarnings?: string[]
  sale?: {
    id: string
    saleNumber?: string
    total?: number | string
    paymentType?: PaymentType | string
    collectionStatus?: string
    status?: string
    locationId?: string
    items?: Array<{
      productName?: string
      unit?: string
      quantityKg?: number | string | null
      quantityPieces?: number | string | null
      unitPrice?: number | string | null
      subtotal?: number | string | null
    }>
    creditWarnings?: string[]
  }
  payment?: { id?: string; amount?: number | string; paymentMethod?: string } | null
  accountReceivable?: { id?: string; balance?: number | string; dueDate?: string } | null
  billingRequest?: { id?: string; status?: string } | null
  ticketId?: string | null
  documents?: Array<{ id?: string; type?: string; status?: string }> | null
}

export type TicketData = {
  ticketId?: string
  ticketNumber?: string
  saleNumber?: string
  createdAt?: string
  documentType?: SaleDocumentType | string
  physicalFolio?: string | null
  requiresAdministrativeInvoice?: boolean
  billingRequest?: { id?: string; status?: string } | null
  sellerName?: string
  customerName?: string | null
  customerAddress?: string | null
  customerPhone?: string | null
  customerTaxId?: string | null
  customerCreditDays?: number | null
  locationId?: string
  locationName?: string
  items?: Array<{
    product?: string
    productName?: string
    unit?: string
    kilos?: number | string | null
    pieces?: number | string | null
    quantityKg?: number | string | null
    quantityPieces?: number | string | null
    unitPrice?: number | string | null
    subtotal?: number | string | null
  }>
  subtotal?: number | string | null
  discount?: number | string | null
  tax?: number | string | null
  total?: number | string | null
  paymentType?: PaymentType | string
  collectionStatus?: string
  status?: string
  payments?: Array<{ amount?: number | string; paymentMethod?: string; paidAt?: string }>
  legend?: string
}

export type PaymentsSummary = {
  totalPaid?: number | string | null
  lastPaidAt?: string | null
  methods?: PaymentMethod[] | string[]
}

export type SaleListItem = {
  id: string
  saleNumber?: string
  customerId?: string | null
  customerName?: string | null
  userId?: string
  locationId?: string
  saleChannel?: SaleChannel | string
  documentType?: SaleDocumentType | string
  physicalFolio?: string | null
  requiresAdministrativeInvoice?: boolean
  subtotal?: number | string | null
  discount?: number | string | null
  tax?: number | string | null
  total?: number | string | null
  paymentType?: PaymentType | string
  collectionStatus?: CollectionStatus | string
  status?: SaleStatus | string
  createdAt?: string
  accountReceivableId?: string | null
  billingRequestId?: string | null
  billingRequestStatus?: string | null
  paymentsSummary?: PaymentsSummary
  deliveredByUserId?: string | null
  collectedByUserId?: string | null
  routeId?: string | null
  pointOfSaleDailyCloseId?: string | null
}

export type SaleDocument = {
  id?: string
  saleId?: string
  documentType?: SaleDocumentType | string
  physicalFolio?: string | null
  status?: string
  requiresAdministrativeInvoice?: boolean
  operationalLocationId?: string
  routeId?: string | null
  deliveredByUserId?: string | null
  collectedByUserId?: string | null
  createdAt?: string
  updatedAt?: string
}

export type SaleDetail = SaleListItem & {
  routePreview?: {
    id: string
    name: string
    geometry: { type: 'LineString'; coordinates: [number, number][] } | null
    mapAvailable: boolean
    distanceMeters: number | null
    durationSeconds: number | null
    order: {
      latitude: number
      longitude: number
      stopSequence: number | null
    } | null
  } | null
  items?: Array<{
    id?: string
    productId?: string
    productName?: string | null
    unit?: string
    quantityKg?: number | string | null
    quantityPieces?: number | string | null
    unitPrice?: number | string | null
    unitEquivalentId?: string | null
    appliedEquivalentFactor?: number | string | null
    roundingMode?: string | null
    subtotal?: number | string | null
  }>
  customer?: Record<string, unknown> | null
  commercialPolicy?: Record<string, unknown> | null
  accountReceivable?: Record<string, unknown> | null
  billingRequest?: Record<string, unknown> | null
  ticket?: SaleDocument | null
  documents?: SaleDocument[]
  inventoryMovements?: Array<Record<string, unknown>>
  version?: number
}

export type ListSalesFilters = {
  page?: number
  limit?: number
  dateFrom?: string
  dateTo?: string
  userId?: string
  customerId?: string
  locationId?: string
  status?: SaleStatus | ''
  paymentType?: PaymentType | ''
  collectionStatus?: CollectionStatus | ''
  saleChannel?: SaleChannel | ''
  documentType?: SaleDocumentType | ''
  physicalFolio?: string
}

export type CancelSalePayload = {
  reason: string
  expectedVersion: number
}
