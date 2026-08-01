CREATE TYPE "CashShiftCloseMode" AS ENUM ('CASHIER', 'ADMINISTRATIVE');

ALTER TYPE "DailyCloseEventType" ADD VALUE 'CASH_SHIFT_CLOSED';

ALTER TABLE "CashShift"
  ADD COLUMN "closeMode" "CashShiftCloseMode",
  ADD COLUMN "closeReason" TEXT;

UPDATE "CashShift"
SET "closeMode" = 'CASHIER'::"CashShiftCloseMode"
WHERE "status" = 'CLOSED' AND "closeMode" IS NULL;

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES (
  'permission_cash_shifts_administrative_close',
  'cash_shifts.administrative_close',
  'Close an abandoned or inaccessible cash shift administratively.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
  ON permission."key" = 'cash_shifts.administrative_close'
WHERE role."name" = 'ADMIN'
ON CONFLICT DO NOTHING;
