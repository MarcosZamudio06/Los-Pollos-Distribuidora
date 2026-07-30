ALTER TABLE "Role" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "AccessControlAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT NOT NULL,
  "affectedUserCount" INTEGER NOT NULL DEFAULT 0,
  "revokedSessionCount" INTEGER NOT NULL DEFAULT 0,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessControlAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessControlAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccessControlAuditLog_targetType_targetId_createdAt_idx" ON "AccessControlAuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AccessControlAuditLog_actorUserId_createdAt_idx" ON "AccessControlAuditLog"("actorUserId", "createdAt");
CREATE INDEX "AccessControlAuditLog_action_createdAt_idx" ON "AccessControlAuditLog"("action", "createdAt");
CREATE INDEX "AccessControlAuditLog_requestId_idx" ON "AccessControlAuditLog"("requestId");

CREATE OR REPLACE FUNCTION prevent_access_control_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AccessControlAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AccessControlAuditLog_append_only_update" BEFORE UPDATE ON "AccessControlAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_access_control_audit_mutation();
CREATE TRIGGER "AccessControlAuditLog_append_only_delete" BEFORE DELETE ON "AccessControlAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_access_control_audit_mutation();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt")
VALUES
  ('permission_access_audit_read', 'access_audit.read', 'Read access-control audit history.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission_user_sessions_revoke', 'user_sessions.revoke', 'Revoke active sessions for internal users.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'ADMIN'
  AND permission."key" IN ('access_audit.read', 'user_sessions.revoke')
ON CONFLICT DO NOTHING;
