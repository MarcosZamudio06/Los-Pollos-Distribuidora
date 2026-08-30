-- CFDI-P1-02-SUBSTITUTION-RELATION-04: persist the server-owned type 04 link
-- independently from legacy substitution compatibility fields.
ALTER TABLE "Invoice"
  ADD COLUMN "fiscalRelationships" JSONB,
  ADD COLUMN "substitutionOfInvoiceId" TEXT;

CREATE UNIQUE INDEX "Invoice_substitutionOfInvoiceId_key"
  ON "Invoice"("substitutionOfInvoiceId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_substitutionOfInvoiceId_fkey"
  FOREIGN KEY ("substitutionOfInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The relationship snapshot is immutable after the native invoice is created.
-- The reservation FK is intentionally separate: a terminal stamp failure may
-- release "substitutionOfInvoiceId" while retaining the failed attempt's
-- fiscal evidence for audit and preventing it from being used as a stamped
-- replacement.
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
    OR NEW."fiscalRelationships" IS DISTINCT FROM OLD."fiscalRelationships"
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
