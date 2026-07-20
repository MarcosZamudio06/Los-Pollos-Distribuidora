-- Canonical billability read model consumed by reports and billing commands.
CREATE VIEW "BillingReportableNoteReadModel" AS
WITH policy AS (
        SELECT * FROM "BillingPolicy" WHERE "id" = 'default'
      ), request_consumption AS (
        SELECT idoc."billingRequestSaleDocumentId", COALESCE(SUM(idoc."totalApplied") FILTER (
          WHERE idoc."reversedAt" IS NULL AND i."status" = 'ACTIVE'), 0) AS consumed
        FROM "InvoiceSaleDocument" idoc JOIN "Invoice" i ON i."id" = idoc."invoiceId"
        WHERE idoc."billingRequestSaleDocumentId" IS NOT NULL
        GROUP BY idoc."billingRequestSaleDocumentId"
      ), request_totals AS (
        SELECT brd."saleDocumentId", COALESCE(SUM(GREATEST(brd."requestedTotal" - COALESCE(rc.consumed, 0), 0)) FILTER (
          WHERE brd."reversedAt" IS NULL AND br."status" NOT IN ('REJECTED', 'CANCELLED')), 0) AS requested,
          BOOL_OR(br."status" = 'REQUESTED' AND brd."reversedAt" IS NULL
            AND brd."requestedTotal" > COALESCE(rc.consumed, 0)) AS requested_state,
          BOOL_OR(br."status" IN ('IN_REVIEW', 'APPROVED') AND brd."reversedAt" IS NULL
            AND brd."requestedTotal" > COALESCE(rc.consumed, 0)) AS process_state
        FROM "BillingRequestSaleDocument" brd JOIN "BillingRequest" br ON br."id" = brd."billingRequestId"
        LEFT JOIN request_consumption rc ON rc."billingRequestSaleDocumentId" = brd."id"
        GROUP BY brd."saleDocumentId"
      ), invoice_totals AS (
        SELECT idoc."saleDocumentId", COALESCE(SUM(idoc."totalApplied") FILTER (
          WHERE idoc."reversedAt" IS NULL AND i."status" = 'ACTIVE'), 0) AS invoiced
        FROM "InvoiceSaleDocument" idoc JOIN "Invoice" i ON i."id" = idoc."invoiceId"
        GROUP BY idoc."saleDocumentId"
      ), payment_totals AS (
        SELECT s."id" AS "saleId", COALESCE(SUM(p."amount") FILTER (WHERE p."status" <> 'CANCELLED'), 0) AS paid
        FROM "Sale" s LEFT JOIN "AccountReceivable" ar ON ar."saleId" = s."id"
        LEFT JOIN "Payment" p ON p."saleId" = s."id" OR p."accountReceivableId" = ar."id"
        GROUP BY s."id"
      ), calculated AS (
        SELECT sd."id" AS "saleDocumentId", s."id" AS "saleId", s."saleNumber", sd."createdAt" AS "issuedAt",
          sd."documentType", sd."status" AS "documentStatus", sd."physicalFolio",
          s."locationId", loc."name" AS "locationName", s."customerId", c."name" AS "customerName", c."taxId",
          s."userId" AS "sellerId", u."name" AS "sellerName", s."routeId", route."name" AS "routeName",
          s."currencyCode", s."legalEntityId",
          (s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED'
            AND sd."documentType" = s."documentType"
            AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")) AS "isBillableUnit",
          CASE WHEN s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED'
            AND sd."documentType" = s."documentType"
            AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt") THEN s."total" ELSE 0 END AS "total",
          COALESCE((SELECT STRING_AGG(DISTINCT i."uuid", ', ' ORDER BY i."uuid") FROM "InvoiceSaleDocument" ix
            JOIN "Invoice" i ON i."id" = ix."invoiceId" WHERE ix."saleDocumentId" = sd."id" AND ix."reversedAt" IS NULL
            AND i."status" = 'ACTIVE' AND i."uuid" IS NOT NULL), '') AS "invoiceUuids",
          COALESCE((SELECT STRING_AGG(DISTINCT CONCAT_WS('-', i."series", i."folio"), ', ' ORDER BY CONCAT_WS('-', i."series", i."folio"))
            FROM "InvoiceSaleDocument" ix JOIN "Invoice" i ON i."id" = ix."invoiceId" WHERE ix."saleDocumentId" = sd."id"
            AND ix."reversedAt" IS NULL AND i."status" = 'ACTIVE'), '') AS "invoiceFolios",
          CASE WHEN sd."documentType" = s."documentType" AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")
            AND s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED' THEN COALESCE(rt.requested, 0) ELSE 0 END AS "activeRequested",
          CASE WHEN sd."documentType" = s."documentType" AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")
            AND s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED' THEN COALESCE(it.invoiced, 0) ELSE 0 END AS "activeInvoiced",
          CASE WHEN sd."documentType" = s."documentType" AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")
            AND s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED' THEN GREATEST(s."total" - COALESCE(it.invoiced, 0), 0) ELSE 0 END AS "pendingInvoice",
          CASE WHEN sd."documentType" = s."documentType" AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")
            AND s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED' THEN COALESCE(pt.paid, 0) ELSE 0 END AS "activePaid",
          CASE WHEN sd."documentType" = s."documentType" AND sd."documentType" = ANY(bp."billableDocumentTypes")
            AND (sd."documentType" <> 'INTERNAL_RECEIPT' OR bp."allowInternalReceipt")
            AND s."status" = 'CONFIRMED' AND sd."status" <> 'CANCELLED' THEN GREATEST(s."total" - COALESCE(pt.paid, 0), 0) ELSE 0 END AS "collectionBalance",
          dord."status"::text AS "deliveryStatus", s."collectionStatus"::text AS "paymentStatus",
          (NULLIF(BTRIM(c."taxId"), '') IS NOT NULL AND NULLIF(BTRIM(c."fiscalName"), '') IS NOT NULL
            AND NULLIF(BTRIM(c."fiscalPostalCode"), '') IS NOT NULL AND NULLIF(BTRIM(c."fiscalRegime"), '') IS NOT NULL
            AND NULLIF(BTRIM(c."fiscalUseCode"), '') IS NOT NULL AND NULLIF(BTRIM(c."billingEmail"), '') IS NOT NULL) AS "fiscalProfileComplete",
          bp."timezone" AS "policyTimezone",
          CASE WHEN bp."deadlineDays" IS NULL THEN NULL
            WHEN bp."deadlineBasis" = 'DELIVERED_AT' THEN (dord."deliveredAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays"
            ELSE (sd."createdAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays" END AS deadline,
          CASE
            WHEN s."status" = 'CANCELLED' OR sd."status" = 'CANCELLED' THEN 'CANCELLED'
            WHEN s."status" <> 'CONFIRMED' OR s."customerId" IS NULL OR s."total" <= 0
              OR sd."documentType" <> s."documentType"
              OR NOT (sd."documentType" = ANY(bp."billableDocumentTypes"))
              OR (sd."documentType" = 'INTERNAL_RECEIPT' AND NOT bp."allowInternalReceipt") THEN 'NOT_BILLABLE'
            WHEN NOT c."isActive" OR NULLIF(BTRIM(c."taxId"), '') IS NULL OR NULLIF(BTRIM(c."fiscalName"), '') IS NULL
              OR NULLIF(BTRIM(c."fiscalPostalCode"), '') IS NULL OR NULLIF(BTRIM(c."fiscalRegime"), '') IS NULL
              OR NULLIF(BTRIM(c."fiscalUseCode"), '') IS NULL OR NULLIF(BTRIM(c."billingEmail"), '') IS NULL
              OR s."currencyCode" IS NULL OR s."legalEntityId" IS NULL
              OR (bp."requireConfirmedDelivery" AND dord."status" IS DISTINCT FROM 'DELIVERED') THEN 'PENDING_INFORMATION'
            WHEN COALESCE(it.invoiced, 0) = s."total" THEN 'FULLY_INVOICED'
            WHEN COALESCE(it.invoiced, 0) > s."total" OR COALESCE(rt.requested, 0) > GREATEST(s."total" - COALESCE(it.invoiced, 0), 0)
              OR (CASE WHEN bp."deadlineDays" IS NULL THEN NULL
                WHEN bp."deadlineBasis" = 'DELIVERED_AT' THEN (dord."deliveredAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays"
                ELSE (sd."createdAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays" END) < (CURRENT_TIMESTAMP AT TIME ZONE bp."timezone")::date THEN 'BLOCKED'
            WHEN COALESCE(it.invoiced, 0) > 0 THEN 'PARTIALLY_INVOICED'
            WHEN COALESCE(rt.process_state, false) THEN 'IN_PROCESS'
            WHEN COALESCE(rt.requested_state, false) THEN 'REQUESTED'
            ELSE 'BILLABLE'
          END AS "billingStatus",
          ARRAY_REMOVE(ARRAY[
            CASE WHEN s."status" = 'CANCELLED' THEN 'SALE_CANCELLED' END,
            CASE WHEN s."status" <> 'CANCELLED' AND sd."status" = 'CANCELLED' THEN 'DOCUMENT_CANCELLED' END,
            CASE WHEN s."status" NOT IN ('CONFIRMED', 'CANCELLED') THEN 'SALE_NOT_CONFIRMED' END,
            CASE WHEN s."customerId" IS NULL THEN 'MISSING_CUSTOMER' END,
            CASE WHEN s."total" = 0 THEN 'ZERO_BALANCE' END,
            CASE WHEN s."total" < 0 THEN 'INVALID_TOTAL' END,
            CASE WHEN sd."documentType" <> s."documentType" OR NOT (sd."documentType" = ANY(bp."billableDocumentTypes"))
              OR (sd."documentType" = 'INTERNAL_RECEIPT' AND NOT bp."allowInternalReceipt") THEN 'DOCUMENT_TYPE_NOT_BILLABLE' END,
            CASE WHEN NOT c."isActive" THEN 'CUSTOMER_INACTIVE' END,
            CASE WHEN NULLIF(BTRIM(c."taxId"), '') IS NULL THEN 'MISSING_TAX_ID' END,
            CASE WHEN NULLIF(BTRIM(c."fiscalName"), '') IS NULL OR NULLIF(BTRIM(c."fiscalPostalCode"), '') IS NULL
              OR NULLIF(BTRIM(c."fiscalRegime"), '') IS NULL OR NULLIF(BTRIM(c."fiscalUseCode"), '') IS NULL
              OR NULLIF(BTRIM(c."billingEmail"), '') IS NULL THEN 'MISSING_FISCAL_PROFILE' END,
            CASE WHEN s."currencyCode" IS NULL THEN 'MISSING_CURRENCY' END,
            CASE WHEN s."legalEntityId" IS NULL THEN 'MISSING_LEGAL_ENTITY' END,
            CASE WHEN bp."requireConfirmedDelivery" AND dord."status" IS DISTINCT FROM 'DELIVERED' THEN 'DELIVERY_PENDING' END,
            CASE WHEN COALESCE(it.invoiced, 0) > s."total" THEN 'OVER_INVOICED' END,
            CASE WHEN COALESCE(rt.requested, 0) > GREATEST(s."total" - COALESCE(it.invoiced, 0), 0) THEN 'OVER_REQUESTED' END,
            CASE WHEN (CASE WHEN bp."deadlineDays" IS NULL THEN NULL
              WHEN bp."deadlineBasis" = 'DELIVERED_AT' THEN (dord."deliveredAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays"
              ELSE (sd."createdAt" AT TIME ZONE bp."timezone")::date + bp."deadlineDays" END) < (CURRENT_TIMESTAMP AT TIME ZONE bp."timezone")::date THEN 'BILLING_DEADLINE_EXPIRED' END
          ], NULL) AS "blockingCodes",
          GREATEST(s."updatedAt", sd."updatedAt", COALESCE(c."updatedAt", sd."updatedAt")) AS "updatedAt"
        FROM "SaleDocument" sd JOIN "Sale" s ON s."id" = sd."saleId" CROSS JOIN policy bp
        LEFT JOIN "Customer" c ON c."id" = s."customerId" JOIN "User" u ON u."id" = s."userId"
        JOIN "OperationalLocation" loc ON loc."id" = s."locationId" LEFT JOIN "DeliveryRoute" route ON route."id" = s."routeId"
        LEFT JOIN "DeliveryOrder" dord ON dord."saleId" = s."id" LEFT JOIN request_totals rt ON rt."saleDocumentId" = sd."id"
        LEFT JOIN invoice_totals it ON it."saleDocumentId" = sd."id" LEFT JOIN payment_totals pt ON pt."saleId" = s."id"
      )
SELECT * FROM calculated;
