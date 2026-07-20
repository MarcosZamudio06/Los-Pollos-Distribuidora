ALTER TABLE "InvoiceSaleDocument"
ADD COLUMN "billingRequestSaleDocumentId" TEXT;

WITH unique_candidate AS (
  SELECT
    idoc."id" AS "invoiceSaleDocumentId",
    MIN(brd."id") AS "billingRequestSaleDocumentId"
  FROM "InvoiceSaleDocument" idoc
  JOIN "BillingRequestSaleDocument" brd
    ON brd."saleDocumentId" = idoc."saleDocumentId"
   AND brd."reversedAt" IS NULL
  JOIN "BillingRequest" br
    ON br."id" = brd."billingRequestId"
   AND br."status" IN ('REQUESTED', 'IN_REVIEW', 'APPROVED')
  WHERE idoc."reversedAt" IS NULL
  GROUP BY idoc."id"
  HAVING COUNT(*) = 1
)
UPDATE "InvoiceSaleDocument" idoc
SET "billingRequestSaleDocumentId" = candidate."billingRequestSaleDocumentId"
FROM unique_candidate candidate
WHERE candidate."invoiceSaleDocumentId" = idoc."id";

CREATE INDEX "InvoiceSaleDocument_billingRequestSaleDocumentId_reversedAt_idx"
ON "InvoiceSaleDocument"("billingRequestSaleDocumentId", "reversedAt");

ALTER TABLE "InvoiceSaleDocument"
ADD CONSTRAINT "InvoiceSaleDocument_billingRequestSaleDocumentId_fkey"
FOREIGN KEY ("billingRequestSaleDocumentId")
REFERENCES "BillingRequestSaleDocument"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace the existing document-balance trigger function so every new active
-- application is also bounded by the exact request/document relation that
-- authorized it. The advisory locks make both balance checks concurrency-safe.
CREATE OR REPLACE FUNCTION invoice_document_amount_guard()
RETURNS TRIGGER AS $$
DECLARE
  available_total DECIMAL(14,2);
  active_invoiced DECIMAL(14,2);
  requested_total DECIMAL(14,2);
  consumed_total DECIMAL(14,2);
  request_sale_document_id TEXT;
BEGIN
  IF NEW."subtotalApplied" < 0 OR NEW."taxApplied" < 0 OR NEW."totalApplied" <= 0
     OR NEW."subtotalApplied" + NEW."taxApplied" <> NEW."totalApplied" THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_APPLIED_AMOUNT', ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."saleDocumentId", 0));

  IF NEW."reversedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."billingRequestSaleDocumentId" IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'BILLING_REQUEST_APPLICATION_REQUIRED', ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."billingRequestSaleDocumentId", 0));

  SELECT r."requestedTotal", r."saleDocumentId"
    INTO requested_total, request_sale_document_id
    FROM "BillingRequestSaleDocument" r
   WHERE r."id" = NEW."billingRequestSaleDocumentId"
     AND r."reversedAt" IS NULL;

  IF requested_total IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'BILLING_REQUEST_APPLICATION_REQUIRED', ERRCODE = 'P0001';
  END IF;

  IF request_sale_document_id <> NEW."saleDocumentId" THEN
    RAISE EXCEPTION USING MESSAGE = 'BILLING_REQUEST_DOCUMENT_MISMATCH', ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(a."totalApplied"), 0)
    INTO consumed_total
    FROM "InvoiceSaleDocument" a
    JOIN "Invoice" i ON i."id" = a."invoiceId"
   WHERE a."billingRequestSaleDocumentId" = NEW."billingRequestSaleDocumentId"
     AND a."reversedAt" IS NULL
     AND i."status" = 'ACTIVE'
     AND a."id" <> NEW."id";

  IF consumed_total + NEW."totalApplied" > requested_total THEN
    RAISE EXCEPTION USING MESSAGE = 'OVER_INVOICED', ERRCODE = 'P0001';
  END IF;

  SELECT s."total"
    INTO available_total
    FROM "SaleDocument" d
    JOIN "Sale" s ON s."id" = d."saleId"
   WHERE d."id" = NEW."saleDocumentId";

  SELECT COALESCE(SUM(a."totalApplied"), 0)
    INTO active_invoiced
    FROM "InvoiceSaleDocument" a
    JOIN "Invoice" i ON i."id" = a."invoiceId"
   WHERE a."saleDocumentId" = NEW."saleDocumentId"
     AND a."reversedAt" IS NULL
     AND i."status" = 'ACTIVE'
     AND a."id" <> NEW."id";

  IF active_invoiced + NEW."totalApplied" > available_total THEN
    RAISE EXCEPTION USING MESSAGE = 'OVER_INVOICED', ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assert_invoice_application_totals(target_invoice_id TEXT)
RETURNS VOID AS $$
DECLARE
  invoice_subtotal DECIMAL(14,2);
  invoice_discount DECIMAL(14,2);
  invoice_tax DECIMAL(14,2);
  invoice_total DECIMAL(14,2);
  invoice_status "InvoiceStatus";
  applied_subtotal DECIMAL(14,2);
  applied_tax DECIMAL(14,2);
  applied_total DECIMAL(14,2);
BEGIN
  SELECT i."subtotal", i."discount", i."tax", i."total", i."status"
    INTO invoice_subtotal, invoice_discount, invoice_tax, invoice_total, invoice_status
    FROM "Invoice" i
   WHERE i."id" = target_invoice_id;

  IF NOT FOUND OR invoice_status <> 'ACTIVE' THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(a."subtotalApplied"), 0),
    COALESCE(SUM(a."taxApplied"), 0),
    COALESCE(SUM(a."totalApplied"), 0)
    INTO applied_subtotal, applied_tax, applied_total
    FROM "InvoiceSaleDocument" a
   WHERE a."invoiceId" = target_invoice_id
     AND a."reversedAt" IS NULL;

  IF applied_subtotal <> invoice_subtotal - invoice_discount
     OR applied_tax <> invoice_tax
     OR applied_total <> invoice_total THEN
    RAISE EXCEPTION USING MESSAGE = 'INVOICE_TOTAL_MISMATCH', ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION invoice_application_totals_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'Invoice' THEN
    PERFORM assert_invoice_application_totals(NEW."id");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM assert_invoice_application_totals(OLD."invoiceId");
  ELSE
    PERFORM assert_invoice_application_totals(NEW."invoiceId");
    IF TG_OP = 'UPDATE' AND OLD."invoiceId" <> NEW."invoiceId" THEN
      PERFORM assert_invoice_application_totals(OLD."invoiceId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER invoice_application_totals_guard_applications
AFTER INSERT OR UPDATE OR DELETE ON "InvoiceSaleDocument"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION invoice_application_totals_guard();

CREATE CONSTRAINT TRIGGER invoice_application_totals_guard_invoice
AFTER INSERT OR UPDATE ON "Invoice"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION invoice_application_totals_guard();
