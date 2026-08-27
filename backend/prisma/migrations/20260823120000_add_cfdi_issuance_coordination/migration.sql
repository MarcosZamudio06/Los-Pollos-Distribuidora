-- CFDI-08: durable folio assignment and globally unique STAMP idempotency.
CREATE TABLE "FiscalFolioSequence" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "cfdiType" "CfdiDocumentType" NOT NULL,
  "series" VARCHAR(10) NOT NULL,
  "nextValue" BIGINT NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalFolioSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalFolioSequence_legalEntityId_cfdiType_series_key"
  ON "FiscalFolioSequence"("legalEntityId", "cfdiType", "series");
CREATE INDEX "FiscalFolioSequence_legalEntityId_updatedAt_idx"
  ON "FiscalFolioSequence"("legalEntityId", "updatedAt");
ALTER TABLE "FiscalFolioSequence"
  ADD CONSTRAINT "FiscalFolioSequence_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalFolioSequence"
  ADD CONSTRAINT "FiscalFolioSequence_next_value_positive_check"
  CHECK ("nextValue" > 0);

DROP INDEX "FiscalOperationAttempt_idempotencyKey_idx";
CREATE UNIQUE INDEX "FiscalOperationAttempt_idempotencyKey_key"
  ON "FiscalOperationAttempt"("idempotencyKey");

ALTER TABLE "FiscalArtifact"
  ALTER COLUMN "byteSize" DROP NOT NULL,
  ALTER COLUMN "sha256" DROP NOT NULL;
ALTER TABLE "FiscalArtifact" DROP CONSTRAINT "FiscalArtifact_integrity_check";
ALTER TABLE "FiscalArtifact" ADD CONSTRAINT "FiscalArtifact_integrity_check"
  CHECK (
    "version" > 0
    AND ("byteSize" IS NULL OR "byteSize" >= 0)
    AND ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$')
    AND (
      "status" <> 'AVAILABLE'
      OR (
        "storedAt" IS NOT NULL
        AND "byteSize" IS NOT NULL
        AND "sha256" IS NOT NULL
      )
    )
  ) NOT VALID;
ALTER TABLE "FiscalArtifact" VALIDATE CONSTRAINT "FiscalArtifact_integrity_check";
