CREATE TYPE "DeliveryIncidentType" AS ENUM (
  'DELIVERY_DELAY',
  'DELIVERY_FAILURE',
  'VEHICLE_BREAKDOWN',
  'SAFETY',
  'GEOFENCE_EXCEPTION',
  'OTHER'
);

CREATE TYPE "DeliveryIncidentStatus" AS ENUM (
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'CANCELLED'
);

CREATE TABLE "DeliveryIncident" (
  "id" TEXT NOT NULL,
  "type" "DeliveryIncidentType" NOT NULL,
  "status" "DeliveryIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "routeId" TEXT,
  "deliveryOrderId" TEXT,
  "vehicleId" TEXT,
  "driverId" TEXT,
  "positionId" TEXT,
  "statusSnapshot" "DeliveryOrderStatus" NOT NULL,
  "latitude" DECIMAL(9, 6),
  "longitude" DECIMAL(9, 6),
  "zoneId" TEXT,
  "returnedItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "resolution" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedByUserId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryIncident_context_check"
    CHECK ("routeId" IS NOT NULL OR "deliveryOrderId" IS NOT NULL),
  CONSTRAINT "DeliveryIncident_coordinates_check"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL)
      OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    )
);

CREATE INDEX "DeliveryIncident_routeId_occurredAt_idx"
  ON "DeliveryIncident"("routeId", "occurredAt");
CREATE INDEX "DeliveryIncident_deliveryOrderId_occurredAt_idx"
  ON "DeliveryIncident"("deliveryOrderId", "occurredAt");
CREATE INDEX "DeliveryIncident_vehicleId_occurredAt_idx"
  ON "DeliveryIncident"("vehicleId", "occurredAt");
CREATE INDEX "DeliveryIncident_driverId_occurredAt_idx"
  ON "DeliveryIncident"("driverId", "occurredAt");
CREATE INDEX "DeliveryIncident_status_occurredAt_idx"
  ON "DeliveryIncident"("status", "occurredAt");

ALTER TABLE "DeliveryIncident"
  ADD CONSTRAINT "DeliveryIncident_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_deliveryOrderId_fkey"
    FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_positionId_fkey"
    FOREIGN KEY ("positionId") REFERENCES "VehiclePosition"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_reportedByUserId_fkey"
    FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryIncident_resolvedByUserId_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
