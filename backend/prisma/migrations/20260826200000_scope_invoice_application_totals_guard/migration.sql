-- InvoiceSaleDocument applications justify sale invoices. CFDI E and REP are
-- fiscal documents sourced by CreditAdjustment and Payment, respectively, so
-- they do not consume or reproduce BillingRequest sale-document applications.
CREATE OR REPLACE FUNCTION assert_invoice_application_totals(target_invoice_id TEXT)
RETURNS VOID AS $$
DECLARE
  invoice_subtotal DECIMAL(14,2);
  invoice_discount DECIMAL(14,2);
  invoice_tax DECIMAL(14,2);
  invoice_total DECIMAL(14,2);
  invoice_status "InvoiceStatus";
  invoice_cfdi_type "CfdiDocumentType";
  applied_subtotal DECIMAL(14,2);
  applied_tax DECIMAL(14,2);
  applied_total DECIMAL(14,2);
BEGIN
  SELECT
    i."subtotal",
    i."discount",
    i."tax",
    i."total",
    i."status",
    i."cfdiType"
    INTO
      invoice_subtotal,
      invoice_discount,
      invoice_tax,
      invoice_total,
      invoice_status,
      invoice_cfdi_type
    FROM "Invoice" i
   WHERE i."id" = target_invoice_id;

  IF NOT FOUND OR invoice_status <> 'ACTIVE' THEN
    RETURN;
  END IF;

  IF invoice_cfdi_type IN ('EXPENSE', 'PAYMENT_RECEIPT') THEN
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
