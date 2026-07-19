ALTER TABLE "Invoice"
  ADD COLUMN "linkIdempotencyKey" TEXT,
  ADD COLUMN "linkPayloadHash" TEXT;

CREATE UNIQUE INDEX "Invoice_linkIdempotencyKey_key"
  ON "Invoice"("linkIdempotencyKey");
