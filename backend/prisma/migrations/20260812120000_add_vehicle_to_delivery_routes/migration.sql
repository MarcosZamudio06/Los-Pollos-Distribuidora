CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "plateNumber" TEXT,
  "homeLocationId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");
CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");
CREATE INDEX "Vehicle_homeLocationId_isActive_idx"
  ON "Vehicle"("homeLocationId", "isActive");
CREATE INDEX "Vehicle_isActive_displayName_idx"
  ON "Vehicle"("isActive", "displayName");

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_homeLocationId_fkey"
  FOREIGN KEY ("homeLocationId") REFERENCES "OperationalLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryRoute"
  ADD COLUMN "vehicleId" TEXT;

ALTER TABLE "DeliveryRoutePlanDraft"
  ADD COLUMN "vehicleId" TEXT;

-- Existing drafts cannot be assigned an invented vehicle. Refuse the migration
-- instead of silently backfilling an operational relationship.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DeliveryRoutePlanDraft"
    WHERE "vehicleId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add required DeliveryRoutePlanDraft.vehicleId while existing drafts remain; expire or migrate them explicitly first';
  END IF;
END $$;

ALTER TABLE "DeliveryRoutePlanDraft"
  ALTER COLUMN "vehicleId" SET NOT NULL;

CREATE INDEX "DeliveryRoute_vehicleId_status_scheduledDate_idx"
  ON "DeliveryRoute"("vehicleId", "status", "scheduledDate");
CREATE UNIQUE INDEX "DeliveryRoute_vehicleId_in_progress_key"
  ON "DeliveryRoute"("vehicleId")
  WHERE "vehicleId" IS NOT NULL AND "status" = 'IN_PROGRESS';
CREATE INDEX "DeliveryRoutePlanDraft_vehicleId_scheduledDate_idx"
  ON "DeliveryRoutePlanDraft"("vehicleId", "scheduledDate");

ALTER TABLE "DeliveryRoute"
  ADD CONSTRAINT "DeliveryRoute_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryRoutePlanDraft"
  ADD CONSTRAINT "DeliveryRoutePlanDraft_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES
  ('permission_fleet_view', 'fleet.view', 'View fleet units and their operational assignments.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_fleet_manage', 'fleet.manage', 'Create and manage fleet units.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_fleet_position_publish', 'fleet.position.publish', 'Publish the authenticated driver position.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_fleet_zones_manage', 'fleet.zones.manage', 'Manage fleet geofence zones.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
INNER JOIN "Permission" AS permission ON permission."key" IN (
  'fleet.view',
  'fleet.manage',
  'fleet.position.publish',
  'fleet.zones.manage'
)
WHERE role."name" = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
INNER JOIN "Permission" AS permission ON permission."key" = 'fleet.position.publish'
WHERE role."name" = 'DRIVER'
ON CONFLICT DO NOTHING;
