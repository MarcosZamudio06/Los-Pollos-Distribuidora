DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CommercialPolicy"
    WHERE "overdueBlockingMode" IS NOT NULL
      AND "overdueBlockingMode" NOT IN ('BLOCK', 'BLOCK_NEW_CREDIT', 'WARN_ONLY')
  ) THEN
    RAISE EXCEPTION 'Cannot migrate CommercialPolicy.overdueBlockingMode: unknown value present';
  END IF;
END $$;

UPDATE "CommercialPolicy"
SET "overdueBlockingMode" = 'BLOCK_NEW_CREDIT'
WHERE "overdueBlockingMode" IN ('BLOCK', 'BLOCK_NEW_CREDIT');

CREATE TYPE "OverdueBlockingMode" AS ENUM ('WARN_ONLY', 'BLOCK_NEW_CREDIT');

ALTER TABLE "CommercialPolicy"
ALTER COLUMN "overdueBlockingMode" TYPE "OverdueBlockingMode"
USING "overdueBlockingMode"::"OverdueBlockingMode";

ALTER TABLE "Sale"
ADD COLUMN "creditDecisionSnapshot" JSONB,
ADD COLUMN "creditDecisionEvaluatedAt" TIMESTAMP(3);
