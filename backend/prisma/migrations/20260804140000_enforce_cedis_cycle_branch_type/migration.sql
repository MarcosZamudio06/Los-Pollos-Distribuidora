DO $$
DECLARE
  invalid_cycle_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO invalid_cycle_count
  FROM "BranchSupplyCycle" AS cycle
  LEFT JOIN "OperationalLocation" AS cedis
    ON cedis."id" = cycle."distributionCenterLocationId"
  LEFT JOIN "OperationalLocation" AS branch
    ON branch."id" = cycle."branchLocationId"
  WHERE cedis."id" IS NULL
    OR cedis."type" <> 'DISTRIBUTION_CENTER'::"OperationalLocationType"
    OR NOT cedis."isActive"
    OR branch."id" IS NULL
    OR branch."type" <> 'BRANCH'::"OperationalLocationType"
    OR NOT branch."isActive"
    OR branch."parentId" IS DISTINCT FROM cycle."distributionCenterLocationId";

  IF invalid_cycle_count > 0 THEN
    RAISE EXCEPTION
      'BranchSupplyCycle preflight found % cycles with invalid CEDIS/BRANCH hierarchy',
      invalid_cycle_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_branch_supply_cycle_locations()
RETURNS trigger AS $$
DECLARE
  distribution_center_type "OperationalLocationType";
  branch_type "OperationalLocationType";
  distribution_center_active BOOLEAN;
  branch_active BOOLEAN;
  branch_parent_id TEXT;
BEGIN
  SELECT "type", "isActive"
    INTO distribution_center_type, distribution_center_active
  FROM "OperationalLocation"
  WHERE "id" = NEW."distributionCenterLocationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Distribution center location % does not exist',
      NEW."distributionCenterLocationId";
  END IF;

  SELECT "type", "isActive", "parentId"
    INTO branch_type, branch_active, branch_parent_id
  FROM "OperationalLocation"
  WHERE "id" = NEW."branchLocationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch location % does not exist', NEW."branchLocationId";
  END IF;

  IF distribution_center_type <> 'DISTRIBUTION_CENTER'::"OperationalLocationType"
    OR NOT distribution_center_active THEN
    RAISE EXCEPTION
      'Location % must be an active DISTRIBUTION_CENTER',
      NEW."distributionCenterLocationId";
  END IF;

  IF branch_type <> 'BRANCH'::"OperationalLocationType"
    OR NOT branch_active
    OR branch_parent_id IS DISTINCT FROM NEW."distributionCenterLocationId" THEN
    RAISE EXCEPTION
      'Location % must be an active BRANCH directly assigned to CEDIS %',
      NEW."branchLocationId",
      NEW."distributionCenterLocationId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
