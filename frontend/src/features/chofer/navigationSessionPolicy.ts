import type {
  GeoJsonLineString,
  RouteLocationPosition,
} from "../rutas-reparto/types";

export const NAVIGATION_RECALCULATION_COOLDOWN_MS = 12_000;
export const NAVIGATION_MOVEMENT_THRESHOLD_METERS = 75;
export const NAVIGATION_OFF_ROUTE_THRESHOLD_METERS = 90;
export const NAVIGATION_OFF_ROUTE_CONFIRMATIONS = 2;
export const NAVIGATION_MAX_ARRIVAL_ACCURACY_METERS = 100;
export const NAVIGATION_MAX_ARRIVAL_DISTANCE_METERS = 150;
export const NAVIGATION_MAX_ARRIVAL_POSITION_AGE_MS = 60_000;
export const NAVIGATION_MAX_RECALC_ACCURACY_METERS =
  NAVIGATION_MAX_ARRIVAL_ACCURACY_METERS;

const EARTH_RADIUS_METERS = 6_371_000;

type Coordinate = {
  latitude: number;
  longitude: number;
};

export type NavigationRecalculationReason =
  | "initial"
  | "movement"
  | "off-route";

export type NavigationRecalculationDecision = {
  distanceFromRouteMeters: number | null;
  isOffRoute: boolean;
  movementMeters: number;
  nextOffRouteReadingCount: number;
  reason: NavigationRecalculationReason | null;
};

type NavigationRecalculationInput = {
  geometry?: GeoJsonLineString | null;
  lastRequestAtMs: number | null;
  lastRequestPosition: RouteLocationPosition | null;
  nowMs: number;
  offRouteReadingCount: number;
  position: RouteLocationPosition;
};

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function isValidCoordinate(point: Coordinate) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function isValidNavigationPosition(position: RouteLocationPosition) {
  return (
    isValidCoordinate(position) &&
    Number.isFinite(position.accuracyMeters) &&
    position.accuracyMeters >= 0
  );
}

export function distanceBetweenNavigationPointsMeters(
  first: Coordinate,
  second: Coordinate,
) {
  if (!isValidCoordinate(first) || !isValidCoordinate(second)) {
    return Number.POSITIVE_INFINITY;
  }
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function isNearNavigationDestination(
  position: RouteLocationPosition | null | undefined,
  destination:
    | { latitude?: number | null; longitude?: number | null }
    | null
    | undefined,
) {
  if (
    !position ||
    !destination ||
    destination.latitude == null ||
    destination.longitude == null
  ) {
    return false;
  }

  const recordedAtMs = Date.parse(position.recordedAt);
  const positionAgeMs = Date.now() - recordedAtMs;
  return Boolean(
    isValidNavigationPosition(position) &&
      position.accuracyMeters <= NAVIGATION_MAX_ARRIVAL_ACCURACY_METERS &&
      Number.isFinite(positionAgeMs) &&
      positionAgeMs >= 0 &&
      positionAgeMs <= NAVIGATION_MAX_ARRIVAL_POSITION_AGE_MS &&
      distanceBetweenNavigationPointsMeters(position, {
        latitude: destination.latitude,
        longitude: destination.longitude,
      }) <= NAVIGATION_MAX_ARRIVAL_DISTANCE_METERS,
  );
}

function distancePointToSegmentMeters(
  point: Coordinate,
  start: [number, number],
  end: [number, number],
) {
  const latitudeScale = EARTH_RADIUS_METERS;
  const longitudeScale =
    EARTH_RADIUS_METERS * Math.cos(toRadians(point.latitude));
  const startX = toRadians(start[0] - point.longitude) * longitudeScale;
  const startY = toRadians(start[1] - point.latitude) * latitudeScale;
  const endX = toRadians(end[0] - point.longitude) * longitudeScale;
  const endY = toRadians(end[1] - point.latitude) * latitudeScale;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  if (segmentLengthSquared === 0) return Math.hypot(startX, startY);
  const projection = Math.min(
    1,
    Math.max(
      0,
      -(startX * segmentX + startY * segmentY) / segmentLengthSquared,
    ),
  );
  return Math.hypot(
    startX + projection * segmentX,
    startY + projection * segmentY,
  );
}

export function distancePointToPolylineMeters(
  point: Coordinate,
  geometry: GeoJsonLineString,
) {
  if (!isValidCoordinate(point) || geometry.coordinates.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (geometry.coordinates.length === 1) {
    const [longitude, latitude] = geometry.coordinates[0];
    return distanceBetweenNavigationPointsMeters(point, {
      latitude,
      longitude,
    });
  }
  let shortestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const start = geometry.coordinates[index - 1];
    const end = geometry.coordinates[index];
    if (
      !start.every(Number.isFinite) ||
      !end.every(Number.isFinite)
    ) {
      continue;
    }
    shortestDistance = Math.min(
      shortestDistance,
      distancePointToSegmentMeters(point, start, end),
    );
  }
  return shortestDistance;
}

export function evaluateNavigationRecalculation({
  geometry,
  lastRequestAtMs,
  lastRequestPosition,
  nowMs,
  offRouteReadingCount,
  position,
}: NavigationRecalculationInput): NavigationRecalculationDecision {
  const movementMeters = lastRequestPosition
    ? distanceBetweenNavigationPointsMeters(lastRequestPosition, position)
    : 0;
  if (
    !isValidNavigationPosition(position) ||
    position.accuracyMeters > NAVIGATION_MAX_RECALC_ACCURACY_METERS
  ) {
    return {
      distanceFromRouteMeters: null,
      isOffRoute: false,
      movementMeters,
      nextOffRouteReadingCount: 0,
      reason: null,
    };
  }

  const distanceFromRouteMeters = geometry
    ? distancePointToPolylineMeters(position, geometry)
    : null;
  const effectiveOffRouteThreshold = Math.max(
    NAVIGATION_OFF_ROUTE_THRESHOLD_METERS,
    position.accuracyMeters * 1.5,
  );
  const offRouteCandidate = Boolean(
    distanceFromRouteMeters != null &&
      Number.isFinite(distanceFromRouteMeters) &&
      distanceFromRouteMeters > effectiveOffRouteThreshold,
  );
  const nextOffRouteReadingCount = offRouteCandidate
    ? Math.min(
        offRouteReadingCount + 1,
        NAVIGATION_OFF_ROUTE_CONFIRMATIONS,
      )
    : 0;
  const isOffRoute =
    nextOffRouteReadingCount >= NAVIGATION_OFF_ROUTE_CONFIRMATIONS;

  if (lastRequestAtMs == null || !lastRequestPosition) {
    return {
      distanceFromRouteMeters,
      isOffRoute,
      movementMeters,
      nextOffRouteReadingCount,
      reason: "initial",
    };
  }

  const cooldownElapsed =
    nowMs - lastRequestAtMs >= NAVIGATION_RECALCULATION_COOLDOWN_MS;
  let reason: NavigationRecalculationReason | null = null;
  if (cooldownElapsed && isOffRoute) {
    reason = "off-route";
  } else if (
    cooldownElapsed &&
    !offRouteCandidate &&
    movementMeters >= NAVIGATION_MOVEMENT_THRESHOLD_METERS
  ) {
    reason = "movement";
  }

  return {
    distanceFromRouteMeters,
    isOffRoute,
    movementMeters,
    nextOffRouteReadingCount,
    reason,
  };
}
