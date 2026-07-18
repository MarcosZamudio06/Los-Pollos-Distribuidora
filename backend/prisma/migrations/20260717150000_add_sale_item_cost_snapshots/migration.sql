CREATE TYPE "CostSnapshotSource" AS ENUM ('SALE_CONFIRMATION', 'LEGACY_BACKFILL');

ALTER TABLE "SaleItem"
  ADD COLUMN "unitCostSnapshot" DECIMAL(14,2),
  ADD COLUMN "costSubtotalSnapshot" DECIMAL(14,2),
  ADD COLUMN "costSnapshotSource" "CostSnapshotSource";

UPDATE "SaleItem" AS item
SET
  "unitCostSnapshot" = product."purchaseCost",
  "costSubtotalSnapshot" = ROUND(product."purchaseCost" * item."quantitySnapshot", 2),
  "costSnapshotSource" = 'LEGACY_BACKFILL'
FROM "Product" AS product
WHERE product."id" = item."productId";

ALTER TABLE "SaleItem"
  ALTER COLUMN "unitCostSnapshot" SET NOT NULL,
  ALTER COLUMN "costSubtotalSnapshot" SET NOT NULL,
  ALTER COLUMN "costSnapshotSource" SET NOT NULL;
