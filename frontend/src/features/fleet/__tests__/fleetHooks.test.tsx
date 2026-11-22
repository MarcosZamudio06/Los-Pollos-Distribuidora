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
    onIncidentCreated?: (
      incident: import("../../../lib/fleetSocket").FleetIncidentCreated,
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

function Probe({ origin = "origin-1" }: { origin?: string }) {
  const live = useFleetLive(origin);
  return (
    <output data-state={live.connectionState}>
      {live.data?.items[0]?.position?.latitude ?? "empty"}
      {live.data?.items
        .flatMap((item) => item.incidents ?? [])
        .map((item) => item.reason)
        .join(",")}
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

  it("does not reuse connected status while the next origin handshake is pending", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    root = createRoot(container);
    const render = (origin: string) =>
      act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe origin={origin} />
          </QueryClientProvider>,
        );
      });
    await render("origin-1");
    await act(async () => state.handlers?.onConnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe("connected");
    await render("origin-1");
    expect(container.querySelector("output")?.dataset.state).toBe("connected");
    const previous = state.handlers;
    await render("origin-2");
    expect(container.querySelector("output")?.dataset.state).toBe("connecting");
    // A queued callback from a disposed subscription must not authenticate its successor.
    await act(async () => previous?.onConnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe("connecting");
    await act(async () => state.handlers?.onConnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe("connected");
    await render("origin-1");
    expect(container.querySelector("output")?.dataset.state).toBe("connecting");
  });

  it("ignores queued events from a disposed origin subscription", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    root = createRoot(container);
    const render = (origin: string) =>
      act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe origin={origin} />
          </QueryClientProvider>,
        );
      });
    await render("origin-1");
    const previous = state.handlers;
    await render("origin-2");
    const reads = state.getLive.mock.calls.length;
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => previous?.onRouteUpdated?.());
    expect(invalidate).not.toHaveBeenCalled();
    expect(state.getLive).toHaveBeenCalledTimes(reads);
    await act(async () => previous?.onDisconnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe("connecting");
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
  const incident = {
    incidentId: "incident-1",
    deliveryOrderId: "order-1",
    routeId: "route-1",
    vehicleId: "vehicle-1",
    driverId: "driver-1",
    status: "OPEN" as const,
    reason: "Persisted incident",
    occurredAt: "2026-08-12T16:00:03.000Z",
    position: null,
    stop: null,
  };
  const withIncident = () => ({
    ...snapshot(19.2),
    items: snapshot(19.2).items.map((item) => ({
      ...item,
      incidents: [incident],
      incidentCountActive: 1,
      route: { ...item.route, incidentCountActive: 1 },
    })),
  });
  const client = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  async function mount(queryClient: QueryClient) {
    root = createRoot(container);
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
  }
  const cached = (queryClient: QueryClient) =>
    queryClient.getQueryData<import("../types").FleetLiveSnapshot>(
      fleetLiveQueryKey("origin-1"),
    );

  it("reconciles a persisted incident after the snapshot and deduplicates repeated events", async () => {
    const queryClient = client();
    state.getLive
      .mockReset()
      .mockResolvedValueOnce(snapshot(19.1))
      .mockResolvedValue(withIncident());
    await mount(queryClient);
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toBe("19.1"));
    });
    await act(async () => {
      state.handlers?.onIncidentCreated?.(incident);
      state.handlers?.onIncidentCreated?.(incident);
    });
    await act(async () => {
      await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(2));
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain(incident.reason),
      );
    });
    expect(cached(queryClient)?.items[0].incidents).toHaveLength(1);
    expect(cached(queryClient)?.items[0].incidentCountActive).toBe(1);
  });

  it("recovers an incident whose route is missing from the current snapshot", async () => {
    const queryClient = client();
    queryClient.setQueryData(fleetLiveQueryKey("origin-1"), {
      serverTime: "before",
      items: [],
    });
    state.getLive.mockReset().mockResolvedValue(withIncident());
    await mount(queryClient);
    await act(async () => state.handlers?.onIncidentCreated?.(incident));
    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain(incident.reason),
      );
    });
    expect(state.getLive).toHaveBeenCalledTimes(1);
    expect(cached(queryClient)?.items[0].incidents).toHaveLength(1);
  });

  it.each([false, true])(
    "does not let an older in-flight snapshot erase an incident (cached=%s)",
    async (hasCache) => {
      const queryClient = client();
      if (hasCache)
        queryClient.setQueryData(fleetLiveQueryKey("origin-1"), snapshot(19.1));
      let finish!: (value: ReturnType<typeof snapshot>) => void;
      state.getLive
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue(withIncident());
      await mount(queryClient);
      if (hasCache) await act(async () => state.handlers?.onRouteUpdated?.());
      await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(1));
      await act(async () => state.handlers?.onIncidentCreated?.(incident));
      await act(async () => {
        await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(2));
      });
      await act(async () => finish(snapshot(19.1)));
      await act(async () => {
        await vi.waitFor(() =>
          expect(container.textContent).toContain(incident.reason),
        );
      });
      expect(cached(queryClient)?.items[0].incidents).toHaveLength(1);
    },
  );

  it("recovers a missed persisted incident after reconnect and remount", async () => {
    const queryClient = client();
    state.getLive
      .mockReset()
      .mockResolvedValueOnce(snapshot(19.1))
      .mockResolvedValue(withIncident());
    await mount(queryClient);
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toBe("19.1"));
    });
    await act(async () => state.handlers?.onDisconnected?.());
    // No incident delta is delivered while disconnected; REST remains authority.
    await act(async () => state.handlers?.onConnected?.());
    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain(incident.reason),
      );
    });
    await act(async () => root.unmount());
    await mount(queryClient);
    await act(async () => state.handlers?.onConnected?.());
    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain(incident.reason),
      );
    });
    expect(cached(queryClient)?.items[0].incidents).toHaveLength(1);
    expect(state.getLive).toHaveBeenCalledTimes(3);
  });

  it("reconciles only the subscribed query and never invents a route from an incident hint", async () => {
    const queryClient = client();
    const other = {
      ...snapshot(18),
      items: snapshot(18).items.map((item) => ({
        ...item,
        route: { ...item.route, id: "other-route" },
      })),
    };
    queryClient.setQueryData(fleetLiveQueryKey("origin-2"), other);
    queryClient.setQueryData(fleetLiveQueryKey("origin-1"), {
      serverTime: "before",
      items: [],
    });
    state.getLive
      .mockReset()
      .mockResolvedValue({ serverTime: "authorized", items: [] });
    await mount(queryClient);
    await act(async () => state.handlers?.onIncidentCreated?.(incident));
    await act(async () => {
      await vi.waitFor(() => expect(state.getLive).toHaveBeenCalledTimes(1));
    });
    expect(cached(queryClient)?.items).toEqual([]);
    expect(queryClient.getQueryData(fleetLiveQueryKey("origin-2"))).toBe(other);
    expect(container.textContent).not.toContain(incident.reason);
  });
});
