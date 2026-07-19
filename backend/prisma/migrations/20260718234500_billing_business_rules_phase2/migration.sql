-- Phase 2 strengthens the Phase 1 monetary guards against concurrent writes and
-- evaluates requests against both active requests and active invoice applications.

CREATE OR REPLACE FUNCTION billing_request_document_amount_guard()
RETURNS TRIGGER AS $$
DECLARE
  available_total DECIMAL(14,2);
  active_requested DECIMAL(14,2);
  active_invoiced DECIMAL(14,2);
BEGIN
  IF NEW."requestedSubtotal" < 0 OR NEW."requestedTax" < 0 OR NEW."requestedTotal" <= 0
     OR NEW."requestedSubtotal" + NEW."requestedTax" <> NEW."requestedTotal" THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_REQUESTED_AMOUNT', ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."saleDocumentId", 0));

  IF NEW."reversedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT s."total"
    INTO available_total
    FROM "SaleDocument" d
    JOIN "Sale" s ON s."id" = d."saleId"
   WHERE d."id" = NEW."saleDocumentId";

  SELECT COALESCE(SUM(r."requestedTotal"), 0)
    INTO active_requested
    FROM "BillingRequestSaleDocument" r
    JOIN "BillingRequest" b ON b."id" = r."billingRequestId"
   WHERE r."saleDocumentId" = NEW."saleDocumentId"
     AND r."reversedAt" IS NULL
     AND b."status" NOT IN ('REJECTED', 'CANCELLED')
     AND r."id" <> NEW."id";

  SELECT COALESCE(SUM(a."totalApplied"), 0)
    INTO active_invoiced
    FROM "InvoiceSaleDocument" a
    JOIN "Invoice" i ON i."id" = a."invoiceId"
   WHERE a."saleDocumentId" = NEW."saleDocumentId"
     AND a."reversedAt" IS NULL
     AND i."status" = 'ACTIVE';

  IF active_requested + active_invoiced + NEW."requestedTotal" > available_total THEN
    RAISE EXCEPTION USING MESSAGE = 'OVER_REQUESTED', ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION invoice_document_amount_guard()
RETURNS TRIGGER AS $$
DECLARE
  available_total DECIMAL(14,2);
  active_invoiced DECIMAL(14,2);
BEGIN
  IF NEW."subtotalApplied" < 0 OR NEW."taxApplied" < 0 OR NEW."totalApplied" <= 0
     OR NEW."subtotalApplied" + NEW."taxApplied" <> NEW."totalApplied" THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_APPLIED_AMOUNT', ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."saleDocumentId", 0));

  IF NEW."reversedAt" IS NOT NULL THEN
    RETURN NEW;
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
