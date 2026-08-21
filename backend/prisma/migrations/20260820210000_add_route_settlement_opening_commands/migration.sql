CREATE TABLE "RouteSettlementOpeningCommand" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "responseSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RouteSettlementOpeningCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RouteSettlementOpeningCommand_idempotencyKey_key"
  ON "RouteSettlementOpeningCommand"("idempotencyKey");
CREATE INDEX "RouteSettlementOpeningCommand_routeId_createdAt_idx"
  ON "RouteSettlementOpeningCommand"("routeId", "createdAt");
CREATE INDEX "RouteSettlementOpeningCommand_settlementId_idx"
  ON "RouteSettlementOpeningCommand"("settlementId");
CREATE INDEX "RouteSettlementOpeningCommand_createdByUserId_createdAt_idx"
  ON "RouteSettlementOpeningCommand"("createdByUserId", "createdAt");

ALTER TABLE "RouteSettlementOpeningCommand"
  ADD CONSTRAINT "RouteSettlementOpeningCommand_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteSettlementOpeningCommand"
  ADD CONSTRAINT "RouteSettlementOpeningCommand_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "RouteSettlement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteSettlementOpeningCommand"
  ADD CONSTRAINT "RouteSettlementOpeningCommand_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
