ALTER TABLE "BillingRequest"
  ADD COLUMN "creationIdempotencyKey" TEXT,
  ADD COLUMN "creationPayloadHash" TEXT,
  ADD COLUMN "retryOfBillingRequestId" TEXT;

ALTER TABLE "BillingRequestHistory"
  ADD COLUMN "compositionSnapshot" JSONB;

CREATE UNIQUE INDEX "BillingRequest_creationIdempotencyKey_key"
  ON "BillingRequest"("creationIdempotencyKey");
CREATE INDEX "BillingRequest_retryOfBillingRequestId_idx"
  ON "BillingRequest"("retryOfBillingRequestId");

ALTER TABLE "BillingRequest"
  ADD CONSTRAINT "BillingRequest_retryOfBillingRequestId_fkey"
  FOREIGN KEY ("retryOfBillingRequestId") REFERENCES "BillingRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
