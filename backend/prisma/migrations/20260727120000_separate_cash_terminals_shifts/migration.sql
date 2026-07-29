CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

CREATE TABLE "CashTerminal" (
  "id" TEXT NOT NULL,
  "operationalLocationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashTerminal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashShift" (
  "id" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "operationalLocationId" TEXT NOT NULL,
  "pointOfSaleDailyCloseId" TEXT NOT NULL,
  "cashierUserId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "initialCashFund" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "initialCashIn" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "initialCashOut" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cashCountedTotal" DECIMAL(14,2),
  "cashDifferenceTotal" DECIMAL(14,2),
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Sale"
  ADD COLUMN "terminalId" TEXT,
  ADD COLUMN "cashShiftId" TEXT,
  ADD COLUMN "cashierUserId" TEXT,
  ADD COLUMN "businessDate" DATE,
  ADD COLUMN "registeredAt" TIMESTAMP(3),
  ADD COLUMN "deviceId" TEXT;

ALTER TABLE "Payment" ADD COLUMN "cashShiftId" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN "cashShiftId" TEXT;

INSERT INTO "CashTerminal" (
  "id", "operationalLocationId", "code", "name", "deviceId", "isActive", "createdAt", "updatedAt"
)
SELECT
  'legacy-terminal-' || md5(close."operationalLocationId" || ':' || close."terminalIdentifier"),
  close."operationalLocationId",
  close."terminalIdentifier",
  close."terminalIdentifier",
  'legacy:' || md5(close."operationalLocationId" || ':' || close."terminalIdentifier"),
  true,
  MIN(close."createdAt"),
  MAX(close."updatedAt")
FROM "PointOfSaleDailyClose" close
GROUP BY close."operationalLocationId", close."terminalIdentifier"
ON CONFLICT DO NOTHING;

INSERT INTO "CashShift" (
  "id", "terminalId", "operationalLocationId", "pointOfSaleDailyCloseId", "cashierUserId",
  "businessDate", "status", "openedAt", "closedAt", "closedByUserId", "initialCashFund",
  "initialCashIn", "initialCashOut", "cashCountedTotal", "cashDifferenceTotal", "notes",
  "version", "createdAt", "updatedAt"
)
SELECT
  'legacy-shift-' || close."id",
  'legacy-terminal-' || md5(close."operationalLocationId" || ':' || close."terminalIdentifier"),
  close."operationalLocationId",
  close."id",
  close."openedByUserId",
  close."businessDate",
  CASE
    WHEN close."status" = 'CANCELLED' THEN 'CANCELLED'::"CashShiftStatus"
    WHEN close."cashSessionStatus" = 'OPEN' THEN 'OPEN'::"CashShiftStatus"
    ELSE 'CLOSED'::"CashShiftStatus"
  END,
  close."openedAt",
  close."cashSessionClosedAt",
  close."closedByUserId",
  close."initialCashFund",
  close."initialCashIn",
  close."initialCashOut",
  close."cashCountedTotal",
  close."cashDifferenceTotal",
  close."notes",
  close."version",
  close."createdAt",
  close."updatedAt"
FROM "PointOfSaleDailyClose" close
ON CONFLICT DO NOTHING;

UPDATE "Sale" sale
SET
  "terminalId" = shift."terminalId",
  "cashShiftId" = shift."id",
  "cashierUserId" = shift."cashierUserId",
  "businessDate" = shift."businessDate",
  "registeredAt" = sale."createdAt",
  "deviceId" = terminal."deviceId"
FROM "CashShift" shift
JOIN "CashTerminal" terminal ON terminal."id" = shift."terminalId"
WHERE sale."pointOfSaleDailyCloseId" = shift."pointOfSaleDailyCloseId";

UPDATE "Payment" payment
SET "cashShiftId" = shift."id"
FROM "CashShift" shift
WHERE payment."pointOfSaleDailyCloseId" = shift."pointOfSaleDailyCloseId";

UPDATE "CashMovement" movement
SET "cashShiftId" = shift."id"
FROM "CashShift" shift
WHERE movement."pointOfSaleDailyCloseId" = shift."pointOfSaleDailyCloseId";

WITH ranked_open_shifts AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "terminalId" ORDER BY "businessDate" DESC, "openedAt" DESC, "createdAt" DESC) AS position
  FROM "CashShift"
  WHERE "status" = 'OPEN'
)
UPDATE "CashShift" shift
SET "status" = 'CLOSED', "closedAt" = COALESCE(shift."closedAt", shift."updatedAt")
FROM ranked_open_shifts ranked
WHERE shift."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX "CashTerminal_deviceId_key" ON "CashTerminal"("deviceId");
CREATE UNIQUE INDEX "CashTerminal_operationalLocationId_code_key" ON "CashTerminal"("operationalLocationId", "code");
CREATE INDEX "CashTerminal_operationalLocationId_isActive_idx" ON "CashTerminal"("operationalLocationId", "isActive");
CREATE INDEX "CashShift_terminalId_businessDate_status_idx" ON "CashShift"("terminalId", "businessDate", "status");
CREATE INDEX "CashShift_operationalLocationId_businessDate_status_idx" ON "CashShift"("operationalLocationId", "businessDate", "status");
CREATE INDEX "CashShift_cashierUserId_status_idx" ON "CashShift"("cashierUserId", "status");
CREATE INDEX "CashShift_pointOfSaleDailyCloseId_idx" ON "CashShift"("pointOfSaleDailyCloseId");
CREATE UNIQUE INDEX "cash_shift_one_open_per_terminal_uq" ON "CashShift"("terminalId") WHERE "status" = 'OPEN';
CREATE INDEX "Sale_cashShiftId_registeredAt_idx" ON "Sale"("cashShiftId", "registeredAt");
CREATE INDEX "Sale_terminalId_businessDate_idx" ON "Sale"("terminalId", "businessDate");
CREATE INDEX "Sale_cashierUserId_registeredAt_idx" ON "Sale"("cashierUserId", "registeredAt");
CREATE INDEX "Payment_cashShiftId_paidAt_idx" ON "Payment"("cashShiftId", "paidAt");
CREATE INDEX "CashMovement_cashShiftId_occurredAt_idx" ON "CashMovement"("cashShiftId", "occurredAt");

ALTER TABLE "CashTerminal" ADD CONSTRAINT "CashTerminal_operationalLocationId_fkey"
  FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_terminalId_fkey"
  FOREIGN KEY ("terminalId") REFERENCES "CashTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_operationalLocationId_fkey"
  FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_pointOfSaleDailyCloseId_fkey"
  FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_cashierUserId_fkey"
  FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_terminalId_fkey"
  FOREIGN KEY ("terminalId") REFERENCES "CashTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashShiftId_fkey"
  FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashierUserId_fkey"
  FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashShiftId_fkey"
  FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashShiftId_fkey"
  FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
