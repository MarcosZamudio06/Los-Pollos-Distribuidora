-- Expand
CREATE TYPE "InvoiceOrigin" AS ENUM ('LEGACY_EXTERNAL', 'NATIVE_CFDI');
CREATE TYPE "CfdiDocumentType" AS ENUM ('INCOME', 'EXPENSE', 'PAYMENT_RECEIPT');
CREATE TYPE "InvoiceFiscalStatus" AS ENUM ('LEGACY', 'DRAFT', 'READY', 'STAMPING', 'STAMPED', 'FAILED', 'UNKNOWN');
CREATE TYPE "FiscalCancellationStatus" AS ENUM ('NOT_APPLICABLE', 'NOT_REQUESTED', 'PENDING', 'ACCEPTED', 'REJECTED', 'UNKNOWN');
CREATE TYPE "FiscalOperationType" AS ENUM ('STAMP', 'CANCEL', 'STATUS', 'RECOVERY');
CREATE TYPE "FiscalOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYABLE_FAILURE', 'TERMINAL_FAILURE', 'UNKNOWN');
CREATE TYPE "FiscalArtifactType" AS ENUM ('XML', 'PDF', 'CANCELLATION_ACK');
CREATE TYPE "FiscalArtifactStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

ALTER TABLE "Invoice"
  ADD COLUMN "sourceBillingRequestId" TEXT,
  ADD COLUMN "fiscalCertificateId" TEXT,
  ADD COLUMN "fiscalIdempotencyKey" TEXT,
  ADD COLUMN "fiscalRequestHash" VARCHAR(64),
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "origin" "InvoiceOrigin",
  ADD COLUMN "cfdiVersion" VARCHAR(5),
  ADD COLUMN "cfdiType" "CfdiDocumentType",
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "stampedAt" TIMESTAMP(3),
  ADD COLUMN "tfdVersion" VARCHAR(5),
  ADD COLUMN "issuerSnapshot" JSONB,
  ADD COLUMN "receiverSnapshot" JSONB,
  ADD COLUMN "fiscalSnapshotHash" VARCHAR(64),
  ADD COLUMN "fiscalUseCode" VARCHAR(3),
  ADD COLUMN "exportCode" VARCHAR(2),
  ADD COLUMN "paymentFormCode" VARCHAR(2),
  ADD COLUMN "paymentMethodCode" VARCHAR(3),
  ADD COLUMN "certificateNumber" VARCHAR(64),
  ADD COLUMN "satCertificateNumber" VARCHAR(64),
  ADD COLUMN "certificationProviderTaxId" VARCHAR(13),
  ADD COLUMN "cfdiSeal" TEXT,
  ADD COLUMN "satSeal" TEXT,
  ADD COLUMN "fiscalStatus" "InvoiceFiscalStatus",
  ADD COLUMN "cancellationStatus" "FiscalCancellationStatus",
  ADD COLUMN "substitutionUuid" VARCHAR(36),
  ADD COLUMN "fiscalAttemptCount" INTEGER,
  ADD COLUMN "lastFiscalAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastFiscalErrorCode" TEXT,
  ADD COLUMN "lastFiscalErrorMessage" TEXT;

CREATE TABLE "FiscalCertificate" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "serialNumber" VARCHAR(64) NOT NULL,
  "fingerprintSha256" VARCHAR(64) NOT NULL,
  "subject" TEXT,
  "issuer" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "FiscalCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceConcept" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "sourceSaleItemId" TEXT,
  "productServiceCode" VARCHAR(8) NOT NULL,
  "identificationNumber" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "unitCode" VARCHAR(3) NOT NULL,
  "unitName" TEXT,
  "unitValue" DECIMAL(18,6) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxObjectCode" VARCHAR(2) NOT NULL,
  "taxCode" VARCHAR(3),
  "factorType" VARCHAR(10),
  "rateOrQuota" DECIMAL(18,6),
  "taxBase" DECIMAL(14,2),
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "taxesSnapshot" JSONB,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceConcept_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalOperationAttempt" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "operation" "FiscalOperationType" NOT NULL,
  "status" "FiscalOperationStatus" NOT NULL DEFAULT 'PENDING',
  "attemptNumber" INTEGER NOT NULL,
  "correlationId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerReference" TEXT,
  "httpStatus" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "responseDigest" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalOperationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalArtifact" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "operationAttemptId" TEXT,
  "type" "FiscalArtifactType" NOT NULL,
  "status" "FiscalArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "providerHash" TEXT,
  "metadata" JSONB,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "storedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalArtifact_pkey" PRIMARY KEY ("id")
);

-- Backfill
-- Every Invoice that predates this migration is, by construction, an external
-- legacy record. No CFDI version, SAT code, snapshot, certificate or timestamp
-- is inferred from mutable Customer/Product/LegalEntity data.
UPDATE "Invoice" SET "origin" = 'LEGACY_EXTERNAL' WHERE "origin" IS NULL;
UPDATE "Invoice" SET "fiscalStatus" = 'LEGACY' WHERE "fiscalStatus" IS NULL;
UPDATE "Invoice" SET "cancellationStatus" = 'NOT_APPLICABLE' WHERE "cancellationStatus" IS NULL;
UPDATE "Invoice" SET "fiscalAttemptCount" = 0 WHERE "fiscalAttemptCount" IS NULL;

INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'cfdi-remediation-uuid-' || md5(i."id"),
  'LEGACY_INVOICE_UUID_INVALID',
  'Invoice',
  i."id",
  jsonb_build_object('uuid', i."uuid", 'action', 'VERIFY_AGAINST_SOURCE_XML'),
  NOW()
FROM "Invoice" i
WHERE i."uuid" IS NOT NULL
  AND i."uuid" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
ON CONFLICT ("code", "entityType", "entityId") DO NOTHING;

INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'cfdi-remediation-total-' || md5(i."id"),
  'LEGACY_INVOICE_TOTAL_INCONSISTENT',
  'Invoice',
  i."id",
  jsonb_build_object(
    'subtotal', i."subtotal",
    'discount', i."discount",
    'tax', i."tax",
    'total', i."total",
    'action', 'VERIFY_AGAINST_SOURCE_DOCUMENT'
  ),
  NOW()
FROM "Invoice" i
WHERE i."subtotal" - i."discount" + i."tax" <> i."total"
ON CONFLICT ("code", "entityType", "entityId") DO NOTHING;

-- Validate
ALTER TABLE "Invoice"
  ALTER COLUMN "origin" SET DEFAULT 'LEGACY_EXTERNAL',
  ALTER COLUMN "origin" SET NOT NULL,
  ALTER COLUMN "fiscalStatus" SET DEFAULT 'LEGACY',
  ALTER COLUMN "fiscalStatus" SET NOT NULL,
  ALTER COLUMN "cancellationStatus" SET DEFAULT 'NOT_APPLICABLE',
  ALTER COLUMN "cancellationStatus" SET NOT NULL,
  ALTER COLUMN "fiscalAttemptCount" SET DEFAULT 0,
  ALTER COLUMN "fiscalAttemptCount" SET NOT NULL;

CREATE UNIQUE INDEX "Invoice_sourceBillingRequestId_key" ON "Invoice"("sourceBillingRequestId");
CREATE UNIQUE INDEX "Invoice_fiscalIdempotencyKey_key" ON "Invoice"("fiscalIdempotencyKey");
CREATE INDEX "Invoice_fiscalStatus_stampedAt_idx" ON "Invoice"("fiscalStatus", "stampedAt");
CREATE INDEX "Invoice_cancellationStatus_updatedAt_idx" ON "Invoice"("cancellationStatus", "updatedAt");
CREATE INDEX "Invoice_fiscalCertificateId_idx" ON "Invoice"("fiscalCertificateId");

CREATE UNIQUE INDEX "FiscalCertificate_legalEntityId_serialNumber_key" ON "FiscalCertificate"("legalEntityId", "serialNumber");
CREATE INDEX "FiscalCertificate_legalEntityId_validFrom_validTo_idx" ON "FiscalCertificate"("legalEntityId", "validFrom", "validTo");
CREATE UNIQUE INDEX "InvoiceConcept_invoiceId_lineNumber_key" ON "InvoiceConcept"("invoiceId", "lineNumber");
CREATE INDEX "InvoiceConcept_invoiceId_sourceSaleItemId_idx" ON "InvoiceConcept"("invoiceId", "sourceSaleItemId");
CREATE UNIQUE INDEX "FiscalOperationAttempt_correlationId_key" ON "FiscalOperationAttempt"("correlationId");
CREATE UNIQUE INDEX "FiscalOperationAttempt_invoiceId_operation_attemptNumber_key" ON "FiscalOperationAttempt"("invoiceId", "operation", "attemptNumber");
CREATE INDEX "FiscalOperationAttempt_idempotencyKey_idx" ON "FiscalOperationAttempt"("idempotencyKey");
CREATE INDEX "FiscalOperationAttempt_status_nextRetryAt_idx" ON "FiscalOperationAttempt"("status", "nextRetryAt");
CREATE INDEX "FiscalOperationAttempt_invoiceId_operation_createdAt_idx" ON "FiscalOperationAttempt"("invoiceId", "operation", "createdAt");
CREATE UNIQUE INDEX "FiscalArtifact_storageKey_key" ON "FiscalArtifact"("storageKey");
CREATE UNIQUE INDEX "FiscalArtifact_invoiceId_type_version_key" ON "FiscalArtifact"("invoiceId", "type", "version");
CREATE INDEX "FiscalArtifact_status_createdAt_idx" ON "FiscalArtifact"("status", "createdAt");
CREATE INDEX "FiscalArtifact_operationAttemptId_idx" ON "FiscalArtifact"("operationAttemptId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceBillingRequestId_fkey" FOREIGN KEY ("sourceBillingRequestId") REFERENCES "BillingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fiscalCertificateId_fkey" FOREIGN KEY ("fiscalCertificateId") REFERENCES "FiscalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalCertificate" ADD CONSTRAINT "FiscalCertificate_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceConcept" ADD CONSTRAINT "InvoiceConcept_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalOperationAttempt" ADD CONSTRAINT "FiscalOperationAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalArtifact" ADD CONSTRAINT "FiscalArtifact_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalArtifact" ADD CONSTRAINT "FiscalArtifact_operationAttemptId_fkey" FOREIGN KEY ("operationAttemptId") REFERENCES "FiscalOperationAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_exchange_rate_positive_check"
  CHECK ("exchangeRate" IS NULL OR "exchangeRate" > 0) NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fiscal_attempt_count_non_negative_check"
  CHECK ("fiscalAttemptCount" >= 0) NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_native_fiscal_snapshot_check"
  CHECK (
    "origin" = 'LEGACY_EXTERNAL'
    OR (
      "sourceBillingRequestId" IS NOT NULL
      AND "fiscalIdempotencyKey" IS NOT NULL
      AND "fiscalRequestHash" ~ '^[0-9a-f]{64}$'
      AND "cfdiVersion" = '4.0'
      AND "cfdiType" IS NOT NULL
      AND "issuedAt" IS NOT NULL
      AND "issuerSnapshot" IS NOT NULL
      AND "receiverSnapshot" IS NOT NULL
      AND "fiscalSnapshotHash" ~ '^[0-9a-f]{64}$'
      AND "fiscalUseCode" IS NOT NULL
      AND "exportCode" IS NOT NULL
      AND "paymentFormCode" IS NOT NULL
      AND "paymentMethodCode" IS NOT NULL
      AND "fiscalCertificateId" IS NOT NULL
      AND "fiscalStatus" <> 'LEGACY'
      AND "cancellationStatus" <> 'NOT_APPLICABLE'
    )
  ) NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_stamped_metadata_check"
  CHECK (
    "fiscalStatus" <> 'STAMPED'
    OR (
      "uuid" IS NOT NULL
      AND "uuid" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "stampedAt" IS NOT NULL
      AND "tfdVersion" IS NOT NULL
      AND "certificateNumber" IS NOT NULL
      AND "satCertificateNumber" IS NOT NULL
      AND "certificationProviderTaxId" IS NOT NULL
      AND "cfdiSeal" IS NOT NULL
      AND "satSeal" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_substitution_uuid_format_check"
  CHECK (
    "substitutionUuid" IS NULL
    OR "substitutionUuid" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) NOT VALID;
ALTER TABLE "InvoiceConcept" ADD CONSTRAINT "InvoiceConcept_fiscal_values_check"
  CHECK (
    "lineNumber" > 0
    AND "productServiceCode" ~ '^[0-9]{8}$'
    AND "unitCode" ~ '^[A-Z0-9]{2,3}$'
    AND "taxObjectCode" IN ('01', '02', '03', '04', '05', '06', '07', '08')
    AND "quantity" > 0
    AND "unitValue" >= 0
    AND "amount" >= 0
    AND "discount" >= 0
    AND "discount" <= "amount"
    AND "taxAmount" >= 0
    AND "total" = "amount" - "discount" + "taxAmount"
    AND "snapshotHash" ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
ALTER TABLE "FiscalOperationAttempt" ADD CONSTRAINT "FiscalOperationAttempt_integrity_check"
  CHECK (
    "attemptNumber" > 0
    AND length(btrim("correlationId")) > 0
    AND length(btrim("idempotencyKey")) > 0
    AND "requestHash" ~ '^[0-9a-f]{64}$'
    AND ("responseDigest" IS NULL OR "responseDigest" ~ '^[0-9a-f]{64}$')
    AND ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
  ) NOT VALID;
ALTER TABLE "FiscalArtifact" ADD CONSTRAINT "FiscalArtifact_integrity_check"
  CHECK (
    "version" > 0
    AND "byteSize" >= 0
    AND "sha256" ~ '^[0-9a-f]{64}$'
    AND ("status" <> 'AVAILABLE' OR "storedAt" IS NOT NULL)
  ) NOT VALID;
ALTER TABLE "FiscalCertificate" ADD CONSTRAINT "FiscalCertificate_metadata_check"
  CHECK (
    length(btrim("serialNumber")) > 0
    AND "fingerprintSha256" ~ '^[0-9a-f]{64}$'
    AND "validFrom" < "validTo"
    AND ("retiredAt" IS NULL OR "retiredAt" >= "validFrom")
  ) NOT VALID;

ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_exchange_rate_positive_check";
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_fiscal_attempt_count_non_negative_check";
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_native_fiscal_snapshot_check";
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_stamped_metadata_check";
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_substitution_uuid_format_check";
ALTER TABLE "InvoiceConcept" VALIDATE CONSTRAINT "InvoiceConcept_fiscal_values_check";
ALTER TABLE "FiscalOperationAttempt" VALIDATE CONSTRAINT "FiscalOperationAttempt_integrity_check";
ALTER TABLE "FiscalArtifact" VALIDATE CONSTRAINT "FiscalArtifact_integrity_check";
ALTER TABLE "FiscalCertificate" VALIDATE CONSTRAINT "FiscalCertificate_metadata_check";

CREATE OR REPLACE FUNCTION invoice_fiscal_snapshot_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."origin" = 'NATIVE_CFDI' AND (
    NEW."sourceBillingRequestId" IS DISTINCT FROM OLD."sourceBillingRequestId"
    OR NEW."fiscalIdempotencyKey" IS DISTINCT FROM OLD."fiscalIdempotencyKey"
    OR NEW."fiscalRequestHash" IS DISTINCT FROM OLD."fiscalRequestHash"
    OR NEW."legalEntityId" IS DISTINCT FROM OLD."legalEntityId"
    OR NEW."fiscalCertificateId" IS DISTINCT FROM OLD."fiscalCertificateId"
    OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
    OR NEW."exchangeRate" IS DISTINCT FROM OLD."exchangeRate"
    OR NEW."cfdiVersion" IS DISTINCT FROM OLD."cfdiVersion"
    OR NEW."cfdiType" IS DISTINCT FROM OLD."cfdiType"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."issuerSnapshot" IS DISTINCT FROM OLD."issuerSnapshot"
    OR NEW."receiverSnapshot" IS DISTINCT FROM OLD."receiverSnapshot"
    OR NEW."fiscalSnapshotHash" IS DISTINCT FROM OLD."fiscalSnapshotHash"
    OR NEW."fiscalUseCode" IS DISTINCT FROM OLD."fiscalUseCode"
    OR NEW."exportCode" IS DISTINCT FROM OLD."exportCode"
    OR NEW."paymentFormCode" IS DISTINCT FROM OLD."paymentFormCode"
    OR NEW."paymentMethodCode" IS DISTINCT FROM OLD."paymentMethodCode"
    OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
    OR NEW."discount" IS DISTINCT FROM OLD."discount"
    OR NEW."tax" IS DISTINCT FROM OLD."tax"
    OR NEW."total" IS DISTINCT FROM OLD."total"
  ) THEN
    RAISE EXCEPTION 'Native Invoice fiscal snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_fiscal_snapshot_immutable
BEFORE UPDATE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION invoice_fiscal_snapshot_immutable();

CREATE OR REPLACE FUNCTION invoice_concept_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'InvoiceConcept rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_concept_immutable
BEFORE UPDATE OR DELETE ON "InvoiceConcept"
FOR EACH ROW EXECUTE FUNCTION invoice_concept_immutable();

CREATE OR REPLACE FUNCTION fiscal_certificate_metadata_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FiscalCertificate rows cannot be deleted';
  END IF;
  IF NEW."legalEntityId" IS DISTINCT FROM OLD."legalEntityId"
    OR NEW."serialNumber" IS DISTINCT FROM OLD."serialNumber"
    OR NEW."fingerprintSha256" IS DISTINCT FROM OLD."fingerprintSha256"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."issuer" IS DISTINCT FROM OLD."issuer"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
    OR NEW."validTo" IS DISTINCT FROM OLD."validTo"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'FiscalCertificate metadata is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fiscal_certificate_metadata_immutable
BEFORE UPDATE OR DELETE ON "FiscalCertificate"
FOR EACH ROW EXECUTE FUNCTION fiscal_certificate_metadata_immutable();

CREATE OR REPLACE FUNCTION fiscal_stamp_attempt_guard()
RETURNS TRIGGER AS $$
DECLARE
  invoice_origin "InvoiceOrigin";
  invoice_fiscal_status "InvoiceFiscalStatus";
  invoice_idempotency_key TEXT;
  invoice_request_hash VARCHAR(64);
  prior_attempt "FiscalOperationAttempt"%ROWTYPE;
BEGIN
  IF NEW."operation" <> 'STAMP' THEN
    RETURN NEW;
  END IF;

  SELECT i."origin", i."fiscalStatus", i."fiscalIdempotencyKey", i."fiscalRequestHash"
  INTO invoice_origin, invoice_fiscal_status, invoice_idempotency_key, invoice_request_hash
  FROM "Invoice" i
  WHERE i."id" = NEW."invoiceId"
  FOR UPDATE;

  IF invoice_origin <> 'NATIVE_CFDI' THEN
    RAISE EXCEPTION 'STAMP attempts require a native Invoice';
  END IF;

  IF NEW."idempotencyKey" <> invoice_idempotency_key THEN
    RAISE EXCEPTION 'STAMP attempt idempotency must match its Invoice';
  END IF;

  IF NEW."requestHash" <> invoice_request_hash THEN
    RAISE EXCEPTION 'STAMP attempt request hash must match its Invoice';
  END IF;

  SELECT a.*
  INTO prior_attempt
  FROM "FiscalOperationAttempt" a
  WHERE a."invoiceId" = NEW."invoiceId" AND a."operation" = 'STAMP'
  ORDER BY a."attemptNumber" DESC
  LIMIT 1;

  IF prior_attempt."id" IS NULL THEN
    IF NEW."attemptNumber" <> 1 OR invoice_fiscal_status <> 'READY' THEN
      RAISE EXCEPTION 'First STAMP attempt requires READY and attempt 1';
    END IF;
    RETURN NEW;
  END IF;

  IF prior_attempt."status" <> 'RETRYABLE_FAILURE'
    OR invoice_fiscal_status <> 'READY'
    OR NEW."attemptNumber" <> prior_attempt."attemptNumber" + 1
    OR NEW."idempotencyKey" <> prior_attempt."idempotencyKey"
  THEN
    RAISE EXCEPTION 'STAMP retry requires a consecutive retryable attempt with the same idempotency key';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fiscal_stamp_attempt_guard
BEFORE INSERT ON "FiscalOperationAttempt"
FOR EACH ROW EXECUTE FUNCTION fiscal_stamp_attempt_guard();
