DO $$
DECLARE
  invalid_balance_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO invalid_balance_count
  FROM "InventoryBalance"
  WHERE "quantityKg" < 0
     OR "quantityPieces" < 0;

  IF invalid_balance_count > 0 THEN
    RAISE EXCEPTION
      'InventoryBalance preflight found % rows with negative quantities',
      invalid_balance_count;
  END IF;
END $$;

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_quantityKg_non_negative_check"
  CHECK ("quantityKg" >= 0);

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_quantityPieces_non_negative_check"
  CHECK ("quantityPieces" >= 0);
