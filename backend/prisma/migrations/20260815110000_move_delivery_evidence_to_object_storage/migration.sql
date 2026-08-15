ALTER TABLE "DeliveryEvidence"
  ALTER COLUMN "value" DROP NOT NULL;

CREATE UNIQUE INDEX "DeliveryEvidence_storageKey_key"
  ON "DeliveryEvidence"("storageKey");

ALTER TABLE "DeliveryEvidence"
  ADD CONSTRAINT "DeliveryEvidence_value_or_storageKey_check"
  CHECK ("value" IS NOT NULL OR "storageKey" IS NOT NULL);
