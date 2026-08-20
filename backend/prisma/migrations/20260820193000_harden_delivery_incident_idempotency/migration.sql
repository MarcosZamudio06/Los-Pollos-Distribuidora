ALTER TABLE "DeliveryIncident"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT;

CREATE UNIQUE INDEX "DeliveryIncident_idempotencyKey_key"
  ON "DeliveryIncident"("idempotencyKey");
