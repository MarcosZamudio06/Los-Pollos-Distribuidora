ALTER TYPE "BranchSupplyCycleEventType"
  ADD VALUE 'TRANSFER_STATE_CHANGED';

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO duplicate_count
  FROM (
    SELECT "branchLocationId", "businessDate"
    FROM "BranchSupplyCycle"
    WHERE "status" <> 'CANCELLED'::"BranchSupplyCycleStatus"
    GROUP BY "branchLocationId", "businessDate"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'BranchSupplyCycle preflight found % duplicate active branch/date groups',
      duplicate_count;
  END IF;
END $$;

DROP INDEX IF EXISTS "BranchSupplyCycle_active_location_date_uq";

CREATE UNIQUE INDEX "BranchSupplyCycle_active_branch_date_uq"
  ON "BranchSupplyCycle" ("branchLocationId", "businessDate")
  WHERE "status" <> 'CANCELLED'::"BranchSupplyCycleStatus";
