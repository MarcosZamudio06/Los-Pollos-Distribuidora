-- Add durable idempotency and administrative override evidence for sale creation.
ALTER TABLE "Sale"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT,
  ADD COLUMN "administrativeOverrideReason" TEXT,
  ADD COLUMN "administrativeOverrideApprovedByUserId" TEXT;

CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
