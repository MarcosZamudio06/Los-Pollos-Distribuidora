CREATE TABLE "DailyCloseInventoryCount" (
  "id" TEXT NOT NULL,
  "pointOfSaleDailyCloseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "physicalQuantityKg" DECIMAL(14, 3) NOT NULL DEFAULT 0,
  "physicalQuantityPieces" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "countedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyCloseInventoryCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyCloseInventoryCount_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseInventoryCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyCloseInventoryCount_countedByUserId_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyCloseInventoryCount_pointOfSaleDailyCloseId_productId_key"
  ON "DailyCloseInventoryCount"("pointOfSaleDailyCloseId", "productId");

CREATE INDEX "DailyCloseInventoryCount_productId_idx" ON "DailyCloseInventoryCount"("productId");
