export type BillingStatus = 'NOT_BILLABLE' | 'BILLABLE' | 'PENDING_INFORMATION' | 'REQUESTED' | 'IN_PROCESS' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED' | 'BLOCKED' | 'CANCELLED'
export type BillingReportFilters = {
  page?: number; limit?: number; search?: string; billingStatus?: BillingStatus | ''; documentType?: string;
  dateFrom?: string; dateTo?: string; locationId?: string; customerId?: string; taxId?: string; sellerId?: string; routeId?: string;
  paymentStatus?: string; deliveryStatus?: string; hasRequest?: boolean; fiscalProfileComplete?: boolean; overdue?: boolean; blocked?: boolean;
  folio?: string; uuid?: string; sortBy?: string; sortOrder?: 'asc' | 'desc';
}
export type BillingReportSummary = { totalDocuments: number; billableDocuments: number; blockedDocuments: number; totalBillable: string; totalRequested: string; totalInvoiced: string; totalPending: string; totalCollected: string; totalReceivable: string }
export type BillingReportItem = {
  saleDocumentId: string; saleId: string; saleNumber: string; issuedAt: string; documentType: string; physicalFolio?: string | null;
  customerId: string; customerName: string; taxId?: string | null; fiscalProfileComplete: boolean; sellerName: string; locationName: string;
  currencyCode: string; legalEntityId: string; total: string; activeRequested: string; activeInvoiced: string; pendingInvoice: string;
  pendingSubtotal: string; pendingTax: string; pendingTotal: string;
  requestableItems: ReadonlyArray<{ saleItemId: string; productName: string; pendingSubtotal: string; pendingTax: string; pendingTotal: string }>;
  activePaid: string; collectionBalance: string; billingStatus: BillingStatus; blockingCodes: string[];
}
export type BillingReportList = { items: BillingReportItem[]; pagination: { page: number; limit: number; total: number; totalPages: number }; summary: BillingReportSummary; generatedAt: string; dataAsOf: string; freshnessSeconds: number; isStale: boolean }
export type BillingInvoiceRecord = Record<string, string | null> & { id: string; status: string; reversedAt?: string | null }
export type BillingReportDetail = BillingReportItem & { items: Array<Record<string, string>>; requests: Array<{ id: string; status: string; version: number; requestedAt: string; requestedTotal: string }>; activeInvoices: BillingInvoiceRecord[]; invoiceHistory: BillingInvoiceRecord[]; payments: Array<Record<string, string>>; delivery: Record<string, string | null> | null; audit: Array<{ id: string; action: string; actorName: string; reason?: string | null; createdAt: string }> }
