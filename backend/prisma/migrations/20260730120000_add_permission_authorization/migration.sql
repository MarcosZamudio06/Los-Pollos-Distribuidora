CREATE TABLE "Permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES
  ('permission_access_profiles_manage', 'access_profiles.manage', 'Manage access profiles and their permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cash_terminals_reassign', 'cash_terminals.reassign', 'Reassign cash terminals to an operational location.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_costs_read', 'costs.read', 'Read purchase costs and margin information.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_daily_close_differences_authorize', 'daily_closes.differences.authorize', 'Authorize daily close differences.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_daily_closes_reopen', 'daily_closes.reopen', 'Reopen a closed daily close.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_fiscal_information_export', 'fiscal_information.export', 'Export fiscal information.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_payments_cancel', 'payments.cancel', 'Cancel registered payments.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_roles_read', 'roles.read', 'Read access profiles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_users_manage', 'users.manage', 'Manage internal users.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" = 'fiscal_information.export'
WHERE role."name" = 'BILLING'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" = 'costs.read'
WHERE role."name" = 'WAREHOUSE'
ON CONFLICT DO NOTHING;
