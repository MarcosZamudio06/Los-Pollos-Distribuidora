export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'INSTITUTIONAL'
export type CreditStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED'
export type AgingStatusFilter = 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'LATE'
export type EffectiveCreditStatus = 'ACTIVE' | 'WARNING' | 'BLOCKED'
export type OverdueBlockingMode = 'WARN_ONLY' | 'BLOCK_NEW_CREDIT'

export type Customer = {
  id: string
  customerNumber?: string | null
  name: string
  commercialName?: string | null
  phone?: string | null
  email?: string | null
  billingEmail?: string | null
  address?: string | null
  customerType: CustomerType
  priceListId?: string | null
  creditLimit?: string | number | null
  creditDays?: number | null
  creditStatus?: CreditStatus | string | null
  requiresBilling?: boolean
  fiscalName?: string | null
  taxId?: string | null
  fiscalAddress?: string | null
  deliveryAddress?: string | null
  assignedRouteId?: string | null
  assignedRoute?: { id: string; name?: string | null } | string | null
  commercialPolicyId?: string | null
  commercialPolicy?: { id: string; name?: string | null } | string | null
  isActive?: boolean
  active?: boolean
  isBlockedForCredit?: boolean
  effectiveCreditStatus?: EffectiveCreditStatus
  creditSummary?: CustomerCreditSummary | null
  billingSummary?: BillingSummary | null
}

export type CustomerCreditSummary = {
  creditStatus?: CreditStatus | string | null
  creditLimit?: string | number | null
  creditDays?: number | null
  globalBalance?: string | number | null
  outstandingAmount?: string | number | null
  overdueAmount?: string | number | null
  availableCredit?: string | number | null
  customerId?: string
  paymentTermsDays?: number | null
  agingStatus?: AgingStatusFilter | 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | null
  collectionStatus?: string | null
  hasOverdueBalance?: boolean
  isBlocked?: boolean
  isBlockedForCredit?: boolean
  daysOverdue?: number | null
  maximumDaysOverdue?: number | null
  effectiveCreditStatus?: EffectiveCreditStatus
  blockingReasons?: string[]
  overdueBlockingMode?: OverdueBlockingMode | null
  canAdministrativeOverride?: boolean
  lastPaymentDate?: string | Date | null
  blockReason?: string | null
  blockingReason?: string | null
  commercialPolicyId?: string | null
  commercialPolicyApplied?: string | null
  billedAmount?: string | number | null
  paidAmount?: string | number | null
  finalBalance?: string | number | null
  billingSummary?: BillingSummary | null
}

export type BillingSummary = {
  billedAmount?: string | number | null
  paidAmount?: string | number | null
  finalBalance?: string | number | null
  openAdministrativeOrders?: number | null
}

export type CustomerFilters = {
  search?: string
  customerType?: CustomerType | ''
  creditStatus?: CreditStatus | ''
  agingStatus?: AgingStatusFilter | ''
  commercialPolicyId?: string
  assignedRouteId?: string
  isActive?: string
}

export type CustomerFormValues = {
  customerNumber: string
  name: string
  commercialName: string
  phone: string
  email: string
  billingEmail: string
  address: string
  customerType: CustomerType
  priceListId: string
  creditLimit: number | null
  creditDays: number | null
  creditStatus: CreditStatus
  requiresBilling: boolean
  deliveryAddress: string
  assignedRouteId: string
  commercialPolicyId: string
  fiscalName: string
  taxId: string
  fiscalAddress: string
}


export type CustomerSale = {
  id: string
  saleNumber: string
  createdAt: string | Date
  total: string | number
  paymentType: 'CASH_SALE' | 'CREDIT_SALE' | string
  collectionStatus: string
  status: string
  locationId: string
  paymentsSummary?: { totalPaid?: string | number | null; lastPaidAt?: string | Date | null; methods?: string[] }
  accountReceivableId?: string | null
  billingRequestId?: string | null
}

export type CustomerPayment = {
  id: string
  accountReceivableId?: string | null
  saleId?: string | null
  amount: string | number
  paymentMethod: string
  bankName?: string | null
  referenceNumber?: string | null
  appliedDocumentId?: string | null
  appliedDocumentType?: string | null
  routeId?: string | null
  routeSettlementId?: string | null
  status: string
  paidAt: string | Date
}
