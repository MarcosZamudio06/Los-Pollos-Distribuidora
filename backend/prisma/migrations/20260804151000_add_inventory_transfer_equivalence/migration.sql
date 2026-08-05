ALTER TABLE "InventoryTransferItem"
  ADD COLUMN "unitEquivalentId" TEXT,
  ADD COLUMN "appliedEquivalentFactor" DECIMAL(18,6),
  ADD COLUMN "roundingMode" TEXT;

ALTER TABLE "InventoryTransferItem"
  ADD CONSTRAINT "InventoryTransferItem_unitEquivalentId_fkey"
  FOREIGN KEY ("unitEquivalentId")
  REFERENCES "ProductUnitEquivalent"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferItem"
  ADD CONSTRAINT "InventoryTransferItem_equivalence_factor_check"
  CHECK ("appliedEquivalentFactor" IS NULL OR "appliedEquivalentFactor" > 0);

CREATE INDEX "InventoryTransferItem_unitEquivalentId_idx"
  ON "InventoryTransferItem"("unitEquivalentId");
