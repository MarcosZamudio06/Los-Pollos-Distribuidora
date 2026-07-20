CREATE TYPE "BillingDeadlineBasis" AS ENUM ('ISSUED_AT', 'DELIVERED_AT');

CREATE TABLE "BillingPolicy" (
  "id" TEXT NOT NULL,
  "billableDocumentTypes" "SaleDocumentType"[],
  "allowInternalReceipt" BOOLEAN NOT NULL DEFAULT false,
  "requireConfirmedDelivery" BOOLEAN NOT NULL DEFAULT false,
  "deadlineDays" INTEGER,
  "deadlineBasis" "BillingDeadlineBasis" NOT NULL DEFAULT 'ISSUED_AT',
  "timezone" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingPolicy_deadlineDays_check" CHECK ("deadlineDays" IS NULL OR "deadlineDays" >= 0),
  CONSTRAINT "BillingPolicy_timezone_not_blank_check" CHECK (BTRIM("timezone") <> '')
);

INSERT INTO "BillingPolicy" (
  "id", "billableDocumentTypes", "allowInternalReceipt", "requireConfirmedDelivery",
  "deadlineDays", "deadlineBasis", "timezone"
) VALUES (
  'default', ARRAY['SIMPLE_NOTE', 'LARGE_NOTE']::"SaleDocumentType"[], false, false,
  30, 'ISSUED_AT', 'America/Mexico_City'
);
