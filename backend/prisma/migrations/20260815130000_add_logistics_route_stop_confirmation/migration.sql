ALTER TABLE "DeliveryRoute"
  ADD COLUMN "logisticsStopCompletedAt" TIMESTAMP(3),
  ADD COLUMN "logisticsStopCompletedByUserId" TEXT,
  ADD COLUMN "logisticsStopNotes" TEXT;

ALTER TABLE "DeliveryRoute"
  ADD CONSTRAINT "DeliveryRoute_logisticsStopCompletedByUserId_fkey"
    FOREIGN KEY ("logisticsStopCompletedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeliveryRoute_logisticsStopCompletedByUserId_idx"
  ON "DeliveryRoute"("logisticsStopCompletedByUserId");
