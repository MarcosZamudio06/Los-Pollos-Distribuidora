CREATE TABLE "BranchSupplyReceipt" (
  "id" TEXT NOT NULL,
  "inventoryTransferId" TEXT NOT NULL,
  "branchSupplyCycleId" TEXT NOT NULL,
  "receivedByUserId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchSupplyReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyReceipt_inventoryTransferId_fkey"
    FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyReceipt_branchSupplyCycleId_fkey"
    FOREIGN KEY ("branchSupplyCycleId") REFERENCES "BranchSupplyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyReceipt_receivedByUserId_fkey"
    FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BranchSupplyReceiptItem" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "transferItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "unit" "ProductUnit" NOT NULL,
  "sentKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "sentPieces" INTEGER NOT NULL DEFAULT 0,
  "receivedKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "receivedPieces" INTEGER NOT NULL DEFAULT 0,
  "differenceKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "differencePieces" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSupplyReceiptItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchSupplyReceiptItem_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "BranchSupplyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyReceiptItem_transferItemId_fkey"
    FOREIGN KEY ("transferItemId") REFERENCES "InventoryTransferItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyReceiptItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchSupplyReceiptItem_non_negative_check" CHECK (
    "sentKg" >= 0 AND
    "sentPieces" >= 0 AND
    "receivedKg" >= 0 AND
    "receivedPieces" >= 0
  ),
  CONSTRAINT "BranchSupplyReceiptItem_difference_check" CHECK (
    "differenceKg" = "receivedKg" - "sentKg" AND
    "differencePieces" = "receivedPieces" - "sentPieces"
  )
);

CREATE UNIQUE INDEX "BranchSupplyReceipt_inventoryTransferId_key"
  ON "BranchSupplyReceipt" ("inventoryTransferId");
CREATE UNIQUE INDEX "BranchSupplyReceipt_idempotencyKey_key"
  ON "BranchSupplyReceipt" ("idempotencyKey");
CREATE INDEX "BranchSupplyReceipt_branchSupplyCycleId_receivedAt_idx"
  ON "BranchSupplyReceipt" ("branchSupplyCycleId", "receivedAt");
CREATE INDEX "BranchSupplyReceipt_receivedByUserId_receivedAt_idx"
  ON "BranchSupplyReceipt" ("receivedByUserId", "receivedAt");

CREATE UNIQUE INDEX "BranchSupplyReceiptItem_receiptId_transferItemId_key"
  ON "BranchSupplyReceiptItem" ("receiptId", "transferItemId");
CREATE INDEX "BranchSupplyReceiptItem_transferItemId_idx"
  ON "BranchSupplyReceiptItem" ("transferItemId");
CREATE INDEX "BranchSupplyReceiptItem_productId_createdAt_idx"
  ON "BranchSupplyReceiptItem" ("productId", "createdAt");

CREATE OR REPLACE FUNCTION validate_branch_supply_receipt_link()
RETURNS trigger AS $$
DECLARE
  linked_cycle_id TEXT;
  linked_role "BranchSupplyTransferRole";
  transfer_status "InventoryTransferStatus";
  cycle_status "BranchSupplyCycleStatus";
BEGIN
  SELECT "branchSupplyCycleId", "role"
    INTO linked_cycle_id, linked_role
  FROM "BranchSupplyCycleTransfer"
  WHERE "inventoryTransferId" = NEW."inventoryTransferId";

  IF NOT FOUND OR linked_role <> 'SUPPLY'::"BranchSupplyTransferRole" THEN
    RAISE EXCEPTION 'BranchSupplyReceipt requires a linked SUPPLY transfer';
  END IF;

  IF linked_cycle_id <> NEW."branchSupplyCycleId" THEN
    RAISE EXCEPTION 'BranchSupplyReceipt cycle does not match the linked transfer cycle';
  END IF;

  SELECT "status"
    INTO transfer_status
  FROM "InventoryTransfer"
  WHERE "id" = NEW."inventoryTransferId";

  IF transfer_status NOT IN ('REQUESTED'::"InventoryTransferStatus", 'IN_TRANSIT'::"InventoryTransferStatus") THEN
    RAISE EXCEPTION 'BranchSupplyReceipt requires a pending inventory transfer';
  END IF;

  SELECT "status"
    INTO cycle_status
  FROM "BranchSupplyCycle"
  WHERE "id" = NEW."branchSupplyCycleId";

  IF cycle_status IN ('CLOSED'::"BranchSupplyCycleStatus", 'CANCELLED'::"BranchSupplyCycleStatus") THEN
    RAISE EXCEPTION 'BranchSupplyReceipt requires a mutable cycle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_branch_supply_receipt_link"
BEFORE INSERT ON "BranchSupplyReceipt"
FOR EACH ROW EXECUTE FUNCTION validate_branch_supply_receipt_link();

CREATE OR REPLACE FUNCTION prevent_branch_supply_receipt_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyReceipt is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyReceipt_append_only_update"
BEFORE UPDATE ON "BranchSupplyReceipt"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_receipt_mutation();

CREATE TRIGGER "BranchSupplyReceipt_append_only_delete"
BEFORE DELETE ON "BranchSupplyReceipt"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_receipt_mutation();

CREATE OR REPLACE FUNCTION prevent_branch_supply_receipt_item_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BranchSupplyReceiptItem is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BranchSupplyReceiptItem_append_only_update"
BEFORE UPDATE ON "BranchSupplyReceiptItem"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_receipt_item_mutation();

CREATE TRIGGER "BranchSupplyReceiptItem_append_only_delete"
BEFORE DELETE ON "BranchSupplyReceiptItem"
FOR EACH ROW EXECUTE FUNCTION prevent_branch_supply_receipt_item_mutation();
