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
  requestedAt: string
  reviewedAt?: string | null
  reason?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type BillingRequestDetail = BillingRequest & {
  customer?: { id: string; name: string } | null
  sale?: { id: string; saleNumber?: string; locationId?: string; status?: string; customerId?: string | null } | null
  accountReceivable?: { id: string; status?: string; outstandingAmount?: string | number } | null
  requestedBy?: { id: string; name: string } | null
  reviewedBy?: { id: string; name: string } | null
  history?: BillingRequestHistory[]
}

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

export type BillingRequestMutation = { status?: BillingRequestStatus; reason?: string; notes?: string }
