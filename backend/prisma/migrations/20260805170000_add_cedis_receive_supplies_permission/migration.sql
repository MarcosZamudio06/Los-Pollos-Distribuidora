INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES (
  'permission_cedis_receive_supplies',
  'cedis.receive_supplies',
  'Receive supplies delivered from an authorized CEDIS.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
INNER JOIN "Permission" AS permission
  ON permission."key" = 'cedis.receive_supplies'
WHERE role."name" IN ('ADMIN', 'WAREHOUSE', 'SELLER')
ON CONFLICT DO NOTHING;
