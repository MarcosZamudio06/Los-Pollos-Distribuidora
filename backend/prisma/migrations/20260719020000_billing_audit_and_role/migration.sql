INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
VALUES ('role_billing', 'BILLING', 'Billing review, reconciliation and invoice linking user.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "BillingAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "ipAddress" TEXT,
  "correlationId" TEXT,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BillingAuditLog_entityType_entityId_createdAt_idx" ON "BillingAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "BillingAuditLog_actorUserId_createdAt_idx" ON "BillingAuditLog"("actorUserId", "createdAt");
CREATE INDEX "BillingAuditLog_action_createdAt_idx" ON "BillingAuditLog"("action", "createdAt");
CREATE INDEX "BillingAuditLog_correlationId_idx" ON "BillingAuditLog"("correlationId");

CREATE OR REPLACE FUNCTION prevent_billing_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BillingAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BillingAuditLog_append_only_update" BEFORE UPDATE ON "BillingAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_billing_audit_mutation();
CREATE TRIGGER "BillingAuditLog_append_only_delete" BEFORE DELETE ON "BillingAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_billing_audit_mutation();
