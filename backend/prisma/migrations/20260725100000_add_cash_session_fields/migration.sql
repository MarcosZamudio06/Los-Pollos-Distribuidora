CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "PointOfSaleDailyClose"
  ADD COLUMN "cashSessionStatus" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "terminalIdentifier" TEXT NOT NULL DEFAULT 'Caja 01',
  ADD COLUMN "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cashSessionClosedAt" TIMESTAMP(3),
  ADD COLUMN "initialCashFund" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "initialCashIn" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "initialCashOut" DECIMAL(14, 2) NOT NULL DEFAULT 0;

UPDATE "PointOfSaleDailyClose"
SET
  "openedAt" = "createdAt",
  "cashSessionStatus" = CASE WHEN "status" = 'DRAFT' THEN 'OPEN'::"CashSessionStatus" ELSE 'CLOSED'::"CashSessionStatus" END,
  "cashSessionClosedAt" = CASE WHEN "status" = 'DRAFT' THEN NULL ELSE COALESCE("closedAt", "updatedAt") END;

ALTER TABLE "CashMovement"
  ADD COLUMN "isOpening" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Sale_pointOfSaleDailyCloseId_createdAt_idx"
  ON "Sale"("pointOfSaleDailyCloseId", "createdAt");

CREATE INDEX "Payment_pointOfSaleDailyCloseId_paidAt_idx"
  ON "Payment"("pointOfSaleDailyCloseId", "paidAt");

CREATE INDEX "CashMovement_pointOfSaleDailyCloseId_occurredAt_idx"
  ON "CashMovement"("pointOfSaleDailyCloseId", "occurredAt");
