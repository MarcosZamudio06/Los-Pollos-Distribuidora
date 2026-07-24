-- Preserve physical cash received and server-calculated change as payment evidence.
ALTER TABLE "Payment"
  ADD COLUMN "cashTendered" DECIMAL(14, 2),
  ADD COLUMN "changeGiven" DECIMAL(14, 2);
