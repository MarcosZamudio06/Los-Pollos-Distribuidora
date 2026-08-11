ALTER TABLE "InventoryMovement"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT;

CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key"
  ON "InventoryMovement" ("idempotencyKey");

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_idempotency_fields_check"
  CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyPayloadHash" IS NULL)
    OR
    ("idempotencyKey" IS NOT NULL AND "idempotencyPayloadHash" IS NOT NULL)
  );
