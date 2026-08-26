-- CFDI-13: fiscal cancellation request metadata is additive and server-owned.
ALTER TABLE "Invoice"
  ADD COLUMN "cancellationMotiveCode" VARCHAR(2),
  ADD COLUMN "internalReason" TEXT,
  ADD COLUMN "replacementInvoiceId" TEXT,
  ADD COLUMN "replacementUuid" VARCHAR(36);

CREATE UNIQUE INDEX "Invoice_replacementInvoiceId_key"
  ON "Invoice"("replacementInvoiceId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_replacementInvoiceId_fkey"
  FOREIGN KEY ("replacementInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_cancellation_motive_check"
  CHECK (
    "cancellationMotiveCode" IS NULL
    OR "cancellationMotiveCode" IN ('01', '02', '03', '04')
  ) NOT VALID;
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_cancellation_motive_check";

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_replacement_pair_check"
  CHECK (
    ("cancellationMotiveCode" = '01'
      AND "replacementInvoiceId" IS NOT NULL
      AND "replacementUuid" IS NOT NULL)
    OR "cancellationMotiveCode" <> '01'
    OR "cancellationMotiveCode" IS NULL
  ) NOT VALID;
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_replacement_pair_check";

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_native_cancelled_confirmation_check"
  CHECK (
    "origin" = 'LEGACY_EXTERNAL'
    OR "status" <> 'CANCELLED'
    OR "cancellationStatus" = 'ACCEPTED'
  ) NOT VALID;
ALTER TABLE "Invoice"
  VALIDATE CONSTRAINT "Invoice_native_cancelled_confirmation_check";

CREATE OR REPLACE FUNCTION invoice_uuid_immutable_after_stamp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."uuid" IS NOT NULL AND NEW."uuid" IS DISTINCT FROM OLD."uuid" THEN
    RAISE EXCEPTION 'Stamped Invoice UUID is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_uuid_immutable_after_stamp
BEFORE UPDATE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION invoice_uuid_immutable_after_stamp();

CREATE INDEX "Invoice_cancellationMotiveCode_updatedAt_idx"
  ON "Invoice"("cancellationMotiveCode", "updatedAt");
