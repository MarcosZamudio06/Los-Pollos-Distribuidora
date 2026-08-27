-- Expand: add an explicit commercial credit authorization root. No legacy
-- Invoice, sale, payment, delivery, or inventory record is inferred/backfilled.
CREATE TYPE "CreditAdjustmentStatus" AS ENUM (
  'DRAFT',
  'APPROVED',
  'ISSUING',
  'UNKNOWN',
  'ISSUED',
  'ISSUE_ERROR',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "CreditAdjustmentSourceType" AS ENUM (
  'APPROVED_RETURN',
  'BONUS',
  'POST_SALE_DISCOUNT',
  'COMMERCIAL_ADJUSTMENT'
);

CREATE TABLE "CreditAdjustment" (
  "id" TEXT NOT NULL,
  "status" "CreditAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceType" "CreditAdjustmentSourceType" NOT NULL,
  "sourceReference" TEXT,
  "internalReason" TEXT NOT NULL,
  "paymentFormCode" VARCHAR(2) NOT NULL,
  "relationshipTypeCode" VARCHAR(2) NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "snapshotHash" VARCHAR(64),
  "creationIdempotencyKey" TEXT NOT NULL,
  "creationRequestHash" VARCHAR(64) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "authorizedByUserId" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditAdjustment_currency_check"
    CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CreditAdjustment_exchange_rate_check"
    CHECK ("exchangeRate" > 0),
  CONSTRAINT "CreditAdjustment_relationship_check"
    CHECK (
      ("sourceType" = 'APPROVED_RETURN' AND "relationshipTypeCode" = '03') OR
      ("sourceType" <> 'APPROVED_RETURN' AND "relationshipTypeCode" = '01')
    ),
  CONSTRAINT "CreditAdjustment_authorization_check"
    CHECK (
      ("status" = 'DRAFT' AND "authorizedByUserId" IS NULL AND "authorizedAt" IS NULL) OR
      ("status" = 'REJECTED') OR
      ("status" NOT IN ('DRAFT', 'REJECTED') AND "authorizedByUserId" IS NOT NULL AND "authorizedAt" IS NOT NULL)
    ),
  CONSTRAINT "CreditAdjustment_amounts_check"
    CHECK (
      "subtotal" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0 AND
      "total" = ROUND("subtotal" - "discount" + "tax", 2)
    ),
  CONSTRAINT "CreditAdjustment_hash_check"
    CHECK (
      "creationRequestHash" ~ '^[0-9a-f]{64}$' AND
      ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')
    )
);

CREATE TABLE "CreditAdjustmentInvoice" (
  "id" TEXT NOT NULL,
  "creditAdjustmentId" TEXT NOT NULL,
  "originalInvoiceId" TEXT NOT NULL,
  "relatedUuid" VARCHAR(36) NOT NULL,
  "relationshipTypeCode" VARCHAR(2) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "snapshotHash" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditAdjustmentInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditAdjustmentInvoice_uuid_check"
    CHECK ("relatedUuid" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "CreditAdjustmentInvoice_relation_check"
    CHECK ("relationshipTypeCode" IN ('01', '03')),
  CONSTRAINT "CreditAdjustmentInvoice_amounts_check"
    CHECK (
      "subtotal" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0 AND
      "total" = ROUND("subtotal" - "discount" + "tax", 2)
    ),
  CONSTRAINT "CreditAdjustmentInvoice_hash_check"
    CHECK ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "CreditAdjustmentLine" (
  "id" TEXT NOT NULL,
  "creditAdjustmentInvoiceId" TEXT NOT NULL,
  "originalInvoiceConceptId" TEXT NOT NULL,
  "requestedCreditTotal" DECIMAL(14,2) NOT NULL,
  "creditSubtotal" DECIMAL(14,2) NOT NULL,
  "creditDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "creditTaxableBase" DECIMAL(14,2) NOT NULL,
  "creditTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "creditTotal" DECIMAL(14,2) NOT NULL,
  "originalConceptSnapshot" JSONB NOT NULL,
  "taxesSnapshot" JSONB,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditAdjustmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditAdjustmentLine_positive_check"
    CHECK ("requestedCreditTotal" > 0 AND "creditTotal" > 0),
  CONSTRAINT "CreditAdjustmentLine_amounts_check"
    CHECK (
      "creditSubtotal" >= 0 AND "creditDiscount" >= 0 AND
      "creditTaxableBase" >= 0 AND "creditTax" >= 0 AND
      "creditTotal" = ROUND("creditSubtotal" - "creditDiscount" + "creditTax", 2)
    ),
  CONSTRAINT "CreditAdjustmentLine_hash_check"
    CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "Invoice" ADD COLUMN "sourceCreditAdjustmentId" TEXT;

CREATE UNIQUE INDEX "CreditAdjustment_creationIdempotencyKey_key"
  ON "CreditAdjustment"("creationIdempotencyKey");
CREATE INDEX "CreditAdjustment_status_createdAt_idx"
  ON "CreditAdjustment"("status", "createdAt");
CREATE INDEX "CreditAdjustment_legalEntityId_currencyCode_createdAt_idx"
  ON "CreditAdjustment"("legalEntityId", "currencyCode", "createdAt");
CREATE INDEX "CreditAdjustment_customerId_createdAt_idx"
  ON "CreditAdjustment"("customerId", "createdAt");
CREATE INDEX "CreditAdjustment_authorizedByUserId_authorizedAt_idx"
  ON "CreditAdjustment"("authorizedByUserId", "authorizedAt");

CREATE UNIQUE INDEX "CreditAdjustmentInvoice_creditAdjustmentId_originalInvoiceId_key"
  ON "CreditAdjustmentInvoice"("creditAdjustmentId", "originalInvoiceId");
CREATE INDEX "CreditAdjustmentInvoice_originalInvoiceId_createdAt_idx"
  ON "CreditAdjustmentInvoice"("originalInvoiceId", "createdAt");

CREATE UNIQUE INDEX "CreditAdjustmentLine_creditAdjustmentInvoiceId_originalInvoiceConceptId_key"
  ON "CreditAdjustmentLine"("creditAdjustmentInvoiceId", "originalInvoiceConceptId");
CREATE INDEX "CreditAdjustmentLine_originalInvoiceConceptId_createdAt_idx"
  ON "CreditAdjustmentLine"("originalInvoiceConceptId", "createdAt");

CREATE UNIQUE INDEX "Invoice_sourceCreditAdjustmentId_key"
  ON "Invoice"("sourceCreditAdjustmentId");

ALTER TABLE "CreditAdjustment"
  ADD CONSTRAINT "CreditAdjustment_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustment"
  ADD CONSTRAINT "CreditAdjustment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustment"
  ADD CONSTRAINT "CreditAdjustment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustment"
  ADD CONSTRAINT "CreditAdjustment_authorizedByUserId_fkey"
  FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustmentInvoice"
  ADD CONSTRAINT "CreditAdjustmentInvoice_creditAdjustmentId_fkey"
  FOREIGN KEY ("creditAdjustmentId") REFERENCES "CreditAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustmentInvoice"
  ADD CONSTRAINT "CreditAdjustmentInvoice_originalInvoiceId_fkey"
  FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustmentLine"
  ADD CONSTRAINT "CreditAdjustmentLine_creditAdjustmentInvoiceId_fkey"
  FOREIGN KEY ("creditAdjustmentInvoiceId") REFERENCES "CreditAdjustmentInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditAdjustmentLine"
  ADD CONSTRAINT "CreditAdjustmentLine_originalInvoiceConceptId_fkey"
  FOREIGN KEY ("originalInvoiceConceptId") REFERENCES "InvoiceConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_sourceCreditAdjustmentId_fkey"
  FOREIGN KEY ("sourceCreditAdjustmentId") REFERENCES "CreditAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate: authorized credit snapshots are append-only. Draft rows remain
-- mutable only until the explicit approval transition completes.
CREATE OR REPLACE FUNCTION "prevent_authorized_credit_snapshot_mutation"()
RETURNS TRIGGER AS $$
DECLARE
  adjustment_status "CreditAdjustmentStatus";
BEGIN
  IF TG_TABLE_NAME = 'CreditAdjustmentInvoice' THEN
    SELECT "status" INTO adjustment_status
    FROM "CreditAdjustment"
    WHERE "id" = COALESCE(OLD."creditAdjustmentId", NEW."creditAdjustmentId");
  ELSE
    SELECT adjustment."status" INTO adjustment_status
    FROM "CreditAdjustment" adjustment
    JOIN "CreditAdjustmentInvoice" application
      ON application."creditAdjustmentId" = adjustment."id"
    WHERE application."id" = COALESCE(OLD."creditAdjustmentInvoiceId", NEW."creditAdjustmentInvoiceId");
  END IF;

  IF adjustment_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'AUTHORIZED_CREDIT_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CreditAdjustmentInvoice_immutable_after_approval"
BEFORE UPDATE OR DELETE ON "CreditAdjustmentInvoice"
FOR EACH ROW EXECUTE FUNCTION "prevent_authorized_credit_snapshot_mutation"();

CREATE TRIGGER "CreditAdjustmentLine_immutable_after_approval"
BEFORE UPDATE OR DELETE ON "CreditAdjustmentLine"
FOR EACH ROW EXECUTE FUNCTION "prevent_authorized_credit_snapshot_mutation"();

-- Backfill: intentionally empty. Legacy invoices cannot be classified as
-- credits or linked to returns without approved fiscal evidence.
