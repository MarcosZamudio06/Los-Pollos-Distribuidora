INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES
  ('permission_cedis_view', 'cedis.view', 'View authorized CEDIS hierarchy and operations.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_manage', 'cedis.manage', 'Manage CEDIS hierarchy and operational configuration.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_dispatch', 'cedis.dispatch', 'Dispatch inventory from an authorized CEDIS.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_receive_returns', 'cedis.receive_returns', 'Receive authorized branch returns at a CEDIS.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_reconcile', 'cedis.reconcile', 'Reconcile CEDIS operational cycles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_close', 'cedis.close', 'Close CEDIS operational cycles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_cedis_view_costs', 'cedis.view_costs', 'View CEDIS cost and utility information.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
INNER JOIN "Permission" AS permission ON (
  (role."name" = 'ADMIN' AND permission."key" IN (
    'cedis.view',
    'cedis.manage',
    'cedis.dispatch',
    'cedis.receive_returns',
    'cedis.reconcile',
    'cedis.close',
    'cedis.view_costs'
  )) OR
  (role."name" = 'WAREHOUSE' AND permission."key" IN (
    'cedis.view',
    'cedis.dispatch',
    'cedis.receive_returns'
  )) OR
  (role."name" = 'SELLER' AND permission."key" = 'cedis.view')
)
ON CONFLICT DO NOTHING;
