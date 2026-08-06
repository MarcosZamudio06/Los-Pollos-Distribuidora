-- Approved base map: CEDIS-VER is the direct parent of VER, BDR, and ALV.
-- Failed PostgreSQL migrations roll back atomically, so this remains safe to retry.
INSERT INTO "OperationalLocation" (
  "id",
  "name",
  "code",
  "type",
  "parentId",
  "address",
  "latitude",
  "longitude",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  'migration-cedis-veracruz',
  'CEDIS Veracruz',
  'CEDIS-VER',
  'DISTRIBUTION_CENTER'::"OperationalLocationType",
  NULL,
  'Centro de distribución Veracruz',
  19.183,
  -96.134,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

UPDATE "OperationalLocation" AS branch
SET
  "parentId" = cedis."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "OperationalLocation" AS cedis
WHERE cedis."code" = 'CEDIS-VER'
  AND cedis."type" = 'DISTRIBUTION_CENTER'::"OperationalLocationType"
  AND cedis."isActive"
  AND branch."type" = 'BRANCH'::"OperationalLocationType"
  AND branch."code" IN ('VER', 'BDR', 'ALV')
  AND branch."parentId" IS NULL;

CREATE INDEX IF NOT EXISTS "OperationalLocation_parentId_type_isActive_idx"
  ON "OperationalLocation" ("parentId", "type", "isActive");

DO $$
DECLARE
  invalid_location_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO invalid_location_count
  FROM "OperationalLocation" AS location
  WHERE (
    location."type" = 'DISTRIBUTION_CENTER'::"OperationalLocationType"
    AND location."parentId" IS NOT NULL
  ) OR (
    location."type" = 'BRANCH'::"OperationalLocationType"
    AND NOT EXISTS (
      SELECT 1
      FROM "OperationalLocation" AS parent
      WHERE parent."id" = location."parentId"
        AND parent."type" = 'DISTRIBUTION_CENTER'::"OperationalLocationType"
        AND parent."isActive"
    )
  );

  IF invalid_location_count > 0 THEN
    RAISE EXCEPTION
      'OperationalLocation hierarchy preflight found % invalid CEDIS/BRANCH rows after canonical CEDIS backfill',
      invalid_location_count;
  END IF;
END $$;

DO $$
DECLARE
  cycle_count INTEGER;
BEGIN
  WITH RECURSIVE location_paths(location_id, parent_id, path, has_cycle) AS (
    SELECT
      location."id",
      location."parentId",
      ARRAY[location."id"]::TEXT[],
      FALSE
    FROM "OperationalLocation" AS location
    WHERE location."parentId" IS NOT NULL

    UNION ALL

    SELECT
      parent."id",
      parent."parentId",
      paths.path || parent."id",
      parent."id" = ANY(paths.path)
    FROM location_paths AS paths
    INNER JOIN "OperationalLocation" AS parent
      ON parent."id" = paths.parent_id
    WHERE NOT paths.has_cycle
  )
  SELECT COUNT(*)
    INTO cycle_count
  FROM location_paths
  WHERE has_cycle;

  IF cycle_count > 0 THEN
    RAISE EXCEPTION
      'OperationalLocation hierarchy preflight found % parent cycles',
      cycle_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_operational_location_hierarchy()
RETURNS trigger AS $$
DECLARE
  parent_type "OperationalLocationType";
  parent_active BOOLEAN;
  creates_cycle BOOLEAN;
BEGIN
  IF NEW."type" = 'DISTRIBUTION_CENTER'::"OperationalLocationType"
    AND NEW."parentId" IS NOT NULL THEN
    RAISE EXCEPTION 'DISTRIBUTION_CENTER locations cannot have a parent';
  END IF;

  IF NEW."type" = 'BRANCH'::"OperationalLocationType" THEN
    IF NEW."parentId" IS NULL THEN
      RAISE EXCEPTION 'BRANCH locations must have a DISTRIBUTION_CENTER parent';
    END IF;

    SELECT "type", "isActive"
      INTO parent_type, parent_active
    FROM "OperationalLocation"
    WHERE "id" = NEW."parentId";

    IF NOT FOUND
      OR parent_type <> 'DISTRIBUTION_CENTER'::"OperationalLocationType"
      OR NOT parent_active THEN
      RAISE EXCEPTION 'BRANCH locations must have a DISTRIBUTION_CENTER parent';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      (OLD."isActive" AND NOT NEW."isActive")
      OR (
        OLD."type" = 'DISTRIBUTION_CENTER'::"OperationalLocationType"
        AND NEW."type" <> 'DISTRIBUTION_CENTER'::"OperationalLocationType"
      )
    )
    AND EXISTS (
      SELECT 1
      FROM "OperationalLocation" AS child
      WHERE child."parentId" = NEW."id"
    ) THEN
    RAISE EXCEPTION
      'Cannot deactivate or change the type of a location with child locations';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."type" = 'BRANCH'::"OperationalLocationType"
    AND (
      NEW."type" <> OLD."type"
      OR NEW."parentId" IS DISTINCT FROM OLD."parentId"
    )
    AND EXISTS (
      SELECT 1
      FROM "BranchSupplyCycle" AS cycle
      WHERE cycle."branchLocationId" = NEW."id"
        AND cycle."status" NOT IN ('CLOSED', 'CANCELLED')
    ) THEN
    RAISE EXCEPTION
      'Cannot change a branch hierarchy with an open CEDIS supply cycle';
  END IF;

  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT "id", "parentId", ARRAY["id"] AS path
    FROM "OperationalLocation"
    WHERE "id" = NEW."parentId"
    UNION ALL
    SELECT location."id", location."parentId", ancestors.path || location."id"
    FROM "OperationalLocation" AS location
    INNER JOIN ancestors ON location."id" = ancestors."parentId"
    WHERE NOT location."id" = ANY(ancestors.path)
  )
  SELECT EXISTS (
    SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'OperationalLocation parent relationship cannot create a cycle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_operational_location_hierarchy"
BEFORE INSERT OR UPDATE OF "type", "parentId", "isActive"
ON "OperationalLocation"
FOR EACH ROW EXECUTE FUNCTION validate_operational_location_hierarchy();
