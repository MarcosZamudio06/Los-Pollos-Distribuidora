-- CFDI-17: Payment Receipt 2.0 persistence.
-- Expand: add nullable payment fiscal metadata and insert-only REP snapshots.
-- Backfill: no fiscal associations are inferred; the existing Payment amount
-- and status remain untouched, and MXN is the only non-ambiguous default.
-- Validate: constraints below protect Decimal equations, UUIDs and hashes.
-- Payment remains the economic ledger and existing Invoice rows are untouched.
CREATE TYPE "PaymentInvoiceApplicationStatus" AS ENUM (
  'RESERVED',
  'UNKNOWN',
  'EFFECTIVE',
  'REPLACEMENT_PENDING',
  'RELEASED',
  'REVERSED',
  'INCONSISTENT'
);

ALTER TABLE "Payment"
  ADD COLUMN "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN "exchangeRateToMxn" DECIMAL(18,6),
  ADD COLUMN "fiscalPaymentFormCode" VARCHAR(2);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_currency_code_format_check"
    CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Payment_exchange_rate_positive_check"
    CHECK ("exchangeRateToMxn" IS NULL OR "exchangeRateToMxn" > 0),
  ADD CONSTRAINT "Payment_fiscal_payment_form_code_format_check"
    CHECK ("fiscalPaymentFormCode" IS NULL OR "fiscalPaymentFormCode" ~ '^[0-9]{2}$');

CREATE TABLE "PaymentReceipt" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "complementVersion" VARCHAR(4) NOT NULL DEFAULT '2.0',
  "totalPaymentsMxn" DECIMAL(14,2) NOT NULL,
  "taxTotalsSnapshot" JSONB,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentReceiptDetail" (
  "id" TEXT NOT NULL,
  "paymentReceiptId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "paymentFormCode" VARCHAR(2) NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "exchangeRateToMxn" DECIMAL(18,6) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "sourcePaymentSnapshot" JSONB,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentReceiptDetail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentInvoiceApplication" (
  "id" TEXT NOT NULL,
  "paymentReceiptDetailId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "relatedInvoiceId" TEXT NOT NULL,
  "sourceAccountReceivableId" TEXT,
  "sourceSaleId" TEXT,
  "sourceSaleDocumentId" TEXT,
  "relatedUuid" VARCHAR(36) NOT NULL,
  "relatedSeries" TEXT,
  "relatedFolio" TEXT,
  "documentCurrencyCode" VARCHAR(3) NOT NULL,
  "equivalenceDr" DECIMAL(18,6),
  "paymentMethodDr" VARCHAR(3) NOT NULL,
  "partialityNumber" INTEGER NOT NULL,
  "previousBalanceAmount" DECIMAL(14,2) NOT NULL,
  "amountPaid" DECIMAL(14,2) NOT NULL,
  "remainingBalance" DECIMAL(14,2) NOT NULL,
  "taxObjectCode" VARCHAR(2) NOT NULL,
  "taxesSnapshot" JSONB,
  "sourceDocumentsSnapshot" JSONB,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "status" "PaymentInvoiceApplicationStatus" NOT NULL DEFAULT 'RESERVED',
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentInvoiceApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReceipt_invoiceId_key"
  ON "PaymentReceipt"("invoiceId");
CREATE INDEX "PaymentReceipt_createdAt_idx"
  ON "PaymentReceipt"("createdAt");
CREATE INDEX "PaymentReceipt_createdByUserId_createdAt_idx"
  ON "PaymentReceipt"("createdByUserId", "createdAt");
CREATE INDEX "PaymentReceiptDetail_paymentId_createdAt_idx"
  ON "PaymentReceiptDetail"("paymentId", "createdAt");
CREATE INDEX "PaymentReceiptDetail_paymentReceiptId_paymentDate_idx"
  ON "PaymentReceiptDetail"("paymentReceiptId", "paymentDate");
CREATE UNIQUE INDEX "PaymentReceiptDetail_paymentId_key"
  ON "PaymentReceiptDetail"("paymentId");
CREATE UNIQUE INDEX "PaymentInvoiceApplication_paymentReceiptDetailId_relatedInvoiceId_key"
  ON "PaymentInvoiceApplication"("paymentReceiptDetailId", "relatedInvoiceId");
CREATE INDEX "PaymentInvoiceApplication_paymentId_status_idx"
  ON "PaymentInvoiceApplication"("paymentId", "status");
CREATE INDEX "PaymentInvoiceApplication_relatedInvoiceId_status_partialityNumber_idx"
  ON "PaymentInvoiceApplication"("relatedInvoiceId", "status", "partialityNumber");
CREATE INDEX "PaymentInvoiceApplication_sourceAccountReceivableId_status_idx"
  ON "PaymentInvoiceApplication"("sourceAccountReceivableId", "status");
CREATE INDEX "Payment_currencyCode_paidAt_idx"
  ON "Payment"("currencyCode", "paidAt");

ALTER TABLE "PaymentReceipt"
  ADD CONSTRAINT "PaymentReceipt_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentReceipt_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReceiptDetail"
  ADD CONSTRAINT "PaymentReceiptDetail_paymentReceiptId_fkey"
  FOREIGN KEY ("paymentReceiptId") REFERENCES "PaymentReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentReceiptDetail_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentInvoiceApplication"
  ADD CONSTRAINT "PaymentInvoiceApplication_paymentReceiptDetailId_fkey"
  FOREIGN KEY ("paymentReceiptDetailId") REFERENCES "PaymentReceiptDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentInvoiceApplication_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentInvoiceApplication_relatedInvoiceId_fkey"
  FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentInvoiceApplication_sourceAccountReceivableId_fkey"
  FOREIGN KEY ("sourceAccountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentInvoiceApplication_sourceSaleId_fkey"
  FOREIGN KEY ("sourceSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentInvoiceApplication_sourceSaleDocumentId_fkey"
  FOREIGN KEY ("sourceSaleDocumentId") REFERENCES "SaleDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReceipt"
  ADD CONSTRAINT "PaymentReceipt_integrity_check"
  CHECK ("complementVersion" = '2.0' AND "totalPaymentsMxn" >= 0 AND "snapshotHash" ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE "PaymentReceiptDetail"
  ADD CONSTRAINT "PaymentReceiptDetail_integrity_check"
  CHECK (
    "paymentFormCode" ~ '^[0-9]{2}$'
    AND "currencyCode" ~ '^[A-Z]{3}$'
    AND "exchangeRateToMxn" > 0
    AND "amount" > 0
    AND "snapshotHash" ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
ALTER TABLE "PaymentInvoiceApplication"
  ADD CONSTRAINT "PaymentInvoiceApplication_integrity_check"
  CHECK (
    "relatedUuid" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "partialityNumber" > 0
    AND "previousBalanceAmount" >= 0
    AND "amountPaid" > 0
    AND "remainingBalance" >= 0
    AND "amountPaid" <= "previousBalanceAmount"
    AND "remainingBalance" = "previousBalanceAmount" - "amountPaid"
    AND "snapshotHash" ~ '^[0-9a-f]{64}$'
  ) NOT VALID;

ALTER TABLE "PaymentReceipt" VALIDATE CONSTRAINT "PaymentReceipt_integrity_check";
ALTER TABLE "PaymentReceiptDetail" VALIDATE CONSTRAINT "PaymentReceiptDetail_integrity_check";
ALTER TABLE "PaymentInvoiceApplication" VALIDATE CONSTRAINT "PaymentInvoiceApplication_integrity_check";
