-- Preserve the evidence required to reconcile non-cash POS payments.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CHECK';

ALTER TABLE "Payment"
  ADD COLUMN "cardLastFour" TEXT;
