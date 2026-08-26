-- Additive CFDI issuer configuration. Existing LegalEntity rows remain
-- operationally valid and are intentionally not backfilled or rewritten.
ALTER TABLE "LegalEntity"
  ADD COLUMN "cfdiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultSeries" VARCHAR(10),
  ADD COLUMN "certificateSerialNumber" VARCHAR(64),
  ADD COLUMN "certificateFingerprint" VARCHAR(128),
  ADD COLUMN "certificateSubject" VARCHAR(255),
  ADD COLUMN "certificateValidFrom" TIMESTAMP(3),
  ADD COLUMN "certificateValidTo" TIMESTAMP(3);

ALTER TABLE "LegalEntity"
  ADD CONSTRAINT "LegalEntity_cfdi_configuration_check"
  CHECK (
    "cfdiEnabled" = false
    OR (
      "legalName" <> ''
      AND "taxId" ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$'
      AND "fiscalPostalCode" IS NOT NULL
      AND "fiscalPostalCode" ~ '^[0-9]{5}$'
      AND "fiscalRegime" IS NOT NULL
      AND "fiscalRegime" IN (
        '601', '603', '605', '606', '607', '608', '610', '611', '612',
        '614', '615', '616', '620', '621', '622', '623', '624', '625',
        '626'
      )
      AND "defaultSeries" IS NOT NULL
      AND "defaultSeries" ~ '^[A-Z0-9][A-Z0-9-]{0,9}$'
      AND NULLIF(BTRIM("certificateSerialNumber"), '') IS NOT NULL
      AND NULLIF(BTRIM("certificateFingerprint"), '') IS NOT NULL
      AND "certificateValidFrom" IS NOT NULL
      AND "certificateValidTo" IS NOT NULL
      AND "certificateValidFrom" < "certificateValidTo"
    )
  );
