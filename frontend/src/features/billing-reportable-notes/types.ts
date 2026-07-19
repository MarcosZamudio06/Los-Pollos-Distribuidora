export type BillingStatus = 'NOT_BILLABLE' | 'BILLABLE' | 'PENDING_INFORMATION' | 'REQUESTED' | 'IN_PROCESS' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED' | 'BLOCKED' | 'CANCELLED'
export type BillingReportFilters = { page?: number; limit?: number; search?: string; billingStatus?: BillingStatus | ''; documentType?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }
export type BillingReportSummary = { totalDocuments: number; billableDocuments: number; blockedDocuments: number; totalBillable: string; totalRequested: string; totalInvoiced: string; totalPending: string }
export type BillingReportItem = {
  saleDocumentId: string; saleId: string; saleNumber: string; issuedAt: string; documentType: string; physicalFolio?: string | null;
  customerId: string; customerName: string; taxId?: string | null; fiscalProfileComplete: boolean; sellerName: string; locationName: string;
  currencyCode: string; legalEntityId: string; total: string; activeRequested: string; activeInvoiced: string; pendingInvoice: string;
  activePaid: string; collectionBalance: string; billingStatus: BillingStatus; blockingCodes: string[];
}
export type BillingReportList = { items: BillingReportItem[]; pagination: { page: number; limit: number; total: number; totalPages: number }; summary: BillingReportSummary; generatedAt: string; dataAsOf: string; freshnessSeconds: number; isStale: boolean }
export type BillingReportDetail = BillingReportItem & { items: Array<Record<string, string>>; requests: Array<{ id: string; status: string; version: number; requestedAt: string; requestedTotal: string }>; invoices: Array<Record<string, string | null>>; payments: Array<Record<string, string>>; delivery: Record<string, string | null> | null; audit: Array<{ id: string; action: string; actorName: string; reason?: string | null; createdAt: string }> }
