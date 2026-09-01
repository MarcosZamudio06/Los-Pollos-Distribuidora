-- CFDI-P1-04-GLOBAL-INVOICE: persist the explicit, validated CFDI 4.0
-- InformacionGlobal snapshot. Presence is the domain discriminator; the
-- generic domestic RFC is never accepted as an ordinary native receiver.
ALTER TABLE "Invoice"
  ADD COLUMN "globalInformationSnapshot" JSONB;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_global_information_contract_check"
  CHECK (
    "origin" = 'LEGACY_EXTERNAL'
    OR (
      COALESCE("receiverSnapshot"->>'taxId', '') <> 'XAXX010101000'
      AND "globalInformationSnapshot" IS NULL
    )
    OR (
      "cfdiType" = 'INCOME'
      AND jsonb_typeof("globalInformationSnapshot") = 'object'
      AND "globalInformationSnapshot" ? 'periodicity'
      AND "globalInformationSnapshot" ? 'months'
      AND "globalInformationSnapshot" ? 'year'
      AND ("globalInformationSnapshot"->>'periodicity') ~ '^0[1-5]$'
      AND ("globalInformationSnapshot"->>'months') ~ '^(0[1-9]|1[0-8])$'
      AND (
        (
          "globalInformationSnapshot"->>'periodicity' = '05'
          AND ("globalInformationSnapshot"->>'months') ~ '^1[3-8]$'
        )
        OR (
          "globalInformationSnapshot"->>'periodicity' <> '05'
          AND ("globalInformationSnapshot"->>'months') ~ '^(0[1-9]|1[0-2])$'
        )
      )
      AND ("globalInformationSnapshot"->>'year') ~ '^[0-9]{4}$'
      AND "receiverSnapshot"->>'taxId' = 'XAXX010101000'
      AND UPPER("receiverSnapshot"->>'fiscalName') = 'PUBLICO EN GENERAL'
      AND "receiverSnapshot"->>'fiscalRegime' = '616'
      AND "receiverSnapshot"->>'fiscalUseCode' = 'S01'
      AND "receiverSnapshot"->>'fiscalPostalCode' =
        "issuerSnapshot"->>'fiscalPostalCode'
      AND "fiscalUseCode" = 'S01'
      AND "paymentMethodCode" = 'PUE'
      AND "exportCode" = '01'
    )
  ) NOT VALID;

ALTER TABLE "Invoice"
  VALIDATE CONSTRAINT "Invoice_global_information_contract_check";

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
    OR NEW."globalInformationSnapshot" IS DISTINCT FROM OLD."globalInformationSnapshot"
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
