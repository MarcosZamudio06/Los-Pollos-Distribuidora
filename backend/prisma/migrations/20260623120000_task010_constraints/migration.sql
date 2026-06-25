-- TASK-010 remediation: database-level contracts for daily close and scale tickets.

ALTER TABLE "PointOfSaleDailyClose"
  ALTER COLUMN "businessDate" TYPE DATE USING "businessDate"::date;

ALTER TABLE "SaleDocument"
  ADD COLUMN IF NOT EXISTS "pointOfSaleDailyCloseId" TEXT;

ALTER TABLE "PointOfSaleDailyCloseLine"
  ADD COLUMN IF NOT EXISTS "operationalLocationId" TEXT;

ALTER TABLE "ScaleTicketReference"
  ADD COLUMN IF NOT EXISTS "capturedDate" DATE;

ALTER TABLE "ScaleTicketReference"
  ALTER COLUMN "capturedDate" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "point_of_sale_daily_close_non_cancelled_location_business_date_uq"
  ON "PointOfSaleDailyClose" ("operationalLocationId", "businessDate")
  WHERE "status" <> 'CANCELLED';

CREATE OR REPLACE FUNCTION validate_sale_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."locationId" <> close_location_id THEN
    RAISE EXCEPTION 'Sale location % does not match daily close location %', NEW."locationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_payment_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."operationalLocationId" <> close_location_id THEN
    RAISE EXCEPTION 'Payment location % does not match daily close location %', NEW."operationalLocationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_inventory_movement_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."locationId" <> close_location_id THEN
    RAISE EXCEPTION 'InventoryMovement location % does not match daily close location %', NEW."locationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_sale_document_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."operationalLocationId" <> close_location_id THEN
    RAISE EXCEPTION 'SaleDocument location % does not match daily close location %', NEW."operationalLocationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_cash_movement_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."operationalLocationId" <> close_location_id THEN
    RAISE EXCEPTION 'CashMovement location % does not match daily close location %', NEW."operationalLocationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_scale_ticket_reference_daily_close_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "operationalLocationId"
    INTO close_location_id
  FROM "PointOfSaleDailyClose"
  WHERE id = NEW."pointOfSaleDailyCloseId";

  IF close_location_id IS NULL THEN
    RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
  END IF;

  IF NEW."operationalLocationId" <> close_location_id THEN
    RAISE EXCEPTION 'ScaleTicketReference location % does not match daily close location %', NEW."operationalLocationId", close_location_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_point_of_sale_daily_close_line_location_match()
RETURNS TRIGGER AS $$
DECLARE
  close_location_id TEXT;
  sale_location_id TEXT;
  movement_location_id TEXT;
  ticket_location_id TEXT;
BEGIN
  IF NEW."pointOfSaleDailyCloseId" IS NOT NULL THEN
    SELECT "operationalLocationId"
      INTO close_location_id
    FROM "PointOfSaleDailyClose"
    WHERE id = NEW."pointOfSaleDailyCloseId";

    IF close_location_id IS NULL THEN
      RAISE EXCEPTION 'PointOfSaleDailyClose % does not exist', NEW."pointOfSaleDailyCloseId";
    END IF;

    IF NEW."operationalLocationId" <> close_location_id THEN
      RAISE EXCEPTION 'Daily close line location % does not match close location %', NEW."operationalLocationId", close_location_id;
    END IF;
  END IF;

  IF NEW."saleId" IS NOT NULL THEN
    SELECT "locationId"
      INTO sale_location_id
    FROM "Sale"
    WHERE id = NEW."saleId";

    IF sale_location_id IS NULL THEN
      RAISE EXCEPTION 'Sale % does not exist', NEW."saleId";
    END IF;

    IF NEW."operationalLocationId" <> sale_location_id THEN
      RAISE EXCEPTION 'Daily close line sale location % does not match line location %', sale_location_id, NEW."operationalLocationId";
    END IF;
  END IF;

  IF NEW."inventoryMovementId" IS NOT NULL THEN
    SELECT "locationId"
      INTO movement_location_id
    FROM "InventoryMovement"
    WHERE id = NEW."inventoryMovementId";

    IF movement_location_id IS NULL THEN
      RAISE EXCEPTION 'InventoryMovement % does not exist', NEW."inventoryMovementId";
    END IF;

    IF NEW."operationalLocationId" <> movement_location_id THEN
      RAISE EXCEPTION 'Daily close line inventory movement location % does not match line location %', movement_location_id, NEW."operationalLocationId";
    END IF;
  END IF;

  IF NEW."scaleTicketReferenceId" IS NOT NULL THEN
    SELECT "operationalLocationId"
      INTO ticket_location_id
    FROM "ScaleTicketReference"
    WHERE id = NEW."scaleTicketReferenceId";

    IF ticket_location_id IS NULL THEN
      RAISE EXCEPTION 'ScaleTicketReference % does not exist', NEW."scaleTicketReferenceId";
    END IF;

    IF NEW."operationalLocationId" <> ticket_location_id THEN
      RAISE EXCEPTION 'Daily close line scale ticket location % does not match line location %', ticket_location_id, NEW."operationalLocationId";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sale_daily_close_location_match" ON "Sale";
CREATE TRIGGER "trg_sale_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "locationId" ON "Sale"
FOR EACH ROW EXECUTE FUNCTION validate_sale_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_payment_daily_close_location_match" ON "Payment";
CREATE TRIGGER "trg_payment_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "operationalLocationId" ON "Payment"
FOR EACH ROW EXECUTE FUNCTION validate_payment_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_inventory_movement_daily_close_location_match" ON "InventoryMovement";
CREATE TRIGGER "trg_inventory_movement_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "locationId" ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_sale_document_daily_close_location_match" ON "SaleDocument";
CREATE TRIGGER "trg_sale_document_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "operationalLocationId" ON "SaleDocument"
FOR EACH ROW EXECUTE FUNCTION validate_sale_document_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_cash_movement_daily_close_location_match" ON "CashMovement";
CREATE TRIGGER "trg_cash_movement_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "operationalLocationId" ON "CashMovement"
FOR EACH ROW EXECUTE FUNCTION validate_cash_movement_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_scale_ticket_reference_daily_close_location_match" ON "ScaleTicketReference";
CREATE TRIGGER "trg_scale_ticket_reference_daily_close_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "operationalLocationId" ON "ScaleTicketReference"
FOR EACH ROW EXECUTE FUNCTION validate_scale_ticket_reference_daily_close_location_match();

DROP TRIGGER IF EXISTS "trg_point_of_sale_daily_close_line_location_match" ON "PointOfSaleDailyCloseLine";
CREATE TRIGGER "trg_point_of_sale_daily_close_line_location_match"
BEFORE INSERT OR UPDATE OF "pointOfSaleDailyCloseId", "operationalLocationId", "saleId", "inventoryMovementId", "scaleTicketReferenceId" ON "PointOfSaleDailyCloseLine"
FOR EACH ROW EXECUTE FUNCTION validate_point_of_sale_daily_close_line_location_match();
