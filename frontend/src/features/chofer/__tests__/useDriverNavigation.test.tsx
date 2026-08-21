// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDriverNavigation } from "../hooks/useDriverNavigation";
import type {
  DriverNavigationResponse,
  RouteLocationPosition,
} from "../../rutas-reparto/types";

const mockAuth = vi.hoisted(() => ({
  accessToken: "driver-token",
  user: { id: "driver-1", role: "DRIVER" },
}));
const navigationRequest = vi.hoisted(() => vi.fn());

vi.mock("../../auth", () => ({
  useAuth: () => mockAuth,
}));
vi.mock("../../rutas-reparto/deliveryService", () => ({
  deliveryService: {
    getRouteNavigation: navigationRequest,
  },
}));

const response: DriverNavigationResponse = {
  routeId: "route-1",
  target: {
    kind: "DELIVERY_ORDER",
    id: "order-1",
    label: "Centro",
    latitude: 19.17,
    longitude: -96.13,
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [-96.14, 19.18],
      [-96.13, 19.17],
    ],
  },
  distanceMeters: 860,
  durationSeconds: 180,
  steps: [],
};

const position: RouteLocationPosition = {
  accuracyMeters: 12,
  headingDegrees: 90,
  latitude: 19.18,
  longitude: -96.14,
  recordedAt: "2026-08-20T18:00:00.000Z",
  speedKph: 24,
};

function Harness({
  enabled,
  position: currentPosition,
}: {
  enabled: boolean;
  position: RouteLocationPosition | null;
}) {
  const result = useDriverNavigation({
    enabled,
    position: currentPosition,
    routeId: "route-1",
  });
  return <output data-navigation={result.data ? "ready" : "empty"} />;
}

function renderHarness(props: {
  enabled: boolean;
  position: RouteLocationPosition | null;
}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const render = (nextProps = props) =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness {...nextProps} />
      </QueryClientProvider>,
    );
  act(() => render());
  return { container, render, root };
}

describe("useDriverNavigation", () => {
  beforeEach(() => {
    navigationRequest.mockReset();
    navigationRequest.mockResolvedValue(response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("does not request navigation until a current GPS position exists", async () => {
    const harness = renderHarness({ enabled: true, position: null });
    await act(async () => undefined);
    expect(navigationRequest).not.toHaveBeenCalled();

    await act(async () => {
      harness.render({ enabled: true, position });
    });
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(1));
    expect(navigationRequest).toHaveBeenCalledWith(
      "route-1",
      {
        accuracyMeters: 12,
        headingDegrees: 90,
        latitude: 19.18,
        longitude: -96.14,
      },
      "driver-token",
    );
    expect(navigationRequest.mock.calls[0][1]).not.toHaveProperty("destination");

    await act(async () => harness.root.unmount());
  });

  it("does not request while navigation is disabled", async () => {
    const harness = renderHarness({ enabled: false, position });
    await act(async () => undefined);
    expect(navigationRequest).not.toHaveBeenCalled();
    await act(async () => harness.root.unmount());
  });

  it("keeps the last valid route visible while a new GPS calculation is pending", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    let resolveSecond: ((value: DriverNavigationResponse) => void) | undefined;
    navigationRequest
      .mockImplementationOnce(() => Promise.resolve(response))
      .mockImplementationOnce(
        () =>
          new Promise<DriverNavigationResponse>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const harness = renderHarness({ enabled: true, position });
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(harness.container.querySelector("output")?.dataset.navigation).toBe(
        "ready",
      ),
    );

    const nextPosition = {
      ...position,
      latitude: 19.1793,
      longitude: -96.1393,
      recordedAt: "2026-08-20T18:00:05.000Z",
    };
    nowSpy.mockReturnValue(6_000);
    await act(async () => {
      harness.render({ enabled: true, position: nextPosition });
    });
    expect(navigationRequest).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(14_000);
    await act(async () => {
      harness.render({
        enabled: true,
        position: {
          ...nextPosition,
          recordedAt: "2026-08-20T18:00:13.000Z",
        },
      });
    });
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(2));
    expect(harness.container.querySelector("output")?.dataset.navigation).toBe(
      "ready",
    );

    await act(async () => {
      resolveSecond?.(response);
    });
    await act(async () => harness.root.unmount());
  });
});
