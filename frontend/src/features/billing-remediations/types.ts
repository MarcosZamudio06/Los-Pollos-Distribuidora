export type BillingRemediationStatus = 'OPEN' | 'RESOLVED' | 'ALL'
export type BillingRemediationFilters = { page: number; limit: number; status: BillingRemediationStatus; code?: string; search?: string }
export type BillingRemediationItem = {
  id: string; code: string; entityType: string; entityId: string; details: Record<string, unknown>;
  resolvedAt: string | null; resolvedByUserId: string | null; resolutionNotes: string | null; createdAt: string; updatedAt: string;
  resolvedBy: { id: string; name: string } | null;
  sale: null | {
    id: string; saleNumber: string; documentType: string; legalEntityId: string | null; legalEntity: { legalName: string } | null;
    subtotal: string; discount: string; tax: string; total: string;
    documents: Array<{ id: string; documentType: string; status: string; physicalFolio: string | null; _count: { billingRequestDocuments: number; invoiceDocuments: number } }>;
    items: Array<{ id: string; productNameSnapshot: string; subtotal: string; discount: string; tax: string; total: string }>;
  };
}
export type BillingRemediationsList = {
  items: BillingRemediationItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  legalEntities: Array<{ id: string; legalName: string; taxId: string }>;
}
export type ResolveBillingRemediationInput = { id: string; expectedUpdatedAt: string; reason: string; correction?: Record<string, unknown> }
