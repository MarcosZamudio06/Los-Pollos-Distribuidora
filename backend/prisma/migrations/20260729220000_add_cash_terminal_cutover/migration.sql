CREATE TABLE "CashTerminalActivation" (
  "id" TEXT NOT NULL,
  "operationalLocationId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "consumedByUserId" TEXT,
  "cashTerminalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashTerminalActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashTerminalActivation_codeHash_key" ON "CashTerminalActivation"("codeHash");
CREATE INDEX "CashTerminalActivation_deviceId_consumedAt_idx" ON "CashTerminalActivation"("deviceId", "consumedAt");
CREATE INDEX "CashTerminalActivation_operationalLocationId_consumedAt_expiresAt_idx" ON "CashTerminalActivation"("operationalLocationId", "consumedAt", "expiresAt");
CREATE INDEX "CashTerminalActivation_cashTerminalId_idx" ON "CashTerminalActivation"("cashTerminalId");

ALTER TABLE "CashTerminalActivation" ADD CONSTRAINT "CashTerminalActivation_operationalLocationId_fkey"
  FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTerminalActivation" ADD CONSTRAINT "CashTerminalActivation_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTerminalActivation" ADD CONSTRAINT "CashTerminalActivation_consumedByUserId_fkey"
  FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTerminalActivation" ADD CONSTRAINT "CashTerminalActivation_cashTerminalId_fkey"
  FOREIGN KEY ("cashTerminalId") REFERENCES "CashTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
