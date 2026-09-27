DO $barcode_uniqueness_preflight$
DECLARE
  collision_details TEXT;
BEGIN
  SELECT string_agg(
    format('%L => [%s]', normalized_barcode, products),
    '; ' ORDER BY normalized_barcode
  )
  INTO collision_details
  FROM (
    SELECT
      LOWER(BTRIM("barcode")) AS normalized_barcode,
      string_agg(
        format(
          'id=%s, sku=%s, barcode=%L',
          "id",
          COALESCE("sku", '<none>'),
          "barcode"
        ),
        '; ' ORDER BY "id"
      ) AS products
    FROM "Product"
    WHERE "barcode" IS NOT NULL
      AND BTRIM("barcode") <> ''
    GROUP BY LOWER(BTRIM("barcode"))
    HAVING COUNT(*) > 1
  ) AS collisions;

  IF collision_details IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce normalized Product.barcode uniqueness: case/whitespace collisions exist: %. Resolve these products explicitly, then rerun this migration. No Product rows were changed.',
      collision_details;
  END IF;
END;
$barcode_uniqueness_preflight$;

CREATE UNIQUE INDEX "Product_barcode_lower_key"
  ON "Product" (LOWER(BTRIM("barcode")))
  WHERE "barcode" IS NOT NULL
    AND BTRIM("barcode") <> '';

DROP INDEX IF EXISTS "Product_barcode_key";
