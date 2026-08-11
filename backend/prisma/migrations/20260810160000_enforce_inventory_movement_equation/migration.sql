-- AUD-005: receipt variance is already preserved by BranchSupplyReceiptItem.
-- Historical receipt markers are retained as audit rows, but their quantities
-- are normalized to zero because they never changed the destination balance.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "InventoryMovement" movement
    WHERE movement."referenceType" = 'BRANCH_SUPPLY_RECEIPT'
      AND movement."type" IN ('SHRINKAGE', 'IN')
      AND movement."previousQuantityKg" IS NOT DISTINCT FROM movement."newQuantityKg"
      AND movement."previousQuantityPieces" IS NOT DISTINCT FROM movement."newQuantityPieces"
      AND (
        COALESCE(movement."quantityKg", 0) > 0
        OR COALESCE(movement."quantityPieces", 0) > 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "BranchSupplyReceiptItem" receipt_item
        WHERE receipt_item."receiptId" = movement."referenceId"
          AND receipt_item."productId" = movement."productId"
          AND (
            (
              movement."type" = 'SHRINKAGE'
              AND ABS(receipt_item."differenceKg" + COALESCE(movement."quantityKg", 0)) < 0.0005
              AND receipt_item."differencePieces" + COALESCE(movement."quantityPieces", 0) = 0
            )
            OR (
              movement."type" = 'IN'
              AND ABS(receipt_item."differenceKg" - COALESCE(movement."quantityKg", 0)) < 0.0005
              AND receipt_item."differencePieces" - COALESCE(movement."quantityPieces", 0) = 0
            )
          )
      )
  ) THEN
    RAISE EXCEPTION 'Receipt variance movement preflight failed: authoritative receipt item not found';
  END IF;
END $$;

UPDATE "InventoryMovement"
SET
  "quantity" = 0,
  "quantityKg" = 0,
  "quantityPieces" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "referenceType" = 'BRANCH_SUPPLY_RECEIPT'
  AND "type" IN ('SHRINKAGE', 'IN')
  AND "previousQuantityKg" IS NOT DISTINCT FROM "newQuantityKg"
  AND "previousQuantityPieces" IS NOT DISTINCT FROM "newQuantityPieces"
  AND (
    COALESCE("quantityKg", 0) > 0
    OR COALESCE("quantityPieces", 0) > 0
  );

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_positive_quantity_delta_check"
CHECK (
  "previousQuantityKg" IS NOT NULL
  AND "newQuantityKg" IS NOT NULL
  AND "previousQuantityPieces" IS NOT NULL
  AND "newQuantityPieces" IS NOT NULL
  AND (
    COALESCE("quantityKg", 0) = 0
    OR "newQuantityKg" <> "previousQuantityKg"
  )
  AND (
    COALESCE("quantityPieces", 0) = 0
    OR "newQuantityPieces" <> "previousQuantityPieces"
  )
  AND (
    CASE
      WHEN "type" IN ('OUT', 'SALE', 'CANCEL_PURCHASE', 'TRANSFER_OUT', 'SHRINKAGE')
        THEN "previousQuantityKg" - "newQuantityKg" = COALESCE("quantityKg", 0)
      ELSE "newQuantityKg" - "previousQuantityKg" = COALESCE("quantityKg", 0)
    END
  )
  AND (
    CASE
      WHEN "type" IN ('OUT', 'SALE', 'CANCEL_PURCHASE', 'TRANSFER_OUT', 'SHRINKAGE')
        THEN "previousQuantityPieces" - "newQuantityPieces" = COALESCE("quantityPieces", 0)
      ELSE "newQuantityPieces" - "previousQuantityPieces" = COALESCE("quantityPieces", 0)
    END
  )
) NOT VALID;

-- NOT VALID avoids rewriting or rejecting unrelated legacy rows that predate
-- dual KG/PIECE snapshots; PostgreSQL still enforces the equation on every new
-- or updated movement after this migration.
