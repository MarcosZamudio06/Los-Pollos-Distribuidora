-- Repair deployments where the original daily-close uniqueness migration was recorded
-- without the partial index being present.
CREATE UNIQUE INDEX IF NOT EXISTS "point_of_sale_daily_close_non_cancelled_location_business_date_uq"
  ON "PointOfSaleDailyClose" ("operationalLocationId", "businessDate")
  WHERE "status" <> 'CANCELLED';
