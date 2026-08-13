CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "GeofenceEventType" AS ENUM ('ENTER', 'EXIT');

CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "originLocationId" TEXT NOT NULL,
  "geometry" JSONB NOT NULL,
  "zoneGeometry" geometry(Polygon, 4326) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeofenceEvent" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "type" "GeofenceEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeofenceEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleGeofenceState" (
  "vehicleId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "isInside" BOOLEAN NOT NULL,
  "lastPositionId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleGeofenceState_pkey" PRIMARY KEY ("vehicleId", "zoneId")
);

CREATE INDEX "DeliveryZone_originLocationId_isActive_idx"
  ON "DeliveryZone"("originLocationId", "isActive");
CREATE INDEX "DeliveryZone_zoneGeometry_gist_idx"
  ON "DeliveryZone" USING GIST ("zoneGeometry");

CREATE UNIQUE INDEX "GeofenceEvent_zoneId_positionId_type_key"
  ON "GeofenceEvent"("zoneId", "positionId", "type");
CREATE INDEX "GeofenceEvent_occurredAt_idx"
  ON "GeofenceEvent"("occurredAt");
CREATE INDEX "GeofenceEvent_vehicleId_occurredAt_idx"
  ON "GeofenceEvent"("vehicleId", "occurredAt");
CREATE INDEX "GeofenceEvent_zoneId_occurredAt_idx"
  ON "GeofenceEvent"("zoneId", "occurredAt");
CREATE INDEX "GeofenceEvent_routeId_occurredAt_idx"
  ON "GeofenceEvent"("routeId", "occurredAt");
CREATE INDEX "GeofenceEvent_positionId_idx"
  ON "GeofenceEvent"("positionId");
CREATE INDEX "VehicleGeofenceState_zoneId_isInside_idx"
  ON "VehicleGeofenceState"("zoneId", "isInside");

ALTER TABLE "DeliveryZone"
  ADD CONSTRAINT "DeliveryZone_originLocationId_fkey"
    FOREIGN KEY ("originLocationId") REFERENCES "OperationalLocation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryZone_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryZone_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GeofenceEvent"
  ADD CONSTRAINT "GeofenceEvent_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GeofenceEvent_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GeofenceEvent_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GeofenceEvent_positionId_fkey"
    FOREIGN KEY ("positionId") REFERENCES "VehiclePosition"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VehicleGeofenceState"
  ADD CONSTRAINT "VehicleGeofenceState_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleGeofenceState_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleGeofenceState_lastPositionId_fkey"
    FOREIGN KEY ("lastPositionId") REFERENCES "VehiclePosition"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
