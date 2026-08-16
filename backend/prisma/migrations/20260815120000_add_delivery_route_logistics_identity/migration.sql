CREATE TYPE "DeliveryRouteType" AS ENUM (
  'SALE_DELIVERY',
  'BRANCH_RETURN',
  'CEDIS_SUPPLY'
);

ALTER TABLE "DeliveryRoute"
  ADD COLUMN "type" "DeliveryRouteType" NOT NULL DEFAULT 'SALE_DELIVERY',
  ADD COLUMN "inventoryTransferId" TEXT;

CREATE INDEX "DeliveryRoute_type_scheduledDate_status_idx"
  ON "DeliveryRoute"("type", "scheduledDate", "status");

CREATE UNIQUE INDEX "DeliveryRoute_inventoryTransferId_key"
  ON "DeliveryRoute"("inventoryTransferId");

-- Historical routes default to SALE_DELIVERY and may keep vehicleId=NULL.
-- Logistics routes must carry both the assigned fleet unit and the transfer
-- that gives the operation its canonical origin and destination locations.
ALTER TABLE "DeliveryRoute"
  ADD CONSTRAINT "DeliveryRoute_logistics_vehicle_required_check"
    CHECK (
      "type" = 'SALE_DELIVERY'
      OR "vehicleId" IS NOT NULL
    ),
  ADD CONSTRAINT "DeliveryRoute_logistics_transfer_required_check"
    CHECK (
      "type" = 'SALE_DELIVERY'
      OR "inventoryTransferId" IS NOT NULL
    );

ALTER TABLE "DeliveryRoute"
  ADD CONSTRAINT "DeliveryRoute_inventoryTransferId_fkey"
    FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
