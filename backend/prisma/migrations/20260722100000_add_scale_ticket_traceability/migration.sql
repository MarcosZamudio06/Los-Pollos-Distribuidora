CREATE TYPE "ScaleTicketCaptureSource" AS ENUM ('MANUAL', 'HARDWARE');

ALTER TABLE "ScaleTicketReference"
  ADD COLUMN "saleDocumentId" TEXT,
  ADD COLUMN "grossWeightKg" DECIMAL(14, 3),
  ADD COLUMN "tareWeightKg" DECIMAL(14, 3),
  ADD COLUMN "netWeightKg" DECIMAL(14, 3),
  ADD COLUMN "scaleDeviceId" TEXT,
  ADD COLUMN "captureSource" "ScaleTicketCaptureSource" NOT NULL DEFAULT 'MANUAL';

UPDATE "ScaleTicketReference"
SET "netWeightKg" = "weightKg"
WHERE "netWeightKg" IS NULL;

CREATE INDEX "ScaleTicketReference_saleDocumentId_idx"
  ON "ScaleTicketReference"("saleDocumentId");

ALTER TABLE "ScaleTicketReference"
  ADD CONSTRAINT "ScaleTicketReference_saleDocumentId_fkey"
  FOREIGN KEY ("saleDocumentId") REFERENCES "SaleDocument"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
