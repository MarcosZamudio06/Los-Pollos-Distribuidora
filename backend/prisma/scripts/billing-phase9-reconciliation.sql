-- Read-only reconciliation report for billing phase 9.
-- Every result set should be empty, except the final parity control row.

WITH "documentApplications" AS (
  SELECT
    isd."saleDocumentId",
    SUM(isd."totalApplied") AS "documentApplicationTotal"
  FROM "InvoiceSaleDocument" isd
  JOIN "Invoice" i ON i."id" = isd."invoiceId"
  WHERE isd."reversedAt" IS NULL
    AND i."status" = 'ACTIVE'
  GROUP BY isd."saleDocumentId"
),
"invoiceApplications" AS (
  SELECT
    i."id" AS "invoiceId",
    i."total" AS "invoiceTotal",
    COALESCE(SUM(isd."totalApplied") FILTER (
      WHERE isd."reversedAt" IS NULL
    ), 0) AS "invoiceApplicationTotal"
  FROM "Invoice" i
  LEFT JOIN "InvoiceSaleDocument" isd ON isd."invoiceId" = i."id"
  WHERE i."status" = 'ACTIVE'
  GROUP BY i."id", i."total"
)
SELECT
  'DOCUMENT_OVER_INVOICED' AS "reconciliationCode",
  sd."id" AS "entityId",
  s."total" AS "expectedTotal",
  da."documentApplicationTotal" AS "actualTotal"
FROM "documentApplications" da
JOIN "SaleDocument" sd ON sd."id" = da."saleDocumentId"
JOIN "Sale" s ON s."id" = sd."saleId"
WHERE da."documentApplicationTotal" > s."total"
UNION ALL
SELECT
  'INVOICE_APPLICATION_MISMATCH',
  ia."invoiceId",
  ia."invoiceTotal",
  ia."invoiceApplicationTotal"
FROM "invoiceApplications" ia
WHERE ia."invoiceApplicationTotal" <> ia."invoiceTotal"
ORDER BY "reconciliationCode", "entityId";

WITH "itemApplications" AS (
  SELECT
    isia."invoiceSaleDocumentId",
    COALESCE(SUM(isia."totalApplied"), 0) AS "itemApplicationTotal"
  FROM "InvoiceSaleItemApplication" isia
  WHERE isia."reversedAt" IS NULL
  GROUP BY isia."invoiceSaleDocumentId"
)
SELECT
  isd."id" AS "invoiceSaleDocumentId",
  isd."totalApplied" AS "documentApplicationTotal",
  COALESCE(ia."itemApplicationTotal", 0) AS "itemApplicationTotal"
FROM "InvoiceSaleDocument" isd
LEFT JOIN "itemApplications" ia
  ON ia."invoiceSaleDocumentId" = isd."id"
WHERE isd."reversedAt" IS NULL
  AND isd."totalApplied" <> COALESCE(ia."itemApplicationTotal", 0)
ORDER BY isd."id";

WITH "salePayments" AS (
  SELECT
    s."id" AS "saleId",
    s."total" AS "saleTotal",
    COALESCE(SUM(p."amount") FILTER (
      WHERE p."status" <> 'CANCELLED'
    ), 0) AS "activePaymentTotal"
  FROM "Sale" s
  LEFT JOIN "AccountReceivable" ar ON ar."saleId" = s."id"
  LEFT JOIN "Payment" p
    ON p."saleId" = s."id"
    OR p."accountReceivableId" = ar."id"
  GROUP BY s."id", s."total"
)
SELECT
  sp."saleId",
  sp."saleTotal",
  sp."activePaymentTotal",
  sp."saleTotal" - sp."activePaymentTotal" AS "collectionBalance"
FROM "salePayments" sp
WHERE sp."activePaymentTotal" > sp."saleTotal"
ORDER BY sp."saleId";

WITH "reportRows" AS (
  SELECT
    sd."id" AS "saleDocumentId",
    s."total",
    COALESCE((
      SELECT SUM(brd."requestedTotal")
      FROM "BillingRequestSaleDocument" brd
      JOIN "BillingRequest" br ON br."id" = brd."billingRequestId"
      WHERE brd."saleDocumentId" = sd."id"
        AND brd."reversedAt" IS NULL
        AND br."status" NOT IN ('REJECTED', 'CANCELLED')
    ), 0) AS "activeRequested",
    COALESCE((
      SELECT SUM(isd."totalApplied")
      FROM "InvoiceSaleDocument" isd
      JOIN "Invoice" i ON i."id" = isd."invoiceId"
      WHERE isd."saleDocumentId" = sd."id"
        AND isd."reversedAt" IS NULL
        AND i."status" = 'ACTIVE'
    ), 0) AS "activeInvoiced"
  FROM "SaleDocument" sd
  JOIN "Sale" s ON s."id" = sd."saleId"
),
"reportSummary" AS (
  SELECT
    COUNT(*)::bigint AS "rowCount",
    COALESCE(SUM("total"), 0) AS "totalAmount",
    COALESCE(SUM("activeRequested"), 0) AS "requestedAmount",
    COALESCE(SUM("activeInvoiced"), 0) AS "invoicedAmount",
    COALESCE(SUM(GREATEST("total" - "activeInvoiced", 0)), 0) AS "pendingAmount"
  FROM "reportRows"
),
"exportSource" AS (
  SELECT * FROM "reportRows"
),
"exportSummary" AS (
  SELECT
    COUNT(*)::bigint AS "rowCount",
    COALESCE(SUM("total"), 0) AS "totalAmount",
    COALESCE(SUM("activeRequested"), 0) AS "requestedAmount",
    COALESCE(SUM("activeInvoiced"), 0) AS "invoicedAmount",
    COALESCE(SUM(GREATEST("total" - "activeInvoiced", 0)), 0) AS "pendingAmount"
  FROM "exportSource"
)
SELECT
  rs.*,
  es."rowCount" AS "exportRowCount",
  es."totalAmount" AS "exportTotalAmount",
  es."requestedAmount" AS "exportRequestedAmount",
  es."invoicedAmount" AS "exportInvoicedAmount",
  es."pendingAmount" AS "exportPendingAmount",
  CASE
    WHEN ROW(rs."rowCount", rs."totalAmount", rs."requestedAmount", rs."invoicedAmount", rs."pendingAmount")
       = ROW(es."rowCount", es."totalAmount", es."requestedAmount", es."invoicedAmount", es."pendingAmount")
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS "parityStatus"
FROM "reportSummary" rs
CROSS JOIN "exportSummary" es;
