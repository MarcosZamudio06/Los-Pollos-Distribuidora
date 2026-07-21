export type BillingRequestStatus = 'REQUESTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type BillingRequestHistory = {
  id: string
  fromStatus?: BillingRequestStatus | null
  toStatus: BillingRequestStatus
  changedByUserId: string
  changedAt: string
  reason: string
  notes?: string | null
  changedBy?: { id: string; name: string } | null
}

export type BillingRequest = {
  id: string
  customerId: string
  customerName?: string | null
  saleId: string
  saleNumber?: string | null
  locationId?: string | null
  requestedByUserId: string
  reviewedByUserId?: string | null
  status: BillingRequestStatus
  version: number
  requestedAt: string
  reviewedAt?: string | null
  reason?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type BillingRequestDetail = BillingRequest & {
  customer?: { id: string; name: string } | null
  sale?: { id: string; saleNumber?: string; locationId?: string; status?: string; customerId?: string | null; legalEntityId?: string | null; currencyCode?: string } | null
  accountReceivable?: { id: string; status?: string; outstandingAmount?: string | number } | null
  requestedBy?: { id: string; name: string } | null
  reviewedBy?: { id: string; name: string } | null
  history?: BillingRequestHistory[]
  documents?: BillingRequestDocument[]
}

export type BillingRequestSaleItem = { id: string; productNameSnapshot: string; productSkuSnapshot?: string | null; subtotal: string | number; tax: string | number; total: string | number }
export type BillingRequestedItem = { saleItemId: string; requestedSubtotal: string | number; requestedTax: string | number; requestedTotal: string | number; saleItem: Pick<BillingRequestSaleItem, 'id' | 'productNameSnapshot'> }
export type BillingRequestDocument = { id: string; saleDocumentId: string; requestedSubtotal: string | number; requestedTax: string | number; requestedTotal: string | number; requestedItems: BillingRequestedItem[]; saleDocument: { id: string; documentType: string; physicalFolio?: string | null; sale: { id: string; legalEntityId?: string | null; currencyCode: string; items: BillingRequestSaleItem[] } } }
export type InvoiceItemApplication = { saleItemId: string; productName: string; subtotalApplied: string; taxApplied: string; totalApplied: string }
export type InvoiceDocumentApplication = { saleDocumentId: string; label: string; subtotalApplied: string; taxApplied: string; totalApplied: string; items: InvoiceItemApplication[] }
export type InvoiceReconciliationInput = { expectedVersion: number; invoice: { legalEntityId: string; currencyCode: string; series: string; folio: string; uuid?: string; subtotal: string; discount: string; tax: string; total: string }; applications: InvoiceDocumentApplication[] }

export type BillingRequestFilters = {
  page?: number
  limit?: number
  customerId?: string
  saleId?: string
  status?: BillingRequestStatus | ''
  dateFrom?: string
  dateTo?: string
  locationId?: string
}

export type BillingRequestList = {
  items: BillingRequest[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type BillingRequestMutation = { status?: BillingRequestStatus; expectedVersion?: number; reason?: string; notes?: string }
