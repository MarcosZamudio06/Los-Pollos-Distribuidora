ALTER TYPE "OperationalLocationType" ADD VALUE 'DISTRIBUTION_CENTER';

CREATE TYPE "BranchSupplyCycleStatus" AS ENUM (
  'OPEN',
  'READY_FOR_REVIEW',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE "BranchSupplyTransferRole" AS ENUM ('SUPPLY', 'RETURN');

CREATE TYPE "BranchSupplyCycleEventType" AS ENUM (
  'OPENED',
  'READY_FOR_REVIEW',
  'CLOSED',
  'CANCELLED',
  'REOPENED',
  'TRANSFER_LINKED',
  'ITEM_SNAPSHOT_CREATED'
);

CREATE TABLE "BranchSupplyCycle" (
  "id" TEXT NOT NULL,
  "distributionCenterLocationId" TEXT NOT NULL,
  "branchLocationId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "pointOfSaleDailyCloseId" TEXT,
  "status" "BranchSupplyCycleStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "openedByUserId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "closedAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reopenedByUserId" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopeningReason" TEXT,
  "totalDeliveredKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalDeliveredPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalReturnedKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalReturnedPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalExpectedSoldKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalExpectedSoldPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalActualSoldKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalActualSoldPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalShrinkageKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalShrinkagePieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalDifferenceKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "totalDifferencePieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "expectedSalesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualSalesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expectedProfitTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualProfitTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchSupplyCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycle_version_check" CHECK ("version" >= 1),
  CONSTRAINT "distribution_center_branch_must_differ" CHECK ("distributionCenterLocationId" <> "branchLocationId"),
  CONSTRAINT "BranchSupplyCycle_distributionCenterLocationId_fkey"
    FOREIGN KEY ("distributionCenterLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_branchLocationId_fkey"
    FOREIGN KEY ("branchLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_pointOfSaleDailyCloseId_fkey"
    FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_openedByUserId_fkey"
    FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycle_reopenedByUserId_fkey"
    FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BranchSupplyCycleTransfer" (
  "id" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "inventoryTransferId" TEXT NOT NULL,
  "role" "BranchSupplyTransferRole" NOT NULL,
  "linkedByUserId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyCycleTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycleTransfer_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleTransfer_inventoryTransferId_fkey"
    FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleTransfer_linkedByUserId_fkey"
    FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BranchSupplyCycleItem" (
  "id" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "cycleVersion" INTEGER NOT NULL,
  "snapshotKey" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
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
  "deliveredKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "deliveredPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "returnedKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "returnedPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "expectedSoldKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "expectedSoldPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "actualSoldKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "actualSoldPieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "shrinkageKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "shrinkagePieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "differenceKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "differencePieces" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "expectedSalesAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualSalesAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expectedProfitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualProfitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyCycleItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycleItem_cycleVersion_check" CHECK ("cycleVersion" >= 1),
  CONSTRAINT "BranchSupplyCycleItem_snapshotKey_check" CHECK (btrim("snapshotKey") <> ''),
  CONSTRAINT "BranchSupplyCycleItem_non_negative_check" CHECK (
    "unitPriceSnapshot" >= 0 AND
    "unitCostSnapshot" >= 0 AND
    "deliveredKg" >= 0 AND
    "deliveredPieces" >= 0 AND
    "returnedKg" >= 0 AND
    "returnedPieces" >= 0 AND
    "expectedSoldKg" >= 0 AND
    "expectedSoldPieces" >= 0 AND
    "actualSoldKg" >= 0 AND
    "actualSoldPieces" >= 0 AND
    "shrinkageKg" >= 0 AND
    "shrinkagePieces" >= 0 AND
    "expectedSalesAmount" >= 0 AND
    "actualSalesAmount" >= 0
  ),
  CONSTRAINT "BranchSupplyCycleItem_equivalence_factor_check" CHECK (
    "appliedEquivalentFactorSnapshot" IS NULL OR "appliedEquivalentFactorSnapshot" > 0
  ),
  CONSTRAINT "BranchSupplyCycleItem_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleItem_unitEquivalentId_fkey"
    FOREIGN KEY ("unitEquivalentId") REFERENCES "ProductUnitEquivalent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BranchSupplyCycleEvent" (
  "id" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "type" "BranchSupplyCycleEventType" NOT NULL,
  "cycleVersion" INTEGER NOT NULL,
  "fromStatus" "BranchSupplyCycleStatus",
  "toStatus" "BranchSupplyCycleStatus",
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyCycleEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyCycleEvent_cycleVersion_check" CHECK ("cycleVersion" >= 1),
  CONSTRAINT "BranchSupplyCycleEvent_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyCycleEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BranchSupplyCycle_active_location_date_uq"
  ON "BranchSupplyCycle" ("distributionCenterLocationId", "branchLocationId", "businessDate")
  WHERE "status" <> 'CANCELLED';
CREATE UNIQUE INDEX "BranchSupplyCycle_pointOfSaleDailyCloseId_key"
  ON "BranchSupplyCycle" ("pointOfSaleDailyCloseId")
  WHERE "pointOfSaleDailyCloseId" IS NOT NULL;
CREATE INDEX "BranchSupplyCycle_distributionCenterLocationId_branchLocationId_businessDate_status_idx"
  ON "BranchSupplyCycle" ("distributionCenterLocationId", "branchLocationId", "businessDate", "status");
CREATE INDEX "BranchSupplyCycle_branchLocationId_businessDate_status_idx"
  ON "BranchSupplyCycle" ("branchLocationId", "businessDate", "status");
CREATE INDEX "BranchSupplyCycle_status_businessDate_idx"
  ON "BranchSupplyCycle" ("status", "businessDate");

CREATE UNIQUE INDEX "BranchSupplyCycleTransfer_inventoryTransferId_key"
  ON "BranchSupplyCycleTransfer" ("inventoryTransferId");
CREATE INDEX "BranchSupplyCycleTransfer_branchSupplyCycleId_role_linkedAt_idx"
  ON "BranchSupplyCycleTransfer" ("branchSupplyCycleId", "role", "linkedAt");

CREATE UNIQUE INDEX "BranchSupplyCycleItem_branchSupplyCycleId_cycleVersion_snapshotKey_key"
  ON "BranchSupplyCycleItem" ("branchSupplyCycleId", "cycleVersion", "snapshotKey");
CREATE INDEX "BranchSupplyCycleItem_productId_cycleVersion_idx"
  ON "BranchSupplyCycleItem" ("productId", "cycleVersion");
CREATE INDEX "BranchSupplyCycleItem_branchSupplyCycleId_cycleVersion_idx"
  ON "BranchSupplyCycleItem" ("branchSupplyCycleId", "cycleVersion");

CREATE UNIQUE INDEX "BranchSupplyCycleEvent_idempotencyKey_key"
  ON "BranchSupplyCycleEvent" ("idempotencyKey");
CREATE UNIQUE INDEX "BranchSupplyCycleEvent_branchSupplyCycleId_cycleVersion_key"
  ON "BranchSupplyCycleEvent" ("branchSupplyCycleId", "cycleVersion");
CREATE INDEX "BranchSupplyCycleEvent_branchSupplyCycleId_occurredAt_idx"
  ON "BranchSupplyCycleEvent" ("branchSupplyCycleId", "occurredAt");

CREATE OR REPLACE FUNCTION validate_branch_supply_cycle_locations()
RETURNS trigger AS $$
DECLARE
  distribution_center_type "OperationalLocationType";
  branch_type "OperationalLocationType";
  distribution_center_active BOOLEAN;
  branch_active BOOLEAN;
BEGIN
  SELECT "type", "isActive"
    INTO distribution_center_type, distribution_center_active
  FROM "OperationalLocation"
  WHERE "id" = NEW."distributionCenterLocationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Distribution center location % does not exist', NEW."distributionCenterLocationId";
  END IF;

  SELECT "type", "isActive"
    INTO branch_type, branch_active
  FROM "OperationalLocation"
  WHERE "id" = NEW."branchLocationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch location % does not exist', NEW."branchLocationId";
  END IF;

  IF distribution_center_type <> 'DISTRIBUTION_CENTER'::"OperationalLocationType" OR NOT distribution_center_active THEN
    RAISE EXCEPTION 'Location % must be an active DISTRIBUTION_CENTER', NEW."distributionCenterLocationId";
  END IF;

  IF branch_type NOT IN (
    'BRANCH'::"OperationalLocationType",
    'MIXED'::"OperationalLocationType",
    'EXTERNAL_POINT_OF_SALE'::"OperationalLocationType"
  ) OR NOT branch_active THEN
    RAISE EXCEPTION 'Location % must be an active branch-compatible location', NEW."branchLocationId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_branch_supply_cycle_locations"
BEFORE INSERT OR UPDATE OF "distributionCenterLocationId", "branchLocationId"
ON "BranchSupplyCycle"
FOR EACH ROW EXECUTE FUNCTION validate_branch_supply_cycle_locations();

CREATE OR REPLACE FUNCTION validate_branch_supply_cycle_daily_close_match()
RETURNS trigger AS $$
DECLARE
  close_location_id TEXT;
  close_business_date DATE;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId", "businessDate"
    INTO close_location_id, close_business_date
  FROM "PointOfSaleDailyClose"
  WHERE "id" = NEW."pointOfSaleDailyCloseId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF close_location_id <> NEW."branchLocationId" THEN
    RAISE EXCEPTION 'Daily close location % does not match branch location %', close_location_id, NEW."branchLocationId";
  END IF;

  IF close_business_date <> NEW."businessDate" THEN
    RAISE EXCEPTION 'Daily close date % does not match cycle date %', close_business_date, NEW."businessDate";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_branch_supply_cycle_daily_close_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "branchLocationId", "businessDate"
ON "BranchSupplyCycle"
FOR EACH ROW EXECUTE FUNCTION validate_branch_supply_cycle_daily_close_match();

CREATE OR REPLACE FUNCTION validate_branch_supply_cycle_transfer_direction()
RETURNS trigger AS $$
DECLARE
  cycle_distribution_center_id TEXT;
  cycle_branch_id TEXT;
  transfer_origin_id TEXT;
  transfer_destination_id TEXT;
BEGIN
  SELECT "distributionCenterLocationId", "branchLocationId"
    INTO cycle_distribution_center_id, cycle_branch_id
  FROM "BranchSupplyCycle"
  WHERE "id" = NEW."branchSupplyCycleId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BranchSupplyCycle % does not exist', NEW."branchSupplyCycleId";
  END IF;

  SELECT "originLocationId", "destinationLocationId"
    INTO transfer_origin_id, transfer_destination_id
  FROM "InventoryTransfer"
  WHERE "id" = NEW."inventoryTransferId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'InventoryTransfer % does not exist', NEW."inventoryTransferId";
  END IF;

  IF NEW."role" = 'SUPPLY'::"BranchSupplyTransferRole" AND (
    transfer_origin_id <> cycle_distribution_center_id OR
    transfer_destination_id <> cycle_branch_id
  ) THEN
    RAISE EXCEPTION 'Supply transfer % must flow from the distribution center to the branch', NEW."inventoryTransferId";
  END IF;

  IF NEW."role" = 'RETURN'::"BranchSupplyTransferRole" AND (
    transfer_origin_id <> cycle_branch_id OR
    transfer_destination_id <> cycle_distribution_center_id
  ) THEN
    RAISE EXCEPTION 'Return transfer % must flow from the branch to the distribution center', NEW."inventoryTransferId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_branch_supply_cycle_transfer_direction"
BEFORE INSERT OR UPDATE OF "branchSupplyCycleId", "inventoryTransferId", "role"
ON "BranchSupplyCycleTransfer"
FOR EACH ROW EXECUTE FUNCTION validate_branch_supply_cycle_transfer_direction();

CREATE OR REPLACE FUNCTION prevent_branch_supply_cycle_item_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyCycleItem is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyCycleItem_append_only_update"
BEFORE UPDATE ON "BranchSupplyCycleItem"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_item_mutation();

CREATE TRIGGER "BranchSupplyCycleItem_append_only_delete"
BEFORE DELETE ON "BranchSupplyCycleItem"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_item_mutation();

CREATE OR REPLACE FUNCTION prevent_branch_supply_cycle_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyCycleEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyCycleEvent_append_only_update"
BEFORE UPDATE ON "BranchSupplyCycleEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_event_mutation();

CREATE TRIGGER "BranchSupplyCycleEvent_append_only_delete"
BEFORE DELETE ON "BranchSupplyCycleEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_cycle_event_mutation();
