import { describe, expect, it } from "vitest";
import {
  NAVIGATION_OFF_ROUTE_CONFIRMATIONS,
  distancePointToPolylineMeters,
  evaluateNavigationRecalculation,
  isNearNavigationDestination,
} from "../navigationSessionPolicy";
import type { GeoJsonLineString, RouteLocationPosition } from "../../rutas-reparto/types";

const geometry: GeoJsonLineString = {
  type: "LineString",
  coordinates: [
    [-96.14, 19.18],
    [-96.13, 19.18],
  ],
};

function position(
  latitude: number,
  longitude: number,
  accuracyMeters = 12,
  recordedAt = new Date().toISOString(),
): RouteLocationPosition {
  return {
    accuracyMeters,
    headingDegrees: 90,
    latitude,
    longitude,
    recordedAt,
    speedKph: 24,
  };
}

describe("navigation session policy", () => {
  it("accepts arrival only with a fresh, precise position inside the destination radius", () => {
    const destination = { latitude: 19.18, longitude: -96.14 };

    expect(
      isNearNavigationDestination(
        position(destination.latitude, destination.longitude),
        destination,
      ),
    ).toBe(true);
    expect(
      isNearNavigationDestination(
        position(destination.latitude, destination.longitude, 100.01),
        destination,
      ),
    ).toBe(false);
    expect(
      isNearNavigationDestination(
        position(
          destination.latitude,
          destination.longitude,
          12,
          new Date(Date.now() - 60_001).toISOString(),
        ),
        destination,
      ),
    ).toBe(false);
    expect(
      isNearNavigationDestination(position(19.19, -96.14), destination),
    ).toBe(false);
  });

  it("calculates point-to-polyline distance without an external geometry library", () => {
    expect(
      distancePointToPolylineMeters(
        { latitude: 19.18, longitude: -96.135 },
        geometry,
      ),
    ).toBeLessThan(1);
    expect(
      distancePointToPolylineMeters(
        { latitude: 19.181, longitude: -96.135 },
        geometry,
      ),
    ).toBeGreaterThan(105);
    expect(
      distancePointToPolylineMeters(
        { latitude: 19.181, longitude: -96.135 },
        geometry,
      ),
    ).toBeLessThan(118);
  });

  it("respects cooldown even after significant movement", () => {
    const decision = evaluateNavigationRecalculation({
      geometry,
      lastRequestAtMs: 10_000,
      lastRequestPosition: position(19.18, -96.14),
      nowMs: 15_000,
      offRouteReadingCount: 0,
      position: position(19.18, -96.139),
    });

    expect(decision.movementMeters).toBeGreaterThan(90);
    expect(decision.reason).toBeNull();
  });

  it("recalculates after cooldown and significant movement", () => {
    const decision = evaluateNavigationRecalculation({
      geometry,
      lastRequestAtMs: 1_000,
      lastRequestPosition: position(19.18, -96.14),
      nowMs: 14_000,
      offRouteReadingCount: 0,
      position: position(19.18, -96.139),
    });

    expect(decision.reason).toBe("movement");
  });

  it("uses hysteresis before treating GPS as off-route", () => {
    const first = evaluateNavigationRecalculation({
      geometry,
      lastRequestAtMs: 1_000,
      lastRequestPosition: position(19.18, -96.14),
      nowMs: 14_000,
      offRouteReadingCount: 0,
      position: position(19.182, -96.135),
    });
    expect(first.nextOffRouteReadingCount).toBe(1);
    expect(first.isOffRoute).toBe(false);
    expect(first.reason).toBeNull();

    const second = evaluateNavigationRecalculation({
      geometry,
      lastRequestAtMs: 1_000,
      lastRequestPosition: position(19.18, -96.14),
      nowMs: 15_000,
      offRouteReadingCount: first.nextOffRouteReadingCount,
      position: position(19.1821, -96.135),
    });
    expect(second.nextOffRouteReadingCount).toBe(
      NAVIGATION_OFF_ROUTE_CONFIRMATIONS,
    );
    expect(second.isOffRoute).toBe(true);
    expect(second.reason).toBe("off-route");
  });

  it("does not accumulate off-route evidence from noisy low-accuracy readings", () => {
    const decision = evaluateNavigationRecalculation({
      geometry,
      lastRequestAtMs: 1_000,
      lastRequestPosition: position(19.18, -96.14),
      nowMs: 20_000,
      offRouteReadingCount: 1,
      position: position(19.184, -96.135, 180),
    });

    expect(decision.nextOffRouteReadingCount).toBe(0);
    expect(decision.isOffRoute).toBe(false);
    expect(decision.reason).toBeNull();
  });
});
