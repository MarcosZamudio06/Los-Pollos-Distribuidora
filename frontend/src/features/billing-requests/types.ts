export type BillingRequestStatus =
  "REQUESTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";

export type SatCatalogKey =
  | "c_ClaveProdServ"
  | "c_ClaveUnidad"
  | "c_RegimenFiscal"
  | "c_UsoCFDI"
  | "c_FormaPago"
  | "c_MetodoPago"
  | "c_Impuesto"
  | "c_TasaOCuota"
  | "c_TipoDeComprobante"
  | "c_Moneda"
  | "c_MotivoCancelacion"
  | "c_CodigoPostal"
  | "c_ObjetoImp"
  | "c_TipoRelacion";

export type SatCatalogEntry = {
  code: string;
  description: string;
  validFrom?: string | null;
  validTo?: string | null;
  metadata?: unknown;
};

export type SatCatalog = {
  key: SatCatalogKey;
  configured: boolean;
  activeVersion: {
    id: string;
    sourceVersion: string;
    checksumSha256: string;
    rowCount: number;
    activatedAt?: string | null;
  } | null;
  entries: SatCatalogEntry[];
};

export type SatCatalogListItem = {
  key: SatCatalogKey;
  description: string;
  configured: boolean;
  activeVersion: SatCatalog["activeVersion"];
};

export type BillingRequestHistory = {
  id: string;
  fromStatus?: BillingRequestStatus | null;
  toStatus: BillingRequestStatus;
  changedByUserId: string;
  changedAt: string;
  reason: string;
  notes?: string | null;
  changedBy?: { id: string; name: string } | null;
};

export type BillingRequest = {
  id: string;
  customerId: string;
  customerName?: string | null;
  saleId: string;
  saleNumber?: string | null;
  locationId?: string | null;
  requestedByUserId: string;
  reviewedByUserId?: string | null;
  status: BillingRequestStatus;
  version: number;
  requestedAt: string;
  reviewedAt?: string | null;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingRequestDetail = BillingRequest & {
  customer?: {
    id: string;
    name: string;
    fiscalName?: string | null;
    taxId?: string | null;
    fiscalAddress?: string | null;
    fiscalPostalCode?: string | null;
    fiscalRegime?: string | null;
    fiscalUseCode?: string | null;
    billingEmail?: string | null;
    requiresBilling?: boolean;
  } | null;
  sale?: {
    id: string;
    saleNumber?: string;
    locationId?: string;
    status?: string;
    customerId?: string | null;
    legalEntityId?: string | null;
    currencyCode?: string;
    legalEntity?: BillingRequestFiscalIssuer | null;
  } | null;
  accountReceivable?: {
    id: string;
    status?: string;
    outstandingAmount?: string | number;
  } | null;
  requestedBy?: { id: string; name: string } | null;
  reviewedBy?: { id: string; name: string } | null;
  history?: BillingRequestHistory[];
  documents?: BillingRequestDocument[];
  nativeInvoice?: BillingRequestNativeInvoice | null;
  cfdiReview?: BillingRequestFiscalReview | null;
};

export type BillingRequestFiscalIssuer = {
  id: string;
  legalName?: string | null;
  taxId?: string | null;
  fiscalPostalCode?: string | null;
  fiscalRegime?: string | null;
  cfdiEnabled?: boolean;
  isActive?: boolean;
  defaultSeries?: string | null;
  certificateSerialNumber?: string | null;
  certificateFingerprint?: string | null;
  certificateValidFrom?: string | null;
  certificateValidTo?: string | null;
};

export type BillingRequestFiscalConcept = {
  billingRequestItemId?: string | null;
  saleItemId: string;
  productId?: string | null;
  description?: string | null;
  sku?: string | null;
  quantity?: string | null;
  operationalUnit?: string | null;
  productServiceCode?: string | null;
  unitCode?: string | null;
  taxObjectCode?: string | null;
  taxCode?: string | null;
  factorType?: string | null;
  rateOrQuota?: string | null;
  unitValue?: string | null;
  amount: string;
  discount: string;
  taxableBase: string;
  tax: string;
  total: string;
};

export type BillingRequestFiscalReview = {
  currencyCode?: string | null;
  issuer?: BillingRequestFiscalIssuer | null;
  receiver?: {
    id: string;
    fiscalName?: string | null;
    taxId?: string | null;
    fiscalAddress?: string | null;
    fiscalPostalCode?: string | null;
    fiscalRegime?: string | null;
    fiscalUseCode?: string | null;
    billingEmail?: string | null;
  } | null;
  concepts: ReadonlyArray<BillingRequestFiscalConcept>;
  totals: {
    subtotal: string;
    discount: string;
    taxableBase: string;
    tax: string;
    total: string;
  };
  profile: {
    complete: boolean;
    issuerMissingFields: ReadonlyArray<string>;
    receiverMissingFields: ReadonlyArray<string>;
    conceptIssues: ReadonlyArray<{
      saleItemId: string;
      missingFields: ReadonlyArray<string>;
    }>;
  };
};

export type BillingRequestNativeInvoice = {
  id: string;
  uuid?: string | null;
  version?: number;
  status?: "ACTIVE" | "CANCELLED" | string;
  series: string;
  folio: string;
  cfdiVersion?: string | null;
  cfdiType?: string | null;
  issuedAt?: string | null;
  stampedAt?: string | null;
  fiscalStatus: string;
  cancellationStatus: string;
  cancellationMotiveCode?: "01" | "02" | "03" | "04" | string | null;
  internalReason?: string | null;
  replacementInvoiceId?: string | null;
  replacementUuid?: string | null;
  fiscalUseCode?: string | null;
  exportCode?: string | null;
  paymentFormCode?: string | null;
  paymentMethodCode?: string | null;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  fiscalAttemptCount?: number;
  lastFiscalAttemptAt?: string | null;
  lastFiscalErrorCode?: string | null;
  lastFiscalErrorMessage?: string | null;
  concepts?: Array<{
    id: string;
    lineNumber: number;
    description: string;
    productServiceCode: string;
    unitCode: string;
    taxObjectCode: string;
    amount: string | number;
    discount: string | number;
    taxAmount: string | number;
    total: string | number;
  }>;
  fiscalOperationAttempts?: Array<{
    id: string;
    operation: string;
    status: string;
    correlationId: string;
    attemptNumber: number;
    startedAt?: string | null;
    completedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }>;
  fiscalArtifacts?: Array<{
    id: string;
    type: "XML" | "PDF" | "CANCELLATION_ACK" | string;
    status: "PENDING" | "AVAILABLE" | "FAILED" | string;
    version: number;
    mimeType: string;
    sha256?: string | null;
    storedAt?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  }>;
};

export type CreditAdjustmentSourceType =
  "APPROVED_RETURN" | "BONUS" | "POST_SALE_DISCOUNT" | "COMMERCIAL_ADJUSTMENT";

export type CreateCreditAdjustmentInput = {
  sourceType: CreditAdjustmentSourceType;
  sourceReference?: string;
  internalReason: string;
  paymentFormCode: string;
  applications: Array<{
    invoiceId: string;
    lines: Array<{ invoiceConceptId: string; creditTotal: string }>;
  }>;
};

export type CreditAdjustment = {
  id: string;
  status:
    | "DRAFT"
    | "APPROVED"
    | "ISSUING"
    | "UNKNOWN"
    | "ISSUED"
    | "ISSUE_ERROR"
    | "REJECTED"
    | "CANCELLED";
  sourceType: CreditAdjustmentSourceType;
  sourceReference?: string | null;
  internalReason: string;
  paymentFormCode: string;
  relationshipTypeCode: "01" | "03";
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  version: number;
  authorizedAt?: string | null;
  fiscalInvoice?: {
    id: string;
    fiscalStatus: string;
    uuid?: string | null;
    series: string;
    folio: string;
  } | null;
};

export type CreditNoteIssuanceResult = {
  creditAdjustmentId: string;
  invoiceId: string;
  attemptId: string;
  fiscalStatus: string;
  operationStatus: string;
  adjustmentStatus: string;
  uuid?: string | null;
  replayed: boolean;
};

export type FiscalCancellationMotive = "01" | "02" | "03" | "04";

export type CancelInvoiceInput = {
  expectedVersion: number;
  cancellationMotiveCode: FiscalCancellationMotive;
  internalReason: string;
  replacementInvoiceId?: string;
};

export type FiscalCancellationStatus = {
  invoiceId: string;
  uuid?: string | null;
  invoiceStatus: string;
  fiscalStatus: string;
  cancellationStatus: string;
  state: "NOT_REQUESTED" | "PENDING" | "CANCELLED" | "REJECTED" | "ERROR";
  cancelledAt?: string | null;
  cancellationMotiveCode?: FiscalCancellationMotive | string | null;
  internalReason?: string | null;
  replacementInvoiceId?: string | null;
  replacementUuid?: string | null;
  version: number;
  nextRetryAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  latestOperation?: {
    id: string;
    operation: string;
    status: string;
    attemptNumber: number;
    correlationId: string;
    startedAt?: string | null;
    completedAt?: string | null;
    nextRetryAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt?: string | null;
  } | null;
  acknowledgment?: {
    id: string;
    type: "CANCELLATION_ACK";
    status: string;
    available: boolean;
    version: number;
    mimeType: string;
    sizeBytes?: string | null;
    sha256?: string | null;
    storedAt?: string | null;
  } | null;
};

export type BillingRequestSaleItem = {
  id: string;
  productNameSnapshot: string;
  productSkuSnapshot?: string | null;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
};
export type BillingRequestedItem = {
  saleItemId: string;
  requestedSubtotal: string | number;
  requestedTax: string | number;
  requestedTotal: string | number;
  saleItem: Pick<BillingRequestSaleItem, "id" | "productNameSnapshot">;
};
export type BillingRequestDocument = {
  id: string;
  saleDocumentId: string;
  requestedSubtotal: string | number;
  requestedTax: string | number;
  requestedTotal: string | number;
  requestedItems: BillingRequestedItem[];
  saleDocument: {
    id: string;
    documentType: string;
    physicalFolio?: string | null;
    sale: {
      id: string;
      legalEntityId?: string | null;
      currencyCode: string;
      items: BillingRequestSaleItem[];
    };
  };
};
export type InvoiceItemApplication = {
  saleItemId: string;
  productName: string;
  subtotalApplied: string;
  taxApplied: string;
  totalApplied: string;
};
export type InvoiceDocumentApplication = {
  saleDocumentId: string;
  label: string;
  subtotalApplied: string;
  taxApplied: string;
  totalApplied: string;
  items: InvoiceItemApplication[];
};
export type InvoiceReconciliationInput = {
  expectedVersion: number;
  invoice: {
    legalEntityId: string;
    currencyCode: string;
    series: string;
    folio: string;
    uuid?: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
  };
  applications: InvoiceDocumentApplication[];
};

export type IssueCfdiInput = {
  expectedVersion: number;
  cfdiUse: string;
  paymentMethod: "PUE" | "PPD";
  paymentForm: string;
  exportCode: string;
  tipoCambio?: string;
};

export type CfdiIssuanceResult = {
  billingRequestId: string;
  invoiceId: string;
  attemptId: string;
  fiscalStatus: string;
  operationStatus: string;
  uuid: string | null;
  replayed: boolean;
};

export type FiscalArtifactDownload = {
  invoiceId: string;
  artifactType: "XML" | "PDF";
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  expiresInSeconds: number;
  url: string;
};

export type BillingRequestFilters = {
  page?: number;
  limit?: number;
  customerId?: string;
  saleId?: string;
  status?: BillingRequestStatus | "";
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
};

export type BillingRequestList = {
  items: BillingRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type BillingRequestMutation = {
  status?: BillingRequestStatus;
  expectedVersion?: number;
  reason?: string;
  notes?: string;
};
