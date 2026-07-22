CREATE SEQUENCE "Sale_saleNumber_seq" START WITH 1 INCREMENT BY 1;

WITH existing_sale_numbers AS (
  SELECT MAX((SUBSTRING("saleNumber" FROM '^SALE-([0-9]+)$'))::BIGINT) AS value
  FROM "Sale"
  WHERE "saleNumber" ~ '^SALE-[0-9]+$'
)
SELECT setval(
  '"Sale_saleNumber_seq"'::regclass,
  COALESCE(value, 1),
  value IS NOT NULL
)
FROM existing_sale_numbers;
