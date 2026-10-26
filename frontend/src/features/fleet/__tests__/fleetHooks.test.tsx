// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFleetLive, fleetLiveQueryKey } from "../hooks";

const state = vi.hoisted(() => ({
  getLive: vi.fn(),
  subscribe: vi.fn(),
  handlers: null as {
    onPositionUpdated?: (
      position: import("../../../lib/fleetSocket").FleetPositionUpdated,
    ) => void;
    onRouteUpdated?: () => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onReconnecting?: () => void;
  } | null,
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({ accessToken: "access-token" }),
}));

vi.mock("../fleetService", () => ({
  fleetService: { getLive: state.getLive },
}));

vi.mock("../../../lib/fleetSocket", () => ({
  fleetSocket: { subscribe: state.subscribe },
}));

const snapshot = (latitude: number) => ({
  serverTime: "2026-08-12T16:00:00.000Z",
  items: [
    {
      vehicle: {
        id: "vehicle-1",
        code: "UNIDAD-01",
        displayName: "Unidad 1",
        plateNumber: null,
      },
      driver: { id: "driver-1", name: "Driver One" },
      route: {
        id: "route-1",
        name: "Ruta Centro",
        status: "IN_PROGRESS",
        scheduledDate: "2026-08-12T00:00:00.000Z",
        originLocationId: "origin-1",
        geometry: null,
      },
      position: {
        latitude,
        longitude: -96.1,
        accuracyMeters: 5,
        speedKph: 20,
        headingDegrees: 180,
        recordedAt: "2026-08-12T16:00:00.000Z",
      },
      stale: false,
      nextStop: null,
    },
  ],
});

function Probe() {
  const live = useFleetLive("origin-1");
  return (
    <output data-state={live.connectionState}>
      {live.data?.items[0]?.position?.latitude ?? "empty"}
    </output>
  );
}

describe("useFleetLive recovery", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.getLive.mockReset();
    state.subscribe.mockReset();
    state.handlers = null;
    state.getLive
      .mockResolvedValueOnce(snapshot(19.1))
      .mockResolvedValue(snapshot(19.2));
    state.subscribe.mockImplementation((_token, _origin, handlers) => {
      state.handlers = handlers;
      return vi.fn();
    });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  it("keeps the last REST snapshot while disconnected and reconciles once after reconnect", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("19.1"));
    });

    await act(async () => state.handlers?.onConnected?.());
    await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(2));
    await act(async () => state.handlers?.onDisconnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe(
      "disconnected",
    );
    expect(container.textContent).toContain("19.2");

    await act(async () => state.handlers?.onReconnecting?.());
    expect(container.querySelector("output")?.dataset.state).toBe(
      "reconnecting",
    );
    await act(async () => state.handlers?.onConnected?.());
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("19.2"));
    });

    expect(state.getLive).toHaveBeenCalledTimes(3);
  });
  it("reconciles an infinitely fresh cached snapshot on the first subscription after remount", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(fleetLiveQueryKey("origin-1"), snapshot(18));
    state.getLive.mockReset().mockResolvedValue(snapshot(19.2));
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    expect(container.textContent).toContain("18");
    await act(async () => state.handlers?.onConnected?.());
    await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(1));
  });
  it("does not lose a GPS delta when an older in-flight REST snapshot completes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(fleetLiveQueryKey("origin-1"), snapshot(19));
    let finish!: (value: ReturnType<typeof snapshot>) => void;
    state.getLive.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(async () => state.handlers?.onConnected?.());
    await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(1));
    await act(async () =>
      state.handlers?.onPositionUpdated?.({
        id: "gps-new",
        clientEventId: "gps-event",
        vehicleId: "vehicle-1",
        vehicleCode: "UNIDAD-01",
        routeId: "route-1",
        driverId: "driver-1",
        originLocationId: "origin-1",
        latitude: 19.9,
        longitude: -96.1,
        positionPoint: { type: "Point", coordinates: [-96.1, 19.9] },
        accuracyMeters: 5,
        speedKph: null,
        headingDegrees: null,
        recordedAt: "2026-08-12T16:00:02.000Z",
        receivedAt: "2026-08-12T16:00:02.000Z",
      }),
    );
    await act(async () => {
      finish(snapshot(19.1));
    });
    await vi.waitFor(() => expect(container.textContent).toBe("19.9"));
  });
  it("re-reads authority when a route change arrives during the initial snapshot with no cached data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let finish!: (value: ReturnType<typeof snapshot>) => void;
    state.getLive
      .mockReset()
      .mockResolvedValue(snapshot(19.2))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(async () => state.handlers?.onRouteUpdated?.());
    await act(async () => finish(snapshot(19.1)));
    await vi.waitFor(() => expect(container.textContent).toBe("19.2"));
    expect(state.getLive).toHaveBeenCalledTimes(2);
  });
});
