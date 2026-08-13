// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFleetLive } from "../hooks";

const state = vi.hoisted(() => ({
  getLive: vi.fn(),
  subscribe: vi.fn(),
  handlers: null as {
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
      .mockResolvedValueOnce(snapshot(19.2));
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
    await act(async () => state.handlers?.onDisconnected?.());
    expect(container.querySelector("output")?.dataset.state).toBe(
      "disconnected",
    );
    expect(container.textContent).toContain("19.1");

    await act(async () => state.handlers?.onReconnecting?.());
    expect(container.querySelector("output")?.dataset.state).toBe(
      "reconnecting",
    );
    await act(async () => state.handlers?.onConnected?.());
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("19.2"));
    });

    expect(state.getLive).toHaveBeenCalledTimes(2);
  });
});
