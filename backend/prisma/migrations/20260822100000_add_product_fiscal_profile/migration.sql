ALTER TABLE "Product"
  ADD COLUMN "satProductServiceCode" VARCHAR(8),
  ADD COLUMN "satUnitCode" VARCHAR(3),
  ADD COLUMN "taxObjectCode" VARCHAR(2),
  ADD COLUMN "defaultTaxCode" VARCHAR(3),
  ADD COLUMN "defaultFactorType" VARCHAR(8),
  ADD COLUMN "defaultRateOrQuota" DECIMAL(14,6);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_satProductServiceCode_format_check"
    CHECK ("satProductServiceCode" IS NULL OR "satProductServiceCode" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "Product_satUnitCode_format_check"
    CHECK ("satUnitCode" IS NULL OR "satUnitCode" ~ '^[A-Z0-9]{2,3}$'),
  ADD CONSTRAINT "Product_taxObjectCode_catalog_check"
    CHECK ("taxObjectCode" IS NULL OR "taxObjectCode" IN ('01','02','03','04','05','06','07','08')),
  ADD CONSTRAINT "Product_defaultTaxCode_catalog_check"
    CHECK ("defaultTaxCode" IS NULL OR "defaultTaxCode" IN ('001','002','003')),
  ADD CONSTRAINT "Product_defaultFactorType_catalog_check"
    CHECK ("defaultFactorType" IS NULL OR "defaultFactorType" IN ('Tasa','Cuota','Exento')),
  ADD CONSTRAINT "Product_defaultRateOrQuota_non_negative_check"
    CHECK ("defaultRateOrQuota" IS NULL OR "defaultRateOrQuota" >= 0);

