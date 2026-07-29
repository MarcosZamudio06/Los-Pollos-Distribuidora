ALTER TABLE "SaleItem"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SaleDocument"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "BillingDataRemediation"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "resolutionIdempotencyKey" TEXT,
ADD COLUMN "resolutionPayloadHash" TEXT;

CREATE UNIQUE INDEX "BillingDataRemediation_resolutionIdempotencyKey_key"
ON "BillingDataRemediation"("resolutionIdempotencyKey");
