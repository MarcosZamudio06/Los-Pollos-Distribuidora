CREATE TYPE "BranchSupplyCycleSnapshotType" AS ENUM ('CLOSED', 'REOPENED');

ALTER TABLE "BranchSupplyCycle"
  ADD COLUMN "expectedCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "actualCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "actualNetProfitTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expectedCashTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashCountedTotal" DECIMAL(14,2),
  ADD COLUMN "cashDifferenceTotal" DECIMAL(14,2),
  ADD COLUMN "cardVoucherTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "transferTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expenseTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashInTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashOutTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashAdjustmentTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "reconciledDailyCloseVersion" INTEGER,
  ADD COLUMN "reconciledAt" TIMESTAMP(3);

ALTER TABLE "BranchSupplyCycleItem"
  ADD COLUMN "expectedCostAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "actualCostAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "BranchSupplyCycleItem"
  DROP CONSTRAINT IF EXISTS "BranchSupplyCycleItem_non_negative_check";

ALTER TABLE "BranchSupplyCycleItem"
  ADD CONSTRAINT "BranchSupplyCycleItem_non_negative_check" CHECK (
    "unitPriceSnapshot" >= 0 AND
    "unitCostSnapshot" >= 0 AND
    "deliveredKg" >= 0 AND
    "deliveredPieces" >= 0 AND
    "returnedKg" >= 0 AND
    "returnedPieces" >= 0 AND
    "actualSoldKg" >= 0 AND
    "actualSoldPieces" >= 0 AND
    "shrinkageKg" >= 0 AND
    "shrinkagePieces" >= 0 AND
    "actualSalesAmount" >= 0 AND
    "actualCostAmount" >= 0
  );

CREATE TABLE "BranchSupplyCycleProductSnapshot" (
  "id" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceTransferId" TEXT NOT NULL,
  "sourceCycleVersion" INTEGER NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productSkuSnapshot" TEXT,
  "productUnitSnapshot" "ProductUnit" NOT NULL,
  "unitPriceSnapshot" DECIMAL(14,2) NOT NULL,
  "unitCostSnapshot" DECIMAL(14,2) NOT NULL,
  "unitEquivalentId" TEXT,
  "equivalenceFromUnitSnapshot" "ProductUnit",
  "equivalenceToUnitSnapshot" "ProductUnit",
  "appliedEquivalentFactorSnapshot" DECIMAL(18,6),
  "roundingModeSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyCycleProductSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycleProductSnapshot_sourceCycleVersion_check"
    CHECK ("sourceCycleVersion" >= 1),
  CONSTRAINT "BranchSupplyCycleProductSnapshot_factor_check"
    CHECK ("appliedEquivalentFactorSnapshot" IS NULL OR "appliedEquivalentFactorSnapshot" > 0),
  CONSTRAINT "BranchSupplyCycleProductSnapshot_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleProductSnapshot_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleProductSnapshot_unitEquivalentId_fkey"
    FOREIGN KEY ("unitEquivalentId") REFERENCES "ProductUnitEquivalent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BranchSupplyCycleProductSnapshot_branchSupplyCycleId_productId_key"
  ON "BranchSupplyCycleProductSnapshot" ("branchSupplyCycleId", "productId");
CREATE INDEX "BranchSupplyCycleProductSnapshot_productId_createdAt_idx"
  ON "BranchSupplyCycleProductSnapshot" ("productId", "createdAt");
CREATE INDEX "BranchSupplyCycleProductSnapshot_branchSupplyCycleId_sourceCycleVersion_idx"
  ON "BranchSupplyCycleProductSnapshot" ("branchSupplyCycleId", "sourceCycleVersion");

CREATE TABLE "BranchSupplyCycleSnapshot" (
  "id" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "snapshotType" "BranchSupplyCycleSnapshotType" NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyCycleSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycleSnapshot_sourceVersion_check"
    CHECK ("sourceVersion" >= 1),
  CONSTRAINT "BranchSupplyCycleSnapshot_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleSnapshot_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BranchSupplyCycleSnapshot_branchSupplyCycleId_sourceVersion_snapshotType_key"
  ON "BranchSupplyCycleSnapshot" ("branchSupplyCycleId", "sourceVersion", "snapshotType");
CREATE INDEX "BranchSupplyCycleSnapshot_branchSupplyCycleId_createdAt_idx"
  ON "BranchSupplyCycleSnapshot" ("branchSupplyCycleId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_branch_supply_cycle_product_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyCycleProductSnapshot is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyCycleProductSnapshot_append_only_update"
BEFORE UPDATE ON "BranchSupplyCycleProductSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_product_snapshot_mutation();

CREATE TRIGGER "BranchSupplyCycleProductSnapshot_append_only_delete"
BEFORE DELETE ON "BranchSupplyCycleProductSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_product_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_branch_supply_cycle_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyCycleSnapshot is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyCycleSnapshot_append_only_update"
BEFORE UPDATE ON "BranchSupplyCycleSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_snapshot_mutation();

CREATE TRIGGER "BranchSupplyCycleSnapshot_append_only_delete"
BEFORE DELETE ON "BranchSupplyCycleSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_snapshot_mutation();
