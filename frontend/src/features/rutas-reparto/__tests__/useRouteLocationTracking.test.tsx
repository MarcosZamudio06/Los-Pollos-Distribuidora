// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../../lib/api";
import {
  TRACKING_GEOLOCATION_OPTIONS,
  type RouteLocationTrackingResult,
  type RouteLocationTrackingRoute,
  useRouteLocationTracking,
} from "../useRouteLocationTracking";

const mockState = vi.hoisted(() => ({
  accessToken: "driver-token" as string | null,
  clearWatch: vi.fn(),
  publishFleetPosition: vi.fn(),
  user: { id: "driver-1", role: "DRIVER" },
  watchPosition: vi.fn(),
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({
    accessToken: mockState.accessToken,
    user: mockState.user,
  }),
}));

vi.mock("../deliveryService", () => ({
  deliveryService: {
    publishFleetPosition: mockState.publishFleetPosition,
  },
}));

type GeolocationCallbacks = {
  error: PositionErrorCallback;
  success: PositionCallback;
};

const route = (
  overrides: Partial<RouteLocationTrackingRoute> = {},
): RouteLocationTrackingRoute => ({
  driverId: "driver-1",
  id: "route-1",
  status: "IN_PROGRESS",
  vehicleId: "vehicle-1",
  ...overrides,
});

function makePosition(
  overrides: Partial<GeolocationCoordinates> & { timestamp?: number } = {},
): GeolocationPosition {
  const {
    accuracy = 10,
    heading = 180,
    latitude = 19.1738,
    longitude = -96.1342,
    speed = 10,
    timestamp = 1_700_000_000_000,
  } = overrides;

  return {
    coords: {
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      latitude,
      longitude,
      speed,
      toJSON: () => ({}),
    },
    timestamp,
    toJSON: () => ({}),
  };
}

let callbacks: GeolocationCallbacks;
let generatedEventId = 0;
let latest: RouteLocationTrackingResult | null = null;

function Harness({
  currentRoute,
  onReady,
}: {
  currentRoute: RouteLocationTrackingRoute;
  onReady: (value: RouteLocationTrackingResult) => void;
}) {
  const tracking = useRouteLocationTracking({ route: currentRoute });
  useEffect(() => {
    onReady(tracking);
  }, [onReady, tracking]);
  return null;
}

async function renderTracking(
  currentRoute: RouteLocationTrackingRoute,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Harness currentRoute={currentRoute} onReady={(value) => (latest = value)} />,
    );
  });
  return { container, root };
}

async function rerender(root: Root, currentRoute: RouteLocationTrackingRoute) {
  await act(async () => {
    root.render(
      <Harness currentRoute={currentRoute} onReady={(value) => (latest = value)} />,
    );
  });
}

async function sendPosition(position: GeolocationPosition) {
  await act(async () => {
    callbacks.success(position);
    await Promise.resolve();
  });
}

describe("useRouteLocationTracking", () => {
  beforeEach(() => {
    latest = null;
    generatedEventId = 0;
    mockState.accessToken = "driver-token";
    mockState.publishFleetPosition.mockReset();
    mockState.publishFleetPosition.mockResolvedValue({
      id: "position-1",
      receivedAt: "2026-08-12T16:00:01.000Z",
      recordedAt: "2026-08-12T16:00:00.000Z",
      routeId: "route-1",
      vehicleId: "vehicle-1",
    });
    mockState.watchPosition.mockReset();
    mockState.clearWatch.mockReset();
    callbacks = {
      error: vi.fn(),
      success: vi.fn(),
    };
    mockState.watchPosition.mockImplementation(
      (success: PositionCallback, error: PositionErrorCallback) => {
        callbacks = { error, success };
        return 17;
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch: mockState.clearWatch,
        watchPosition: mockState.watchPosition,
      },
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `event-${++generatedEventId}`),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("does not track a pending route", async () => {
    const { root } = await renderTracking(route({ status: "PENDING" }));

    expect(latest?.isEligible).toBe(false);
    await act(async () => latest?.start());
    expect(mockState.watchPosition).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it.each([
    ["a route assigned to another driver", { driverId: "driver-2" }],
    ["a route without a vehicle", { vehicleId: null }],
  ])("does not track %s", async (_label, overrides) => {
    const { root } = await renderTracking(route(overrides));

    expect(latest?.isEligible).toBe(false);
    await act(async () => latest?.start());
    expect(mockState.watchPosition).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("starts only after the driver action and requests high-accuracy GPS", async () => {
    const { root } = await renderTracking(route());

    expect(latest?.status).toBe("stopped");
    await act(async () => latest?.start());

    expect(mockState.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockState.watchPosition.mock.calls[0][2]).toEqual(
      TRACKING_GEOLOCATION_OPTIONS,
    );
    expect(latest?.status).toBe("requesting_permission");

    await sendPosition(makePosition());
    expect(latest?.status).toBe("active");
    expect(latest?.isTracking).toBe(true);

    await act(async () => root.unmount());
  });

  it("publishes the browser reading without client-controlled route, driver, or vehicle ids", async () => {
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());
    await sendPosition(
      makePosition({
        heading: Number.NaN,
        speed: 10,
        timestamp: 1_700_000_000_123,
      }),
    );

    expect(mockState.publishFleetPosition).toHaveBeenCalledWith(
      {
        accuracyMeters: 10,
        clientEventId: "event-1",
        latitude: 19.1738,
        longitude: -96.1342,
        recordedAt: "2023-11-14T22:13:20.123Z",
        speedKph: 36,
      },
      "driver-token",
    );
    expect(mockState.publishFleetPosition.mock.calls[0][0]).not.toHaveProperty(
      "routeId",
    );
    expect(mockState.publishFleetPosition.mock.calls[0][0]).not.toHaveProperty(
      "driverId",
    );
    expect(mockState.publishFleetPosition.mock.calls[0][0]).not.toHaveProperty(
      "vehicleId",
    );

    await act(async () => root.unmount());
  });

  it("changes clientEventId and throttles unchanged readings while allowing 25m movement", async () => {
    vi.useFakeTimers();
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());

    await sendPosition(makePosition({ timestamp: 1_700_000_000_000 }));
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    await sendPosition(
      makePosition({
        timestamp: 1_700_000_005_000,
      }),
    );
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(1);

    await sendPosition(
      makePosition({
        latitude: 19.1741,
        timestamp: 1_700_000_006_000,
      }),
    );
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(2);
    expect(
      mockState.publishFleetPosition.mock.calls[0][0].clientEventId,
    ).not.toBe(mockState.publishFleetPosition.mock.calls[1][0].clientEventId);

    await act(async () => root.unmount());
  });

  it("clears the watch when the route completes and on unmount", async () => {
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());

    await rerender(root, route({ status: "COMPLETED" }));
    expect(mockState.clearWatch).toHaveBeenCalledWith(17);

    await rerender(root, route());
    await act(async () => latest?.start());
    await act(async () => root.unmount());
    expect(mockState.clearWatch).toHaveBeenCalledTimes(2);
  });

  it("shows permission denied and stops tracking", async () => {
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());

    await act(async () => {
      callbacks.error({ code: 1, message: "denied" } as GeolocationPositionError);
    });

    expect(latest?.status).toBe("permission_denied");
    expect(latest?.isTracking).toBe(false);
    expect(mockState.clearWatch).toHaveBeenCalledWith(17);

    await act(async () => root.unmount());
  });

  it("stops tracking when the backend rejects an active route with 409", async () => {
    mockState.publishFleetPosition.mockRejectedValueOnce(
      new ApiClientError("route changed", 409, null),
    );
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());
    await sendPosition(makePosition());

    expect(latest?.status).toBe("sync_error");
    expect(latest?.isTracking).toBe(false);
    expect(mockState.clearWatch).toHaveBeenCalledWith(17);

    await act(async () => root.unmount());
  });

  it("retries a temporary network error a bounded number of times", async () => {
    vi.useFakeTimers();
    mockState.publishFleetPosition
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        id: "position-1",
        recordedAt: "2023-11-14T22:13:20.000Z",
      });
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());
    await sendPosition(makePosition());
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(3);
    expect(latest?.status).toBe("active");

    await act(async () => root.unmount());
  });

  it("cleans a pending retry on unmount", async () => {
    vi.useFakeTimers();
    mockState.publishFleetPosition.mockRejectedValueOnce(new Error("offline"));
    const { root } = await renderTracking(route());
    await act(async () => latest?.start());
    await sendPosition(makePosition());

    await act(async () => root.unmount());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mockState.publishFleetPosition).toHaveBeenCalledTimes(1);
  });
});
