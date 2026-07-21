CREATE TABLE "BillingRequestSaleItem" (
  "id" TEXT NOT NULL,
  "billingRequestSaleDocumentId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "requestedSubtotal" DECIMAL(14,2) NOT NULL,
  "requestedTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "requestedTotal" DECIMAL(14,2) NOT NULL,
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "BillingRequestSaleItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingRequestSaleItem_billingRequestSaleDocumentId_fkey" FOREIGN KEY ("billingRequestSaleDocumentId") REFERENCES "BillingRequestSaleDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingRequestSaleItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingRequestSaleItem_amount_check" CHECK ("requestedSubtotal" >= 0 AND "requestedTax" >= 0 AND "requestedTotal" > 0 AND "requestedSubtotal" + "requestedTax" = "requestedTotal")
);

CREATE UNIQUE INDEX "BillingRequestSaleItem_billingRequestSaleDocumentId_saleItemId_key" ON "BillingRequestSaleItem"("billingRequestSaleDocumentId", "saleItemId");
CREATE INDEX "BillingRequestSaleItem_saleItemId_reversedAt_idx" ON "BillingRequestSaleItem"("saleItemId", "reversedAt");

INSERT INTO "BillingRequestSaleItem" ("id", "billingRequestSaleDocumentId", "saleItemId", "requestedSubtotal", "requestedTax", "requestedTotal")
SELECT brd."id" || ':' || si."id", brd."id", si."id",
  GREATEST(si."taxableBase" - COALESCE(prior."subtotalApplied", 0), 0),
  GREATEST(si."tax" - COALESCE(prior."taxApplied", 0), 0),
  GREATEST(si."total" - COALESCE(prior."totalApplied", 0), 0)
FROM "BillingRequestSaleDocument" brd
JOIN "SaleDocument" sd ON sd."id" = brd."saleDocumentId"
JOIN "SaleItem" si ON si."saleId" = sd."saleId"
  AND (jsonb_array_length(brd."selectedSaleItemIds") = 0 OR brd."selectedSaleItemIds" ? si."id")
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(iia."subtotalApplied"), 0) AS "subtotalApplied", COALESCE(SUM(iia."taxApplied"), 0) AS "taxApplied", COALESCE(SUM(iia."totalApplied"), 0) AS "totalApplied"
  FROM "InvoiceSaleItemApplication" iia
  JOIN "InvoiceSaleDocument" idoc ON idoc."id" = iia."invoiceSaleDocumentId"
  JOIN "Invoice" inv ON inv."id" = idoc."invoiceId"
  WHERE iia."saleItemId" = si."id" AND iia."reversedAt" IS NULL AND idoc."reversedAt" IS NULL
    AND inv."status" = 'ACTIVE' AND iia."createdAt" < brd."createdAt"
) prior ON TRUE
WHERE GREATEST(si."total" - COALESCE(prior."totalApplied", 0), 0) > 0;

ALTER TABLE "BillingRequestSaleDocument" DROP CONSTRAINT "BillingRequestSaleDocument_selected_items_array_check";
ALTER TABLE "BillingRequestSaleDocument" DROP COLUMN "selectedSaleItemIds";

CREATE OR REPLACE FUNCTION billing_request_sale_item_guard()
RETURNS TRIGGER AS $$
DECLARE
  request_document_id TEXT;
  item_sale_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."saleItemId", 0));
  IF NEW."reversedAt" IS NOT NULL THEN RETURN NEW; END IF;

  SELECT d."saleId" INTO request_document_id
  FROM "BillingRequestSaleDocument" brd JOIN "SaleDocument" d ON d."id" = brd."saleDocumentId"
  WHERE brd."id" = NEW."billingRequestSaleDocumentId" AND brd."reversedAt" IS NULL;
  SELECT "saleId" INTO item_sale_id FROM "SaleItem" WHERE "id" = NEW."saleItemId";
  IF request_document_id IS NULL OR request_document_id <> item_sale_id THEN
    RAISE EXCEPTION USING MESSAGE = 'BILLING_REQUEST_ITEM_DOCUMENT_MISMATCH', ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "BillingRequestSaleItem" existing
    JOIN "BillingRequestSaleDocument" brd ON brd."id" = existing."billingRequestSaleDocumentId" AND brd."reversedAt" IS NULL
    JOIN "BillingRequest" br ON br."id" = brd."billingRequestId"
    WHERE existing."saleItemId" = NEW."saleItemId" AND existing."reversedAt" IS NULL
      AND existing."id" <> NEW."id" AND br."status" IN ('REQUESTED', 'IN_REVIEW', 'APPROVED')
  ) THEN RAISE EXCEPTION USING MESSAGE = 'SALE_ITEM_ALREADY_RESERVED', ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_request_sale_item_guard BEFORE INSERT OR UPDATE ON "BillingRequestSaleItem" FOR EACH ROW EXECUTE FUNCTION billing_request_sale_item_guard();

CREATE OR REPLACE FUNCTION invoice_request_item_amount_guard()
RETURNS TRIGGER AS $$
DECLARE
  request_document_id TEXT;
  requested_subtotal DECIMAL(14,2);
  requested_tax DECIMAL(14,2);
  requested_total DECIMAL(14,2);
  consumed_subtotal DECIMAL(14,2);
  consumed_tax DECIMAL(14,2);
  consumed_total DECIMAL(14,2);
BEGIN
  IF NEW."reversedAt" IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."saleItemId", 0));

  SELECT idoc."billingRequestSaleDocumentId" INTO request_document_id FROM "InvoiceSaleDocument" idoc WHERE idoc."id" = NEW."invoiceSaleDocumentId" AND idoc."reversedAt" IS NULL;
  SELECT bri."requestedSubtotal", bri."requestedTax", bri."requestedTotal" INTO requested_subtotal, requested_tax, requested_total
  FROM "BillingRequestSaleItem" bri
  WHERE bri."billingRequestSaleDocumentId" = request_document_id AND bri."saleItemId" = NEW."saleItemId" AND bri."reversedAt" IS NULL;
  IF requested_total IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'ITEM_NOT_IN_BILLING_REQUEST', ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(SUM(iia."subtotalApplied"), 0), COALESCE(SUM(iia."taxApplied"), 0), COALESCE(SUM(iia."totalApplied"), 0)
  INTO consumed_subtotal, consumed_tax, consumed_total
  FROM "InvoiceSaleItemApplication" iia
  JOIN "InvoiceSaleDocument" idoc ON idoc."id" = iia."invoiceSaleDocumentId"
  JOIN "Invoice" inv ON inv."id" = idoc."invoiceId"
  WHERE idoc."billingRequestSaleDocumentId" = request_document_id AND iia."saleItemId" = NEW."saleItemId"
    AND iia."reversedAt" IS NULL AND idoc."reversedAt" IS NULL AND inv."status" = 'ACTIVE' AND iia."id" <> NEW."id";

  IF consumed_subtotal + NEW."subtotalApplied" > requested_subtotal
    OR consumed_tax + NEW."taxApplied" > requested_tax
    OR consumed_total + NEW."totalApplied" > requested_total THEN
    RAISE EXCEPTION USING MESSAGE = 'BILLING_REQUEST_ITEM_AMOUNT_EXCEEDED', ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_request_item_amount_guard BEFORE INSERT OR UPDATE ON "InvoiceSaleItemApplication" FOR EACH ROW EXECUTE FUNCTION invoice_request_item_amount_guard();
