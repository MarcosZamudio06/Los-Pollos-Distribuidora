CREATE TYPE "DailyCloseDifferenceScope" AS ENUM ('CASH', 'SCALE', 'INVENTORY', 'SALES', 'EXPENSES', 'BILLING');

CREATE TYPE "DailyCloseDifferenceUnit" AS ENUM ('MXN', 'KG', 'PIECE');

CREATE TYPE "DailyCloseDifferenceType" AS ENUM ('SURPLUS', 'SHORTAGE');

CREATE TYPE "DailyCloseDifferenceStatus" AS ENUM ('PENDING_JUSTIFICATION', 'PENDING_AUTHORIZATION', 'AUTHORIZED');

ALTER TYPE "DailyCloseEventType" ADD VALUE 'DIFFERENCE_JUSTIFIED';
ALTER TYPE "DailyCloseEventType" ADD VALUE 'DIFFERENCE_AUTHORIZED';

CREATE TABLE "DailyCloseDifference" (
  "id" TEXT NOT NULL,
  "pointOfSaleDailyCloseId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "referenceKey" TEXT NOT NULL,
  "scope" "DailyCloseDifferenceScope" NOT NULL,
  "unit" "DailyCloseDifferenceUnit" NOT NULL,
  "expectedValue" DECIMAL(14,3) NOT NULL,
  "recordedValue" DECIMAL(14,3),
  "differenceValue" DECIMAL(14,3) NOT NULL,
  "differenceType" "DailyCloseDifferenceType" NOT NULL,
  "status" "DailyCloseDifferenceStatus" NOT NULL DEFAULT 'PENDING_JUSTIFICATION',
  "reason" TEXT,
  "evidence" TEXT,
  "productId" TEXT,
  "justifiedByUserId" TEXT,
  "justifiedAt" TIMESTAMP(3),
  "authorizedByUserId" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyCloseDifference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyCloseDifference_pointOfSaleDailyCloseId_fkey"
    FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseDifference_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseDifference_justifiedByUserId_fkey"
    FOREIGN KEY ("justifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseDifference_authorizedByUserId_fkey"
    FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyCloseDifference_pointOfSaleDailyCloseId_scope_referenceKey_key"
  ON "DailyCloseDifference"("pointOfSaleDailyCloseId", "scope", "referenceKey");
CREATE INDEX "DailyCloseDifference_pointOfSaleDailyCloseId_status_idx"
  ON "DailyCloseDifference"("pointOfSaleDailyCloseId", "status");
CREATE INDEX "DailyCloseDifference_productId_idx"
  ON "DailyCloseDifference"("productId");
