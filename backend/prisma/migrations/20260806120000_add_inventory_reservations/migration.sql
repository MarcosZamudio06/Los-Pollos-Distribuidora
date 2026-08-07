-- Reservations remain in the physical origin balance until a transfer is
-- confirmed. This migration deliberately fails on incompatible history.
ALTER TABLE "InventoryBalance"
  ADD COLUMN "reservedQuantityKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN "reservedQuantityPieces" INTEGER NOT NULL DEFAULT 0;

DO $$
DECLARE
  invalid_balance_count INTEGER;
  invalid_transfer_count INTEGER;
  invalid_item_count INTEGER;
  duplicate_product_count INTEGER;
  oversubscribed RECORD;
BEGIN
  SELECT COUNT(*)
    INTO invalid_balance_count
  FROM "InventoryBalance"
  WHERE "quantityKg" < 0
     OR "quantityPieces" < 0
     OR "reservedQuantityKg" < 0
     OR "reservedQuantityPieces" < 0;

  IF invalid_balance_count > 0 THEN
    RAISE EXCEPTION
      'Inventory reservation migration aborted: % invalid InventoryBalance rows',
      invalid_balance_count;
  END IF;

  SELECT COUNT(*)
    INTO invalid_transfer_count
  FROM "InventoryTransfer" AS transfer
  WHERE transfer."status" IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus")
    AND NOT EXISTS (
      SELECT 1
      FROM "InventoryTransferItem" AS item
      WHERE item."transferId" = transfer."id"
    );

  IF invalid_transfer_count > 0 THEN
    RAISE EXCEPTION
      'Inventory reservation migration aborted: % pending transfers without items',
      invalid_transfer_count;
  END IF;

  SELECT COUNT(*)
    INTO invalid_item_count
  FROM "InventoryTransfer" AS transfer
  INNER JOIN "InventoryTransferItem" AS item
    ON item."transferId" = transfer."id"
  INNER JOIN "Product" AS product
    ON product."id" = item."productId"
  INNER JOIN "OperationalLocation" AS origin
    ON origin."id" = transfer."originLocationId"
  INNER JOIN "OperationalLocation" AS destination
    ON destination."id" = transfer."destinationLocationId"
  WHERE transfer."status" IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus")
    AND (
      NOT origin."isActive"
      OR NOT destination."isActive"
      OR NOT product."isActive"
      OR COALESCE(item."quantityKg", 0) < 0
      OR COALESCE(item."quantityPieces", 0) < 0
      OR (COALESCE(item."quantityKg", 0) = 0 AND COALESCE(item."quantityPieces", 0) = 0)
      OR (
        product."unit" = 'KG'::"ProductUnit"
        AND NOT (
          item."unit" = 'KG'::"ProductUnit"
          AND COALESCE(item."quantityKg", 0) > 0
          AND COALESCE(item."quantityPieces", 0) = 0
        )
      )
      OR (
        product."unit" = 'PIECE'::"ProductUnit"
        AND NOT (
          item."unit" = 'PIECE'::"ProductUnit"
          AND COALESCE(item."quantityPieces", 0) > 0
          AND COALESCE(item."quantityKg", 0) = 0
        )
      )
      OR (
        product."unit" = 'KG_AND_PIECE'::"ProductUnit"
        AND NOT (
          (
            item."unit" = 'KG'::"ProductUnit"
            AND COALESCE(item."quantityKg", 0) > 0
            AND COALESCE(item."quantityPieces", 0) = 0
          )
          OR (
            item."unit" = 'PIECE'::"ProductUnit"
            AND COALESCE(item."quantityPieces", 0) > 0
            AND COALESCE(item."quantityKg", 0) = 0
          )
          OR (
            item."unit" = 'KG_AND_PIECE'::"ProductUnit"
            AND (
              COALESCE(item."quantityKg", 0) > 0
              OR COALESCE(item."quantityPieces", 0) > 0
            )
          )
        )
      )
    );

  IF invalid_item_count > 0 THEN
    RAISE EXCEPTION
      'Inventory reservation migration aborted: % incompatible pending transfer items',
      invalid_item_count;
  END IF;

  SELECT COUNT(*)
    INTO duplicate_product_count
  FROM "InventoryTransfer" AS transfer
  INNER JOIN "InventoryTransferItem" AS item
    ON item."transferId" = transfer."id"
  WHERE transfer."status" IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus")
  GROUP BY transfer."id", item."productId"
  HAVING COUNT(*) > 1;

  IF duplicate_product_count > 0 THEN
    RAISE EXCEPTION
      'Inventory reservation migration aborted: pending transfers contain duplicate products';
  END IF;

  SELECT
    pending."originLocationId",
    pending."productId",
    pending."reservedQuantityKg",
    pending."reservedQuantityPieces",
    COALESCE(balance."quantityKg", 0) AS "quantityKg",
    COALESCE(balance."quantityPieces", 0) AS "quantityPieces"
    INTO oversubscribed
  FROM (
    SELECT
      transfer."originLocationId",
      item."productId",
      SUM(COALESCE(item."quantityKg", 0)) AS "reservedQuantityKg",
      SUM(COALESCE(item."quantityPieces", 0)) AS "reservedQuantityPieces"
    FROM "InventoryTransfer" AS transfer
    INNER JOIN "InventoryTransferItem" AS item
      ON item."transferId" = transfer."id"
    WHERE transfer."status" IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus")
    GROUP BY transfer."originLocationId", item."productId"
  ) AS pending
  LEFT JOIN "InventoryBalance" AS balance
    ON balance."locationId" = pending."originLocationId"
   AND balance."productId" = pending."productId"
  WHERE balance."id" IS NULL
     OR pending."reservedQuantityKg" > balance."quantityKg"
     OR pending."reservedQuantityPieces" > balance."quantityPieces"
  ORDER BY pending."originLocationId", pending."productId"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Inventory reservation migration aborted: origin %, product %, requestedKg %, onHandKg %, requestedPieces %, onHandPieces %',
      oversubscribed."originLocationId",
      oversubscribed."productId",
      oversubscribed."reservedQuantityKg",
      oversubscribed."quantityKg",
      oversubscribed."reservedQuantityPieces",
      oversubscribed."quantityPieces";
  END IF;

  UPDATE "InventoryBalance" AS balance
  SET
    "reservedQuantityKg" = pending."reservedQuantityKg",
    "reservedQuantityPieces" = pending."reservedQuantityPieces",
    "updatedAt" = CURRENT_TIMESTAMP
  FROM (
    SELECT
      transfer."originLocationId",
      item."productId",
      SUM(COALESCE(item."quantityKg", 0))::DECIMAL(14,3) AS "reservedQuantityKg",
      SUM(COALESCE(item."quantityPieces", 0))::INTEGER AS "reservedQuantityPieces"
    FROM "InventoryTransfer" AS transfer
    INNER JOIN "InventoryTransferItem" AS item
      ON item."transferId" = transfer."id"
    WHERE transfer."status" IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus")
    GROUP BY transfer."originLocationId", item."productId"
  ) AS pending
  WHERE balance."locationId" = pending."originLocationId"
    AND balance."productId" = pending."productId";
END $$;

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_reservedQuantityKg_non_negative_check"
  CHECK ("reservedQuantityKg" >= 0),
  ADD CONSTRAINT "InventoryBalance_reservedQuantityPieces_non_negative_check"
  CHECK ("reservedQuantityPieces" >= 0),
  ADD CONSTRAINT "InventoryBalance_reservedQuantityKg_lte_quantityKg_check"
  CHECK ("reservedQuantityKg" <= "quantityKg"),
  ADD CONSTRAINT "InventoryBalance_reservedQuantityPieces_lte_quantityPieces_check"
  CHECK ("reservedQuantityPieces" <= "quantityPieces");

CREATE INDEX "InventoryBalance_locationId_productId_idx"
  ON "InventoryBalance" ("locationId", "productId");

CREATE INDEX "InventoryBalance_productId_locationId_quantityKg_reservedQuantityKg_idx"
  ON "InventoryBalance" ("productId", "locationId", "quantityKg", "reservedQuantityKg");

CREATE INDEX "InventoryBalance_productId_locationId_quantityPieces_reservedQuantityPieces_idx"
  ON "InventoryBalance" ("productId", "locationId", "quantityPieces", "reservedQuantityPieces");
