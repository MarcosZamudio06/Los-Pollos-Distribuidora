-- Synchronize the new administrative permission for existing installations.
INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES (
  'permission_cfdi_provider_manage',
  'cfdi.provider.manage',
  'Manage CFDI issuer and provider configuration.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" = 'cfdi.provider.manage'
WHERE role."name" IN ('ADMIN', 'BILLING')
ON CONFLICT DO NOTHING;
