import type { DeliveryZone, FleetCoordinate, FleetPolygon } from "./types";

function samePoint(first: FleetCoordinate, second: FleetCoordinate) {
  return first[0] === second[0] && first[1] === second[1];
}

export function uniqueZoneVertexCount(points: FleetCoordinate[]) {
  return new Set(points.map(([longitude, latitude]) => `${longitude},${latitude}`))
    .size;
}

export function isEditableZonePolygon(points: FleetCoordinate[]) {
  return (
    points.length >= 3 &&
    uniqueZoneVertexCount(points) >= 3 &&
    points.every(
      ([longitude, latitude]) =>
        Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90,
    )
  );
}

export function closeZonePolygon(
  points: FleetCoordinate[],
): FleetPolygon | null {
  if (!isEditableZonePolygon(points)) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const ring = samePoint(first, last) ? points : [...points, first];
  return { type: "Polygon", coordinates: [ring] };
}

export function zonePointsFromGeometry(zone: DeliveryZone): FleetCoordinate[] {
  const ring = zone.geometry.coordinates[0] ?? [];
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }
  return ring.slice();
}
