export type DailyCloseStatus = 'DRAFT' | 'REVIEWED' | 'CLOSED' | 'CANCELLED'

export function canValidateDailyClose(status: DailyCloseStatus) {
  return status === 'DRAFT'
}

export function canAutoRefreshDailyClose(status: DailyCloseStatus) {
  return status === 'DRAFT'
}

export type CostQuality = 'EXACT' | 'ESTIMATED'

export function costQualityLabel(quality: CostQuality) {
  return quality === 'EXACT' ? 'Costo exacto' : 'Costo estimado'
}

export function canUseLocationForDailyClose(type: string) {
  return type === 'BRANCH' || type === 'MIXED' || type === 'EXTERNAL_POINT_OF_SALE'
}

export type DailyCloseSaleItem = {
  id: string
  productId: string
  productNameSnapshot: string
  productSkuSnapshot?: string | null
  unit: 'KG' | 'PIECE' | 'KG_AND_PIECE'
  unitPrice: string
  quantityKg: string | null
  quantityPieces: number | null
  subtotal: string
  total: string
  unitCostSnapshot: string
  costSubtotalSnapshot: string
  costSnapshotSource: 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL'
}

export type DailyCloseSale = {
  id?: string
  saleNumber: string
  customerId?: string | null
  documentType: string
  paymentType?: string
  status?: string
  physicalFolio?: string | null
  requiresAdministrativeInvoice?: boolean
  total?: string
  subtotal?: string
  createdAt?: string
  items?: Array<DailyCloseSaleItem>
  customer?: { id: string; name: string; taxId?: string | null } | null
  documents?: Array<DailyCloseSaleDocument>
  billingRequests?: Array<DailyCloseBillingRequest>
}

export type DailyClosePayment = {
  id: string
  saleId?: string | null
  customerId?: string | null
  accountReceivableId?: string | null
  amount: string
  paymentMethod: string
  status: string
  referenceNumber?: string | null
  paidAt: string
}

export type DailyCloseSaleDocument = {
  id: string
  saleId: string
  documentType: string
  physicalFolio?: string | null
  status: string
  requiresAdministrativeInvoice: boolean
  createdAt: string
}

export type DailyCloseBillingRequest = {
  id: string
  status: string
  requestedAt: string
  customer?: { id: string; name: string; taxId?: string | null } | null
}

export type DailyCloseInventoryMovement = {
  id: string
  productId: string
  type: string
  quantityKg: string | null
  quantityPieces: number | null
  previousQuantityKg: string | null
  newQuantityKg: string | null
  reason?: string | null
  referenceType?: string | null
  referenceId?: string | null
  createdAt: string
  product?: { id: string; name: string; sku: string | null }
}

export type DailyCloseCashMovement = {
  id: string
  amount: string
  reason: string
  reference?: string | null
  type?: string
  movementChannel?: string
  occurredAt: string
}

export type DailyCloseScaleTicketReference = {
  id: string
  physicalFolio: string
  saleId?: string | null
  saleDocumentId?: string | null
  weightKg?: string | null
  grossWeightKg?: string | null
  tareWeightKg?: string | null
  netWeightKg?: string | null
  pieceCount?: number | null
  unitPrice?: string | null
  amount?: string | null
  scaleDeviceId?: string | null
  captureSource?: 'MANUAL' | 'HARDWARE'
  product?: { name: string } | null
  capturedAt?: string
}

export type DailyCloseLine = {
  id: string
  section: string
  conceptType: string
  productId?: string | null
  saleId?: string | null
  inventoryMovementId?: string | null
  scaleTicketReferenceId?: string | null
  quantityKg?: string | null
  quantityPieces?: number | null
  amount?: string | null
  notes?: string | null
  createdAt: string
  product?: { name: string } | null
}

export type DailyCloseExcludedOperation = {
  id: string
  type: 'PAYMENT' | 'SALE'
  reference: string
  amount?: string | null
  reason: string
  occurredAt: string
}

export type DailyClose = {
  id: string; operationalLocationId: string; businessDate: string; status: DailyCloseStatus; version: number
  operationalLocation: { id: string; name: string; code?: string | null }
  totalInputKg: string; totalSoldKg: string; totalRemainingKg: string; totalShortageKg: string; totalSurplusKg: string
  scaleReportedKg: string; scaleDifferenceKg: string; cashTotal: string; cardVoucherTotal: string; transferTotal: string
  expenseTotal: string; grossSalesTotal: string; netCashExpected: string; cashCountedTotal: string | null; cashDifferenceTotal: string | null; purchaseCostTotal: string
  grossProfitTotal: string; netProfitTotal: string; lastValidatedAt?: string | null
  costQuality: CostQuality; dataAsOf: string
  cashMovements?: Array<DailyCloseCashMovement>
  scaleTicketReferences?: Array<DailyCloseScaleTicketReference>
  sales?: Array<DailyCloseSale>
  payments?: Array<DailyClosePayment>
  saleDocuments?: Array<DailyCloseSaleDocument>
  inventoryMovements?: Array<DailyCloseInventoryMovement>
  lines?: Array<DailyCloseLine>
  excludedOperations?: Array<DailyCloseExcludedOperation>
}

export function dailyCloseArray<T>(value: Array<T> | undefined): Array<T> {
  return value ?? []
}

export type DailyCloseValidationResult = {
  close: DailyClose
  valid: boolean
  errors: Array<{ code: string; message: string }>
  differences: Array<{ code: string; value: number; unit: string }>
}

type Quantity = number | string

export type DailyCloseInventoryReconciliation = {
  closeId: string
  businessDate: string
  items: Array<{
    product: { id: string; name: string; sku: string | null; unit: 'KG' | 'PIECE' | 'KG_AND_PIECE' }
    openingQuantityKg: Quantity; openingQuantityPieces: number
    entriesQuantityKg: Quantity; entriesQuantityPieces: number
    soldQuantityKg: Quantity; soldQuantityPieces: number
    otherOutputsQuantityKg: Quantity; otherOutputsQuantityPieces: number
    theoreticalQuantityKg: Quantity; theoreticalQuantityPieces: number
    physicalQuantityKg: Quantity | null; physicalQuantityPieces: number | null
    surplusQuantityKg: Quantity; surplusQuantityPieces: number
    shortageQuantityKg: Quantity; shortageQuantityPieces: number
    count?: { id: string; reason: string; countedBy: { id: string; name: string } }
  }>
}
