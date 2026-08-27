-- Expand: SAT catalogs are versioned application data.  No rows are seeded in
-- this migration because production imports must be sourced, checked and
-- approved outside the database migration lifecycle.
CREATE TYPE "SatCatalogVersionStatus" AS ENUM (
  'STAGING',
  'VALIDATED',
  'ACTIVE',
  'RETIRED',
  'FAILED'
);

CREATE TABLE "SatCatalog" (
  "id" TEXT NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "activeVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SatCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatCatalogVersion" (
  "id" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "sourceVersion" VARCHAR(128) NOT NULL,
  "status" "SatCatalogVersionStatus" NOT NULL DEFAULT 'STAGING',
  "checksumSha256" VARCHAR(64) NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "stagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SatCatalogVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatCatalogEntry" (
  "id" TEXT NOT NULL,
  "catalogVersionId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "description" VARCHAR(512) NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SatCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- Validate shape, while keeping the supported catalog registry in the
-- application so a future SAT catalog can be added with a controlled release.
ALTER TABLE "SatCatalog"
  ADD CONSTRAINT "SatCatalog_key_check"
  CHECK (length(btrim("key")) > 0 AND length(btrim("name")) > 0) NOT VALID;
ALTER TABLE "SatCatalogVersion"
  ADD CONSTRAINT "SatCatalogVersion_integrity_check"
  CHECK (
    "checksumSha256" ~ '^[0-9a-f]{64}$'
    AND "rowCount" >= 0
    AND ("validatedAt" IS NULL OR "validatedAt" >= "stagedAt")
    AND ("activatedAt" IS NULL OR "activatedAt" >= "stagedAt")
    AND ("retiredAt" IS NULL OR "retiredAt" >= "stagedAt")
  ) NOT VALID;
ALTER TABLE "SatCatalogEntry"
  ADD CONSTRAINT "SatCatalogEntry_integrity_check"
  CHECK (
    length(btrim("code")) > 0
    AND length(btrim("description")) > 0
    AND ("validFrom" IS NULL OR "validTo" IS NULL OR "validFrom" <= "validTo")
  ) NOT VALID;

ALTER TABLE "SatCatalog" VALIDATE CONSTRAINT "SatCatalog_key_check";
ALTER TABLE "SatCatalogVersion" VALIDATE CONSTRAINT "SatCatalogVersion_integrity_check";
ALTER TABLE "SatCatalogEntry" VALIDATE CONSTRAINT "SatCatalogEntry_integrity_check";

CREATE UNIQUE INDEX "SatCatalog_key_key" ON "SatCatalog"("key");
CREATE UNIQUE INDEX "SatCatalog_activeVersionId_key" ON "SatCatalog"("activeVersionId");
CREATE INDEX "SatCatalog_activeVersionId_idx" ON "SatCatalog"("activeVersionId");
CREATE UNIQUE INDEX "SatCatalogVersion_catalogId_sourceVersion_key"
  ON "SatCatalogVersion"("catalogId", "sourceVersion");
CREATE INDEX "SatCatalogVersion_catalogId_status_activatedAt_idx"
  ON "SatCatalogVersion"("catalogId", "status", "activatedAt");
CREATE UNIQUE INDEX "SatCatalogEntry_catalogVersionId_code_key"
  ON "SatCatalogEntry"("catalogVersionId", "code");
CREATE INDEX "SatCatalogEntry_catalogVersionId_code_idx"
  ON "SatCatalogEntry"("catalogVersionId", "code");
CREATE INDEX "SatCatalogEntry_code_validFrom_validTo_idx"
  ON "SatCatalogEntry"("code", "validFrom", "validTo");

ALTER TABLE "SatCatalogVersion"
  ADD CONSTRAINT "SatCatalogVersion_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SatCatalog"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SatCatalogEntry"
  ADD CONSTRAINT "SatCatalogEntry_catalogVersionId_fkey"
  FOREIGN KEY ("catalogVersionId") REFERENCES "SatCatalogVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SatCatalog"
  ADD CONSTRAINT "SatCatalog_activeVersionId_fkey"
  FOREIGN KEY ("activeVersionId") REFERENCES "SatCatalogVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
