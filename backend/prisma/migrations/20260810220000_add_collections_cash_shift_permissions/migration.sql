INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES
  ('permission_collections_receive_cash', 'collections.receive_cash', 'Receive fixed-location cash collection payments.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cash_shift_open_own', 'cash_shift.open_own', 'Open and inspect the authenticated user''s own cash shift.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cash_shift_close_own', 'cash_shift.close_own', 'Close the authenticated user''s own cash shift.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
INNER JOIN "Permission" AS permission ON permission."key" IN (
  'collections.receive_cash',
  'cash_shift.open_own',
  'cash_shift.close_own'
)
WHERE role."name" IN ('ADMIN', 'SELLER', 'COLLECTIONS')
ON CONFLICT DO NOTHING;
