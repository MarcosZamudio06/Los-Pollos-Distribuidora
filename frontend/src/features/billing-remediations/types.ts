export type BillingRemediationStatus = "OPEN" | "RESOLVED" | "ALL";
export type BillingRemediationFilters = {
  page: number;
  limit: number;
  status: BillingRemediationStatus;
  code?: string;
  search?: string;
};
export type BillingRemediationItem = {
  id: string;
  code: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  version: number;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedBy: { id: string; name: string } | null;
  sale: null | {
    id: string;
    version: number;
    saleNumber: string;
    documentType: string;
    legalEntityId: string | null;
    legalEntity: { legalName: string } | null;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    documents: Array<{
      id: string;
      version: number;
      documentType: string;
      status: string;
      physicalFolio: string | null;
      _count: { billingRequestDocuments: number; invoiceDocuments: number };
    }>;
    items: Array<{
      id: string;
      version: number;
      productNameSnapshot: string;
      subtotal: string;
      discount: string;
      tax: string;
      total: string;
    }>;
  };
};
export type BillingRemediationsList = {
  items: BillingRemediationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  legalEntities: Array<{ id: string; legalName: string; taxId: string }>;
};
export type ResolveBillingRemediationInput = {
  id: string;
  idempotencyKey: string;
  expectedRemediationVersion: number;
  expectedSaleVersion: number;
  expectedDocumentVersions: Array<{
    saleDocumentId: string;
    expectedVersion: number;
  }>;
  reason: string;
  correction?: Record<string, unknown>;
};
