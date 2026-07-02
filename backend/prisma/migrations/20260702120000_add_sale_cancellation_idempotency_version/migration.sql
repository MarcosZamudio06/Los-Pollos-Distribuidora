-- Add durable idempotency and optimistic versioning for sale cancellation.
ALTER TABLE "Sale"
  ADD COLUMN "cancellationIdempotencyKey" TEXT,
  ADD COLUMN "cancellationPayloadHash" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "Sale_cancellationIdempotencyKey_key" ON "Sale"("cancellationIdempotencyKey");
