-- Phase 1: expand
CREATE TYPE "InvoiceStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'SUBSTITUTED');

ALTER TABLE "Customer"
  ADD COLUMN "fiscalPostalCode" TEXT,
  ADD COLUMN "fiscalRegime" TEXT,
  ADD COLUMN "fiscalUseCode" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN "legalEntityId" TEXT;

ALTER TABLE "SaleItem"
  ADD COLUMN "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxableBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "total" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "BillingRequest"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "saleId" DROP NOT NULL;

CREATE TABLE "LegalEntity" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "fiscalPostalCode" TEXT,
  "fiscalRegime" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalEntityOperationalLocation" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "operationalLocationId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalEntityOperationalLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "series" TEXT NOT NULL,
  "folio" TEXT NOT NULL,
  "uuid" TEXT,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancellationReason" TEXT,
  "substitutedByInvoiceId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingRequestSaleDocument" (
  "id" TEXT NOT NULL,
  "billingRequestId" TEXT NOT NULL,
  "saleDocumentId" TEXT NOT NULL,
  "requestedSubtotal" DECIMAL(14,2) NOT NULL,
  "requestedTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "requestedTotal" DECIMAL(14,2) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reversedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRequestSaleDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceSaleDocument" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "saleDocumentId" TEXT NOT NULL,
  "subtotalApplied" DECIMAL(14,2) NOT NULL,
  "taxApplied" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalApplied" DECIMAL(14,2) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reversedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceSaleDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceSaleItemApplication" (
  "id" TEXT NOT NULL,
  "invoiceSaleDocumentId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "subtotalApplied" DECIMAL(14,2) NOT NULL,
  "taxApplied" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalApplied" DECIMAL(14,2) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reversedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceSaleItemApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingDataRemediation" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingDataRemediation_pkey" PRIMARY KEY ("id")
);

-- Phase 1: backfill historical item amounts and requested SaleDocument rows.
UPDATE "SaleItem"
SET "taxableBase" = "subtotal", "total" = "subtotal";

-- BACKFILL_MISSING_SALE_DOCUMENT: Sale.documentType is authoritative when no
-- document of that type exists. Snapshot data is copied from the latest existing
-- document when available. Existing duplicates are never guessed or deleted.
INSERT INTO "SaleDocument" (
  "id", "saleId", "documentType", "operationalLocationId", "physicalFolio",
  "status", "requiresAdministrativeInvoice", "customerSnapshot",
  "productSnapshot", "priceSnapshot", "createdAt", "updatedAt"
)
SELECT
  'billing-doc-' || md5(s."id" || ':' || s."documentType"::text),
  s."id", s."documentType", s."locationId",
  COALESCE(s."physicalFolio", s."saleNumber"), 'ISSUED',
  s."requiresAdministrativeInvoice", snapshot."customerSnapshot",
  snapshot."productSnapshot", snapshot."priceSnapshot", s."createdAt", NOW()
FROM "Sale" s
LEFT JOIN LATERAL (
  SELECT d."customerSnapshot", d."productSnapshot", d."priceSnapshot"
  FROM "SaleDocument" d
  WHERE d."saleId" = s."id"
  ORDER BY d."createdAt" DESC
  LIMIT 1
) snapshot ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "SaleDocument" d
  WHERE d."saleId" = s."id" AND d."documentType" = s."documentType"
);

INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'billing-remediation-doc-' || md5(s."id"),
  'AMBIGUOUS_SALE_DOCUMENT', 'Sale', s."id",
  jsonb_build_object('documentType', s."documentType", 'matchingDocuments', COUNT(d."id")),
  NOW()
FROM "Sale" s
JOIN "SaleDocument" d
  ON d."saleId" = s."id" AND d."documentType" = s."documentType"
GROUP BY s."id", s."documentType"
HAVING COUNT(d."id") > 1;

-- A legal issuer cannot be inferred from an operational location. Record every
-- unresolved legacy sale for explicit reconciliation instead of inventing data.
INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'billing-remediation-issuer-' || md5(s."id"),
  'MISSING_LEGAL_ENTITY_MAPPING', 'Sale', s."id",
  jsonb_build_object('operationalLocationId', s."locationId", 'currencyCode', s."currencyCode"),
  NOW()
FROM "Sale" s
WHERE s."legalEntityId" IS NULL;

INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'billing-remediation-item-amounts-' || md5(s."id"),
  'UNALLOCATED_ITEM_AMOUNTS', 'Sale', s."id",
  jsonb_build_object('discount', s."discount", 'tax', s."tax"),
  NOW()
FROM "Sale" s
WHERE s."discount" <> 0 OR s."tax" <> 0;

INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'billing-remediation-total-' || md5(s."id"),
  'INVALID_SALE_TOTAL', 'Sale', s."id",
  jsonb_build_object(
    'subtotal', s."subtotal", 'discount', s."discount", 'tax', s."tax", 'total', s."total"
  ),
  NOW()
FROM "Sale" s
WHERE s."total" <= 0 OR s."subtotal" - s."discount" + s."tax" <> s."total";

INSERT INTO "BillingRequestSaleDocument" (
  "id", "billingRequestId", "saleDocumentId", "requestedSubtotal",
  "requestedTax", "requestedTotal", "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  'billing-request-doc-' || md5(br."id" || ':' || d."id"),
  br."id", d."id", s."subtotal" - s."discount", s."tax", s."total",
  br."requestedByUserId", br."createdAt", NOW()
FROM "BillingRequest" br
JOIN "Sale" s ON s."id" = br."saleId"
JOIN "SaleDocument" d
  ON d."saleId" = s."id" AND d."documentType" = s."documentType"
WHERE (
  SELECT COUNT(*) FROM "SaleDocument" matches
  WHERE matches."saleId" = s."id" AND matches."documentType" = s."documentType"
  ) = 1
  AND s."total" > 0
  AND s."subtotal" - s."discount" + s."tax" = s."total";

-- Phase 1: validate and contract incompatible legacy uniqueness.
DROP INDEX "BillingRequest_saleId_key";
DROP INDEX "AccountReceivable_billingRequestId_key";

CREATE UNIQUE INDEX "LegalEntity_taxId_key" ON "LegalEntity"("taxId");
CREATE INDEX "LegalEntity_isActive_legalName_idx" ON "LegalEntity"("isActive", "legalName");
CREATE UNIQUE INDEX "LegalEntityOperationalLocation_identity_key" ON "LegalEntityOperationalLocation"("legalEntityId", "operationalLocationId", "effectiveFrom");
CREATE INDEX "LegalEntityOperationalLocation_active_idx" ON "LegalEntityOperationalLocation"("operationalLocationId", "effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "Invoice_uuid_key" ON "Invoice"("uuid");
CREATE UNIQUE INDEX "Invoice_issuer_series_folio_key" ON "Invoice"("legalEntityId", "series", "folio");
CREATE UNIQUE INDEX "Invoice_substitutedByInvoiceId_key" ON "Invoice"("substitutedByInvoiceId");
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");
CREATE INDEX "Invoice_issuer_currency_createdAt_idx" ON "Invoice"("legalEntityId", "currencyCode", "createdAt");
CREATE UNIQUE INDEX "BillingRequestSaleDocument_request_document_key" ON "BillingRequestSaleDocument"("billingRequestId", "saleDocumentId");
CREATE INDEX "BillingRequestSaleDocument_document_active_idx" ON "BillingRequestSaleDocument"("saleDocumentId", "reversedAt");
CREATE UNIQUE INDEX "InvoiceSaleDocument_active_key" ON "InvoiceSaleDocument"("invoiceId", "saleDocumentId") WHERE "reversedAt" IS NULL;
CREATE INDEX "InvoiceSaleDocument_document_active_idx" ON "InvoiceSaleDocument"("saleDocumentId", "reversedAt");
CREATE UNIQUE INDEX "InvoiceSaleItemApplication_active_key" ON "InvoiceSaleItemApplication"("invoiceSaleDocumentId", "saleItemId") WHERE "reversedAt" IS NULL;
CREATE INDEX "InvoiceSaleItemApplication_item_active_idx" ON "InvoiceSaleItemApplication"("saleItemId", "reversedAt");
CREATE UNIQUE INDEX "BillingDataRemediation_identity_key" ON "BillingDataRemediation"("code", "entityType", "entityId");
CREATE INDEX "BillingDataRemediation_open_idx" ON "BillingDataRemediation"("resolvedAt", "code");
CREATE INDEX "Sale_legalEntityId_currencyCode_createdAt_idx" ON "Sale"("legalEntityId", "currencyCode", "createdAt");
CREATE INDEX "SaleDocument_documentType_status_createdAt_idx" ON "SaleDocument"("documentType", "status", "createdAt");
CREATE INDEX "SaleDocument_saleId_documentType_idx" ON "SaleDocument"("saleId", "documentType");
CREATE INDEX "BillingRequest_saleId_idx" ON "BillingRequest"("saleId");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LegalEntityOperationalLocation" ADD CONSTRAINT "LegalEntityOperationalLocation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalEntityOperationalLocation" ADD CONSTRAINT "LegalEntityOperationalLocation_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_substitutedByInvoiceId_fkey" FOREIGN KEY ("substitutedByInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingRequestSaleDocument" ADD CONSTRAINT "BillingRequestSaleDocument_billingRequestId_fkey" FOREIGN KEY ("billingRequestId") REFERENCES "BillingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRequestSaleDocument" ADD CONSTRAINT "BillingRequestSaleDocument_saleDocumentId_fkey" FOREIGN KEY ("saleDocumentId") REFERENCES "SaleDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRequestSaleDocument" ADD CONSTRAINT "BillingRequestSaleDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRequestSaleDocument" ADD CONSTRAINT "BillingRequestSaleDocument_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleDocument" ADD CONSTRAINT "InvoiceSaleDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleDocument" ADD CONSTRAINT "InvoiceSaleDocument_saleDocumentId_fkey" FOREIGN KEY ("saleDocumentId") REFERENCES "SaleDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleDocument" ADD CONSTRAINT "InvoiceSaleDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleDocument" ADD CONSTRAINT "InvoiceSaleDocument_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleItemApplication" ADD CONSTRAINT "InvoiceSaleItemApplication_invoiceSaleDocumentId_fkey" FOREIGN KEY ("invoiceSaleDocumentId") REFERENCES "InvoiceSaleDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleItemApplication" ADD CONSTRAINT "InvoiceSaleItemApplication_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleItemApplication" ADD CONSTRAINT "InvoiceSaleItemApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSaleItemApplication" ADD CONSTRAINT "InvoiceSaleItemApplication_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingDataRemediation" ADD CONSTRAINT "BillingDataRemediation_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION billing_request_document_amount_guard()
RETURNS TRIGGER AS $$
DECLARE available_total DECIMAL(14,2); active_total DECIMAL(14,2);
BEGIN
  IF NEW."requestedSubtotal" < 0 OR NEW."requestedTax" < 0 OR NEW."requestedTotal" <= 0
     OR NEW."requestedSubtotal" + NEW."requestedTax" <> NEW."requestedTotal" THEN
    RAISE EXCEPTION 'Invalid requested billing amount';
  END IF;
  SELECT s."total" INTO available_total FROM "SaleDocument" d JOIN "Sale" s ON s."id" = d."saleId" WHERE d."id" = NEW."saleDocumentId" FOR UPDATE OF d;
  SELECT COALESCE(SUM(r."requestedTotal"), 0) INTO active_total FROM "BillingRequestSaleDocument" r JOIN "BillingRequest" b ON b."id" = r."billingRequestId" WHERE r."saleDocumentId" = NEW."saleDocumentId" AND r."reversedAt" IS NULL AND b."status" NOT IN ('REJECTED', 'CANCELLED') AND r."id" <> NEW."id";
  IF active_total + NEW."requestedTotal" > available_total THEN RAISE EXCEPTION 'Requested amount exceeds sale document total'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER billing_request_document_amount_guard BEFORE INSERT OR UPDATE ON "BillingRequestSaleDocument" FOR EACH ROW EXECUTE FUNCTION billing_request_document_amount_guard();

CREATE OR REPLACE FUNCTION invoice_document_amount_guard()
RETURNS TRIGGER AS $$
DECLARE available_total DECIMAL(14,2); active_total DECIMAL(14,2);
BEGIN
  IF NEW."subtotalApplied" < 0 OR NEW."taxApplied" < 0 OR NEW."totalApplied" <= 0
     OR NEW."subtotalApplied" + NEW."taxApplied" <> NEW."totalApplied" THEN
    RAISE EXCEPTION 'Invalid invoice application amount';
  END IF;
  SELECT s."total" INTO available_total FROM "SaleDocument" d JOIN "Sale" s ON s."id" = d."saleId" WHERE d."id" = NEW."saleDocumentId" FOR UPDATE OF d;
  SELECT COALESCE(SUM(a."totalApplied"), 0) INTO active_total FROM "InvoiceSaleDocument" a JOIN "Invoice" i ON i."id" = a."invoiceId" WHERE a."saleDocumentId" = NEW."saleDocumentId" AND a."reversedAt" IS NULL AND i."status" = 'ACTIVE' AND a."id" <> NEW."id";
  IF active_total + NEW."totalApplied" > available_total THEN RAISE EXCEPTION 'Invoice application exceeds sale document total'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_document_amount_guard BEFORE INSERT OR UPDATE ON "InvoiceSaleDocument" FOR EACH ROW EXECUTE FUNCTION invoice_document_amount_guard();

CREATE OR REPLACE FUNCTION invoice_item_application_amount_guard()
RETURNS TRIGGER AS $$
DECLARE
  document_application_id TEXT;
  document_subtotal DECIMAL(14,2);
  document_tax DECIMAL(14,2);
  document_total DECIMAL(14,2);
  item_subtotal DECIMAL(14,2);
  item_tax DECIMAL(14,2);
  item_total DECIMAL(14,2);
  document_reversed_at TIMESTAMP(3);
  document_sale_id TEXT;
  item_sale_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'InvoiceSaleDocument' THEN
    document_application_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    document_application_id := OLD."invoiceSaleDocumentId";
  ELSE
    document_application_id := NEW."invoiceSaleDocumentId";
  END IF;

  SELECT a."subtotalApplied", a."taxApplied", a."totalApplied", a."reversedAt", d."saleId"
  INTO document_subtotal, document_tax, document_total, document_reversed_at, document_sale_id
  FROM "InvoiceSaleDocument" a
  JOIN "SaleDocument" d ON d."id" = a."saleDocumentId"
  WHERE a."id" = document_application_id;

  IF NOT FOUND OR document_reversed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(i."subtotalApplied"), 0),
    COALESCE(SUM(i."taxApplied"), 0),
    COALESCE(SUM(i."totalApplied"), 0)
  INTO item_subtotal, item_tax, item_total
  FROM "InvoiceSaleItemApplication" i
  WHERE i."invoiceSaleDocumentId" = document_application_id
    AND i."reversedAt" IS NULL;

  IF item_subtotal <> document_subtotal OR item_tax <> document_tax OR item_total <> document_total THEN
    RAISE EXCEPTION 'Invoice item applications must equal the document application';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "InvoiceSaleItemApplication" i
    JOIN "SaleItem" si ON si."id" = i."saleItemId"
    WHERE i."invoiceSaleDocumentId" = document_application_id
      AND i."reversedAt" IS NULL
      AND si."saleId" <> document_sale_id
  ) THEN
    RAISE EXCEPTION 'Invoice item application belongs to another sale';
  END IF;

  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER invoice_item_application_amount_guard_parent
AFTER INSERT OR UPDATE ON "InvoiceSaleDocument"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION invoice_item_application_amount_guard();

CREATE CONSTRAINT TRIGGER invoice_item_application_amount_guard_items
AFTER INSERT OR UPDATE OR DELETE ON "InvoiceSaleItemApplication"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION invoice_item_application_amount_guard();
