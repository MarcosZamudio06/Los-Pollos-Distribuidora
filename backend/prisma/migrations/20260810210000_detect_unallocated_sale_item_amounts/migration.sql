-- Detect sales created with header-only discounts after the original billing
-- remediation backfill. Historical monetary rows are never rewritten here.
WITH invalid_items AS (
  SELECT DISTINCT "saleId"
  FROM "SaleItem"
  WHERE "taxableBase" <> "subtotal" - "discount"
     OR "total" <> "taxableBase" + "tax"
),
item_totals AS (
  SELECT
    s."id" AS "saleId",
    COUNT(si."id") AS "itemCount",
    COALESCE(SUM(si."subtotal"), 0) AS "subtotal",
    COALESCE(SUM(si."discount"), 0) AS "discount",
    COALESCE(SUM(si."taxableBase"), 0) AS "taxableBase",
    COALESCE(SUM(si."tax"), 0) AS "tax",
    COALESCE(SUM(si."total"), 0) AS "total"
  FROM "Sale" s
  LEFT JOIN "SaleItem" si ON si."saleId" = s."id"
  GROUP BY s."id"
)
INSERT INTO "BillingDataRemediation" (
  "id",
  "code",
  "entityType",
  "entityId",
  "details",
  "updatedAt"
)
SELECT
  'billing-remediation-item-amounts-aud004-' || md5(s."id"),
  'UNALLOCATED_ITEM_AMOUNTS',
  'Sale',
  s."id",
  jsonb_build_object(
    'source', 'AUD-004',
    'saleSubtotal', s."subtotal",
    'saleDiscount', s."discount",
    'saleTax', s."tax",
    'saleTotal', s."total",
    'itemSubtotal', item_totals."subtotal",
    'itemDiscount', item_totals."discount",
    'itemTaxableBase', item_totals."taxableBase",
    'itemTax', item_totals."tax",
    'itemTotal', item_totals."total"
  ),
  NOW()
FROM "Sale" s
JOIN item_totals ON item_totals."saleId" = s."id"
LEFT JOIN invalid_items ON invalid_items."saleId" = s."id"
WHERE item_totals."itemCount" = 0
   OR invalid_items."saleId" IS NOT NULL
   OR item_totals."subtotal" <> s."subtotal"
   OR item_totals."discount" <> s."discount"
   OR item_totals."taxableBase" <> s."subtotal" - s."discount"
   OR item_totals."tax" <> s."tax"
   OR item_totals."total" <> s."total"
ON CONFLICT ("code", "entityType", "entityId") DO NOTHING;
