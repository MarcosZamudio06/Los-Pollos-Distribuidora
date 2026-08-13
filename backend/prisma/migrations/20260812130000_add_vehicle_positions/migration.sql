CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE "VehiclePosition" (
  "id" TEXT NOT NULL,
  "clientEventId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "positionPoint" geometry(Point, 4326)
    GENERATED ALWAYS AS (
      ST_SetSRID(
        ST_MakePoint(
          "longitude"::double precision,
          "latitude"::double precision
        ),
        4326
      )::geometry(Point, 4326)
    ) STORED,
  "accuracyMeters" DECIMAL(8, 2),
  "speedKph" DECIMAL(8, 2),
  "headingDegrees" DECIMAL(6, 3),
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehiclePosition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehiclePosition_coordinates_check"
    CHECK (
      "latitude" BETWEEN -90 AND 90
      AND "longitude" BETWEEN -180 AND 180
    ),
  CONSTRAINT "VehiclePosition_metrics_check"
    CHECK (
      ("accuracyMeters" IS NULL OR "accuracyMeters" >= 0)
      AND ("speedKph" IS NULL OR "speedKph" >= 0)
      AND ("headingDegrees" IS NULL OR ("headingDegrees" >= 0 AND "headingDegrees" < 360))
    )
);

CREATE UNIQUE INDEX "VehiclePosition_clientEventId_key"
  ON "VehiclePosition"("clientEventId");
CREATE INDEX "VehiclePosition_vehicleId_recordedAt_idx"
  ON "VehiclePosition"("vehicleId", "recordedAt" DESC);
CREATE INDEX "VehiclePosition_routeId_recordedAt_idx"
  ON "VehiclePosition"("routeId", "recordedAt");
CREATE INDEX "VehiclePosition_driverId_recordedAt_idx"
  ON "VehiclePosition"("driverId", "recordedAt");
CREATE INDEX "VehiclePosition_positionPoint_idx"
  ON "VehiclePosition" USING GIST ("positionPoint");

ALTER TABLE "VehiclePosition"
  ADD CONSTRAINT "VehiclePosition_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VehiclePosition_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VehiclePosition_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
