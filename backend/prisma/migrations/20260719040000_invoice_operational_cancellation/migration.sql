ALTER TABLE "Invoice"
ADD COLUMN "cancellationIdempotencyKey" TEXT,
ADD COLUMN "cancellationPayloadHash" TEXT;

CREATE UNIQUE INDEX "Invoice_cancellationIdempotencyKey_key"
ON "Invoice"("cancellationIdempotencyKey");
