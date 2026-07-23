CREATE TYPE "DailyCloseSnapshotType" AS ENUM ('REVIEWED', 'CLOSED', 'REOPENED');

CREATE TYPE "DailyCloseEventType" AS ENUM (
  'CASH_COUNT_RECORDED',
  'EXPENSE_RECORDED',
  'INVENTORY_COUNT_CREATED',
  'INVENTORY_COUNT_DELETED',
  'INVENTORY_COUNT_UPDATED',
  'SCALE_TICKET_RECORDED',
  'STATUS_CHANGED'
);

ALTER TABLE "CashMovement"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT;

ALTER TABLE "DailyCloseInventoryCount"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT;

ALTER TABLE "ScaleTicketReference"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT;

CREATE UNIQUE INDEX "CashMovement_idempotencyKey_key" ON "CashMovement"("idempotencyKey");
CREATE UNIQUE INDEX "DailyCloseInventoryCount_idempotencyKey_key" ON "DailyCloseInventoryCount"("idempotencyKey");
CREATE UNIQUE INDEX "ScaleTicketReference_idempotencyKey_key" ON "ScaleTicketReference"("idempotencyKey");

CREATE TABLE "DailyCloseEvent" (
  "id" TEXT NOT NULL,
  "pointOfSaleDailyCloseId" TEXT NOT NULL,
  "type" "DailyCloseEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyCloseEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyCloseEvent_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyCloseEvent_idempotencyKey_key" ON "DailyCloseEvent"("idempotencyKey");
CREATE INDEX "DailyCloseEvent_pointOfSaleDailyCloseId_createdAt_idx" ON "DailyCloseEvent"("pointOfSaleDailyCloseId", "createdAt");

CREATE TABLE "DailyCloseSnapshot" (
  "id" TEXT NOT NULL,
  "pointOfSaleDailyCloseId" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "snapshotType" "DailyCloseSnapshotType" NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyCloseSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyCloseSnapshot_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyCloseSnapshot_pointOfSaleDailyCloseId_sourceVersion_snapshotType_key"
  ON "DailyCloseSnapshot"("pointOfSaleDailyCloseId", "sourceVersion", "snapshotType");
CREATE INDEX "DailyCloseSnapshot_pointOfSaleDailyCloseId_createdAt_idx"
  ON "DailyCloseSnapshot"("pointOfSaleDailyCloseId", "createdAt");
