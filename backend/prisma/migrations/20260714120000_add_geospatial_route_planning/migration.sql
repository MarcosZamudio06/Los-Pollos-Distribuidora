CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "RouteOptimizationStatus" AS ENUM ('NOT_OPTIMIZED', 'OPTIMIZED');

ALTER TABLE "OperationalLocation"
  ADD COLUMN "latitude" DECIMAL(9, 6),
  ADD COLUMN "longitude" DECIMAL(9, 6),
  ADD COLUMN "locationPoint" geometry(Point, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
        ELSE ST_SetSRID(
          ST_MakePoint("longitude"::double precision, "latitude"::double precision),
          4326
        )::geometry(Point, 4326)
      END
    ) STORED;

ALTER TABLE "OperationalLocation"
  ADD CONSTRAINT "OperationalLocation_coordinates_pair_check"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "OperationalLocation_latitude_range_check"
    CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "OperationalLocation_longitude_range_check"
    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

CREATE INDEX "OperationalLocation_locationPoint_idx"
  ON "OperationalLocation" USING GIST ("locationPoint");

ALTER TABLE "DeliveryRoute"
  ADD COLUMN "optimizationStatus" "RouteOptimizationStatus" NOT NULL DEFAULT 'NOT_OPTIMIZED',
  ADD COLUMN "geometry" JSONB,
  ADD COLUMN "routeGeometry" geometry(LineString, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN "geometry" IS NULL THEN NULL
        ELSE ST_SetSRID(ST_GeomFromGeoJSON("geometry"::text), 4326)::geometry(LineString, 4326)
      END
    ) STORED,
  ADD COLUMN "distanceMeters" INTEGER,
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "optimizedAt" TIMESTAMP(3),
  ADD COLUMN "routingProfile" TEXT,
  ADD COLUMN "routingDataVersion" TEXT,
  ADD COLUMN "creationIdempotencyKey" TEXT,
  ADD COLUMN "creationPayloadHash" TEXT;

ALTER TABLE "DeliveryRoute"
  ADD CONSTRAINT "DeliveryRoute_metrics_check"
    CHECK (
      ("distanceMeters" IS NULL OR "distanceMeters" >= 0)
      AND ("durationSeconds" IS NULL OR "durationSeconds" >= 0)
    ),
  ADD CONSTRAINT "DeliveryRoute_optimized_payload_check"
    CHECK (
      "optimizationStatus" = 'NOT_OPTIMIZED'
      OR (
        "geometry" IS NOT NULL
        AND "distanceMeters" IS NOT NULL
        AND "durationSeconds" IS NOT NULL
        AND "optimizedAt" IS NOT NULL
        AND "routingProfile" IS NOT NULL
        AND "routingDataVersion" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "DeliveryRoute_idempotency_pair_check"
    CHECK (("creationIdempotencyKey" IS NULL) = ("creationPayloadHash" IS NULL));

CREATE UNIQUE INDEX "DeliveryRoute_creationIdempotencyKey_key"
  ON "DeliveryRoute"("creationIdempotencyKey");
CREATE INDEX "DeliveryRoute_routeGeometry_idx"
  ON "DeliveryRoute" USING GIST ("routeGeometry");

ALTER TABLE "DeliveryOrder"
  ADD COLUMN "latitude" DECIMAL(9, 6),
  ADD COLUMN "longitude" DECIMAL(9, 6),
  ADD COLUMN "locationPoint" geometry(Point, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
        ELSE ST_SetSRID(
          ST_MakePoint("longitude"::double precision, "latitude"::double precision),
          4326
        )::geometry(Point, 4326)
      END
    ) STORED,
  ADD COLUMN "geocoderOsmType" TEXT,
  ADD COLUMN "geocoderOsmId" TEXT,
  ADD COLUMN "stopSequence" INTEGER,
  ADD COLUMN "legDistanceMeters" INTEGER,
  ADD COLUMN "legDurationSeconds" INTEGER;

ALTER TABLE "DeliveryOrder"
  ADD CONSTRAINT "DeliveryOrder_coordinates_pair_check"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "DeliveryOrder_latitude_range_check"
    CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "DeliveryOrder_longitude_range_check"
    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "DeliveryOrder_sequence_check"
    CHECK ("stopSequence" IS NULL OR "stopSequence" > 0),
  ADD CONSTRAINT "DeliveryOrder_leg_metrics_check"
    CHECK (
      ("legDistanceMeters" IS NULL OR "legDistanceMeters" >= 0)
      AND ("legDurationSeconds" IS NULL OR "legDurationSeconds" >= 0)
    );

CREATE UNIQUE INDEX "DeliveryOrder_routeId_stopSequence_key"
  ON "DeliveryOrder"("routeId", "stopSequence");
CREATE INDEX "DeliveryOrder_locationPoint_idx"
  ON "DeliveryOrder" USING GIST ("locationPoint");

CREATE TABLE "DeliveryRoutePlanDraft" (
  "id" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "sourceRouteId" TEXT,
  "consumedByRouteId" TEXT,
  "driverId" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "originLocationId" TEXT NOT NULL,
  "orderedStops" JSONB NOT NULL,
  "geometry" JSONB NOT NULL,
  "distanceMeters" INTEGER NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "routingProfile" TEXT NOT NULL,
  "routingDataVersion" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryRoutePlanDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRoutePlanDraft_metrics_check"
    CHECK ("distanceMeters" >= 0 AND "durationSeconds" >= 0),
  CONSTRAINT "DeliveryRoutePlanDraft_consumption_check"
    CHECK (("consumedAt" IS NULL) = ("consumedByRouteId" IS NULL)),
  CONSTRAINT "DeliveryRoutePlanDraft_expiration_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "DeliveryRoutePlanDraft_consumedByRouteId_key"
  ON "DeliveryRoutePlanDraft"("consumedByRouteId");
CREATE INDEX "DeliveryRoutePlanDraft_active_lookup_idx"
  ON "DeliveryRoutePlanDraft"("createdByUserId", "expiresAt", "consumedAt");
CREATE INDEX "DeliveryRoutePlanDraft_sourceRouteId_idx"
  ON "DeliveryRoutePlanDraft"("sourceRouteId");
CREATE INDEX "DeliveryRoutePlanDraft_driverId_scheduledDate_idx"
  ON "DeliveryRoutePlanDraft"("driverId", "scheduledDate");

ALTER TABLE "DeliveryRoutePlanDraft"
  ADD CONSTRAINT "DeliveryRoutePlanDraft_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryRoutePlanDraft_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryRoutePlanDraft_sourceRouteId_fkey"
    FOREIGN KEY ("sourceRouteId") REFERENCES "DeliveryRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryRoutePlanDraft_consumedByRouteId_fkey"
    FOREIGN KEY ("consumedByRouteId") REFERENCES "DeliveryRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryRoutePlanDraft_originLocationId_fkey"
    FOREIGN KEY ("originLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
