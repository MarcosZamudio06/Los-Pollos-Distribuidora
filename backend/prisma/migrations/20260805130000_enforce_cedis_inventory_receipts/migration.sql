CREATE OR REPLACE FUNCTION validate_external_purchase_receiver()
RETURNS trigger AS $$
DECLARE
  receiver_type "OperationalLocationType";
  receiver_active BOOLEAN;
BEGIN
  SELECT "type", "isActive"
    INTO receiver_type, receiver_active
  FROM "OperationalLocation"
  WHERE "id" = NEW."locationId";

  IF NOT FOUND OR NOT receiver_active
    OR receiver_type <> 'DISTRIBUTION_CENTER'::"OperationalLocationType" THEN
    RAISE EXCEPTION
      'External purchases must be received at an active DISTRIBUTION_CENTER';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_purchase_external_receiver"
BEFORE INSERT OR UPDATE OF "locationId"
ON "Purchase"
FOR EACH ROW EXECUTE FUNCTION validate_external_purchase_receiver();

CREATE OR REPLACE FUNCTION validate_branch_inventory_transfer_source()
RETURNS trigger AS $$
DECLARE
  origin_type "OperationalLocationType";
  destination_type "OperationalLocationType";
  destination_parent_id TEXT;
BEGIN
  SELECT "type"
    INTO origin_type
  FROM "OperationalLocation"
  WHERE "id" = NEW."originLocationId";

  SELECT "type", "parentId"
    INTO destination_type, destination_parent_id
  FROM "OperationalLocation"
  WHERE "id" = NEW."destinationLocationId";

  IF destination_type = 'BRANCH'::"OperationalLocationType"
    AND (
      origin_type <> 'DISTRIBUTION_CENTER'::"OperationalLocationType"
      OR destination_parent_id IS DISTINCT FROM NEW."originLocationId"
    ) THEN
    RAISE EXCEPTION
      'Branch inventory must originate from its parent DISTRIBUTION_CENTER';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_inventory_transfer_branch_source"
BEFORE INSERT OR UPDATE OF "originLocationId", "destinationLocationId"
ON "InventoryTransfer"
FOR EACH ROW EXECUTE FUNCTION validate_branch_inventory_transfer_source();

CREATE OR REPLACE FUNCTION validate_branch_supply_transfer_direction()
RETURNS trigger AS $$
DECLARE
  cycle_cedis_id TEXT;
  cycle_branch_id TEXT;
  transfer_origin_id TEXT;
  transfer_destination_id TEXT;
BEGIN
  SELECT "distributionCenterLocationId", "branchLocationId"
    INTO cycle_cedis_id, cycle_branch_id
  FROM "BranchSupplyCycle"
  WHERE "id" = NEW."branchSupplyCycleId";

  SELECT "originLocationId", "destinationLocationId"
    INTO transfer_origin_id, transfer_destination_id
  FROM "InventoryTransfer"
  WHERE "id" = NEW."inventoryTransferId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked inventory transfer does not exist';
  END IF;

  IF (NEW."role" = 'SUPPLY'::"BranchSupplyTransferRole"
      AND (
        transfer_origin_id <> cycle_cedis_id
        OR transfer_destination_id <> cycle_branch_id
      ))
    OR (NEW."role" = 'RETURN'::"BranchSupplyTransferRole"
      AND (
        transfer_origin_id <> cycle_branch_id
        OR transfer_destination_id <> cycle_cedis_id
      )) THEN
    RAISE EXCEPTION
      'Linked inventory transfer direction does not match branch supply role';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_branch_supply_transfer_direction"
BEFORE INSERT OR UPDATE OF "branchSupplyCycleId", "inventoryTransferId", "role"
ON "BranchSupplyCycleTransfer"
FOR EACH ROW EXECUTE FUNCTION validate_branch_supply_transfer_direction();
