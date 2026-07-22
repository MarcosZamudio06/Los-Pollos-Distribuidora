ALTER TABLE "CommercialPolicy"
  ADD COLUMN "maximumDiscountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0;

CREATE TABLE "DiscountAuthorization" (
  "id" TEXT NOT NULL,
  "commercialPolicyId" TEXT NOT NULL,
  "authorizedForUserId" TEXT,
  "maximumPercentage" DECIMAL(5,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "authorizedByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountAuthorization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Sale"
  ADD COLUMN "discountAuthorizationId" TEXT,
  ADD COLUMN "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountEvidence" TEXT;

CREATE UNIQUE INDEX "Sale_discountAuthorizationId_key" ON "Sale"("discountAuthorizationId");
CREATE INDEX "DiscountAuthorization_commercialPolicyId_usedAt_idx" ON "DiscountAuthorization"("commercialPolicyId", "usedAt");
CREATE INDEX "DiscountAuthorization_authorizedForUserId_usedAt_idx" ON "DiscountAuthorization"("authorizedForUserId", "usedAt");

ALTER TABLE "DiscountAuthorization"
  ADD CONSTRAINT "DiscountAuthorization_commercialPolicyId_fkey" FOREIGN KEY ("commercialPolicyId") REFERENCES "CommercialPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiscountAuthorization_authorizedForUserId_fkey" FOREIGN KEY ("authorizedForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DiscountAuthorization_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_discountAuthorizationId_fkey" FOREIGN KEY ("discountAuthorizationId") REFERENCES "DiscountAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
