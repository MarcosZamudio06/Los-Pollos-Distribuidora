WITH item_totals AS (
  SELECT
    s."id" AS "saleId",
    COUNT(si."id") AS "itemCount",
    COALESCE(SUM(si."subtotal"), 0) AS "itemSubtotal",
    COALESCE(SUM(si."discount"), 0) AS "itemDiscount",
    COALESCE(SUM(si."taxableBase"), 0) AS "itemTaxableBase",
    COALESCE(SUM(si."tax"), 0) AS "itemTax",
    COALESCE(SUM(si."total"), 0) AS "itemTotal",
    COALESCE(BOOL_OR(
      si."subtotal" < 0
      OR si."discount" < 0
      OR si."taxableBase" < 0
      OR si."tax" < 0
      OR si."total" < 0
      OR si."subtotal" - si."discount" <> si."taxableBase"
      OR si."taxableBase" + si."tax" <> si."total"
    ), FALSE) AS "hasInvalidItemEquation"
  FROM "Sale" s
  LEFT JOIN "SaleItem" si ON si."saleId" = s."id"
  GROUP BY s."id"
), inconsistent_sales AS (
  SELECT s.*, it.*
  FROM "Sale" s
  JOIN item_totals it ON it."saleId" = s."id"
  WHERE s."total" <= 0
    OR s."subtotal" - s."discount" + s."tax" <> s."total"
    OR it."itemCount" = 0
    OR it."hasInvalidItemEquation"
    OR it."itemSubtotal" <> s."subtotal"
    OR it."itemDiscount" <> s."discount"
    OR it."itemTaxableBase" <> s."subtotal" - s."discount"
    OR it."itemTax" <> s."tax"
    OR it."itemTotal" <> s."total"
)
INSERT INTO "BillingDataRemediation" (
  "id", "code", "entityType", "entityId", "details", "updatedAt"
)
SELECT
  'billing-remediation-total-' || md5(s."id"),
  'INVALID_SALE_TOTAL',
  'Sale',
  s."id",
  jsonb_build_object(
    'detectedBy', 'CANONICAL_SALE_CONSISTENCY_BACKFILL',
    'header', jsonb_build_object('subtotal', s."subtotal", 'discount', s."discount", 'tax', s."tax", 'total', s."total"),
    'items', jsonb_build_object('subtotal', s."itemSubtotal", 'discount', s."itemDiscount", 'taxableBase', s."itemTaxableBase", 'tax', s."itemTax", 'total', s."itemTotal"),
    'hasInvalidItemEquation', s."hasInvalidItemEquation"
  ),
  NOW()
FROM inconsistent_sales s
ON CONFLICT ("code", "entityType", "entityId") DO UPDATE
SET
  "details" = EXCLUDED."details",
  "resolvedAt" = NULL,
  "resolvedByUserId" = NULL,
  "resolutionNotes" = NULL,
  "resolutionIdempotencyKey" = NULL,
  "resolutionPayloadHash" = NULL,
  "version" = "BillingDataRemediation"."version" + 1,
  "updatedAt" = NOW();
