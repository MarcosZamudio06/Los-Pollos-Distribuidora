-- TASK-043: persist payment idempotency, cancellation audit, and optimistic versioning.
ALTER TABLE "Payment"
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT,
  ADD COLUMN "cancellationIdempotencyKey" TEXT,
  ADD COLUMN "cancellationPayloadHash" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_cancellationIdempotencyKey_key" ON "Payment"("cancellationIdempotencyKey");
CREATE INDEX "Payment_cancelledByUserId_idx" ON "Payment"("cancelledByUserId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
