ALTER TABLE "PointOfSaleDailyClose"
ADD COLUMN "cashCountedTotal" DECIMAL(14, 2);

ALTER TABLE "PointOfSaleDailyClose"
ALTER COLUMN "cashDifferenceTotal" DROP NOT NULL,
ALTER COLUMN "cashDifferenceTotal" DROP DEFAULT;
