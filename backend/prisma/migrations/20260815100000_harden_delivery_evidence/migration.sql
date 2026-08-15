ALTER TABLE "DeliveryEvidence"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "capturedByUserId" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "DeliveryEvidence_capturedByUserId_receivedAt_idx"
  ON "DeliveryEvidence"("capturedByUserId", "receivedAt");

CREATE INDEX "DeliveryEvidence_sha256_idx"
  ON "DeliveryEvidence"("sha256");

ALTER TABLE "DeliveryEvidence"
  ADD CONSTRAINT "DeliveryEvidence_capturedByUserId_fkey"
  FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
