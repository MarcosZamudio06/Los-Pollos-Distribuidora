CREATE TABLE "BillingRequestHistory" (
    "id" TEXT NOT NULL,
    "billingRequestId" TEXT NOT NULL,
    "fromStatus" "BillingRequestStatus",
    "toStatus" "BillingRequestStatus" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "BillingRequestHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingRequest_customerId_status_requestedAt_idx" ON "BillingRequest"("customerId", "status", "requestedAt");
CREATE INDEX "BillingRequest_requestedByUserId_requestedAt_idx" ON "BillingRequest"("requestedByUserId", "requestedAt");
CREATE INDEX "BillingRequestHistory_billingRequestId_changedAt_idx" ON "BillingRequestHistory"("billingRequestId", "changedAt");
CREATE INDEX "BillingRequestHistory_changedByUserId_changedAt_idx" ON "BillingRequestHistory"("changedByUserId", "changedAt");

ALTER TABLE "BillingRequestHistory" ADD CONSTRAINT "BillingRequestHistory_billingRequestId_fkey" FOREIGN KEY ("billingRequestId") REFERENCES "BillingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRequestHistory" ADD CONSTRAINT "BillingRequestHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
