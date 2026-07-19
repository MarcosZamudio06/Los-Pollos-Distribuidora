-- Read-only reconciliation report for billing reportable notes phase 1.
-- Run after the migration and before activating the billing report.

SELECT
  "code",
  "entityType",
  COUNT(*) AS "openItems"
FROM "BillingDataRemediation"
WHERE "resolvedAt" IS NULL
GROUP BY "code", "entityType"
ORDER BY "code", "entityType";

SELECT
  r."id" AS "remediationId",
  r."code",
  r."entityId",
  r."details",
  r."createdAt"
FROM "BillingDataRemediation" r
WHERE r."resolvedAt" IS NULL
ORDER BY r."code", r."createdAt", r."entityId";

SELECT
  s."locationId",
  COUNT(*) AS "salesWithoutIssuer",
  MIN(s."createdAt") AS "oldestSale",
  MAX(s."createdAt") AS "newestSale"
FROM "Sale" s
WHERE s."legalEntityId" IS NULL
GROUP BY s."locationId"
ORDER BY s."locationId";

SELECT
  s."id" AS "saleId",
  s."saleNumber",
  s."documentType",
  COUNT(d."id") AS "matchingDocuments"
FROM "Sale" s
LEFT JOIN "SaleDocument" d
  ON d."saleId" = s."id"
 AND d."documentType" = s."documentType"
GROUP BY s."id", s."saleNumber", s."documentType"
HAVING COUNT(d."id") <> 1
ORDER BY s."saleNumber";

SELECT
  s."id" AS "saleId",
  s."saleNumber",
  s."subtotal",
  s."discount",
  s."tax",
  s."total",
  COALESCE(SUM(si."subtotal"), 0) AS "itemSubtotal",
  COALESCE(SUM(si."discount"), 0) AS "itemDiscount",
  COALESCE(SUM(si."tax"), 0) AS "itemTax",
  COALESCE(SUM(si."total"), 0) AS "itemTotal"
FROM "Sale" s
LEFT JOIN "SaleItem" si ON si."saleId" = s."id"
GROUP BY s."id", s."saleNumber", s."subtotal", s."discount", s."tax", s."total"
HAVING
  COALESCE(SUM(si."subtotal"), 0) <> s."subtotal"
  OR COALESCE(SUM(si."discount"), 0) <> s."discount"
  OR COALESCE(SUM(si."tax"), 0) <> s."tax"
  OR COALESCE(SUM(si."total"), 0) <> s."total"
ORDER BY s."saleNumber";
