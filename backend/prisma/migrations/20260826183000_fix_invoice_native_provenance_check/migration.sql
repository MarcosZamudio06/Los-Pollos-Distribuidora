ALTER TABLE "Invoice"
  DROP CONSTRAINT "Invoice_native_fiscal_snapshot_check";

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_native_fiscal_snapshot_check"
  CHECK (
    "origin" = 'LEGACY_EXTERNAL'
    OR (
      (
        (
          "cfdiType" = 'INCOME'
          AND "sourceBillingRequestId" IS NOT NULL
          AND "sourceCreditAdjustmentId" IS NULL
        )
        OR (
          "cfdiType" = 'EXPENSE'
          AND "sourceBillingRequestId" IS NULL
          AND "sourceCreditAdjustmentId" IS NOT NULL
        )
        OR (
          "cfdiType" = 'PAYMENT_RECEIPT'
          AND "sourceBillingRequestId" IS NULL
          AND "sourceCreditAdjustmentId" IS NULL
        )
      )
      AND "fiscalIdempotencyKey" IS NOT NULL
      AND "fiscalRequestHash" ~ '^[0-9a-f]{64}$'
      AND "cfdiVersion" = '4.0'
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

ALTER TABLE "Invoice"
  VALIDATE CONSTRAINT "Invoice_native_fiscal_snapshot_check";
