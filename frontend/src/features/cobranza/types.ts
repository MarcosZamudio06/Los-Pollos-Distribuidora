export type AgingStatus = 'CURRENT' | 'DUE_SOON' | 'OVERDUE'
export type CollectionStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'
export type CreditStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | string
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'DEPOSIT' | 'CARD' | 'CHECK' | string

export type AccountsReceivableFilters = {
  customerId?: string
  saleId?: string
  billingRequestId?: string
  status?: CollectionStatus | ''
  agingStatus?: AgingStatus | ''
  dueDateFrom?: string
  dueDateTo?: string
  onlyOverdue?: boolean
  onlyUpcoming?: boolean
}

export type AccountReceivable = {
  id: string
  customerId: string
  customerName?: string | null
  customerCreditStatus?: CreditStatus | null
  saleId?: string | null
  saleNumber?: string | null
  billingRequestId?: string | null
  originalAmount: string | number
  outstandingAmount: string | number
  saleDate: string | Date
  dueDate: string | Date
  paymentTermsDays?: number | null
  lastPaymentDate?: string | Date | null
  daysOverdue?: number | null
  paidAt?: string | Date | null
  cancelledAt?: string | Date | null
  commercialPolicyId?: string | null
  physicalDocumentFolio?: string | null
  collectorUserId?: string | null
  status: CollectionStatus | string
  agingStatus: AgingStatus | string
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type ReceivablePayment = {
  id: string
  accountReceivableId: string
  saleId?: string | null
  customerId?: string | null
  amount: string | number
  paymentMethod: PaymentMethod
  bankName?: string | null
  referenceNumber?: string | null
  appliedDocumentId?: string | null
  appliedDocumentType?: string | null
  routeId?: string | null
  routeSettlementId?: string | null
  collectedByUserId?: string | null
  collectionPass?: number | null
  status: string
  paidAt: string | Date
}

export type AccountReceivableDetail = AccountReceivable & {
  customer?: {
    id: string
    name: string
    customerType?: string | null
    creditStatus?: CreditStatus | null
    customerNumber?: string | null
    commercialName?: string | null
  } | null
  sale?: {
    id: string
    saleNumber?: string | null
    total?: string | number | null
    locationId?: string | null
    documentType?: string | null
    physicalFolio?: string | null
  } | null
  billingRequest?: unknown | null
  payments?: ReceivablePayment[]
}

export type ReceivablePaymentFormValues = {
  accountReceivableId: string
  amount: number
  paymentMethod: PaymentMethod
  bankName?: string
  referenceNumber?: string
  appliedDocumentId?: string
  appliedDocumentType?: string
  collectionPass?: number
  paidAt?: string
}

export type RegisterPaymentResponse = {
  payment: ReceivablePayment
  accountReceivable: AccountReceivable
}
