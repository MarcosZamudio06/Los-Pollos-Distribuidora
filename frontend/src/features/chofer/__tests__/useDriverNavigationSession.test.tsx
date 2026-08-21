// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDriverNavigationSession } from "../hooks/useDriverNavigationSession";
import type {
  DriverNavigationResponse,
  DriverNavigationTarget,
  RouteLocationPosition,
} from "../../rutas-reparto/types";

const navigationRequest = vi.hoisted(() => vi.fn());

vi.mock("../../auth", () => ({
  useAuth: () => ({ accessToken: "driver-token" }),
}));
vi.mock("../../rutas-reparto/deliveryService", () => ({
  deliveryService: { getRouteNavigation: navigationRequest },
}));

const targetOne: DriverNavigationTarget = {
  kind: "DELIVERY_ORDER",
  id: "order-1",
  label: "Cliente Uno",
  latitude: 19.17,
  longitude: -96.13,
};
const targetTwo: DriverNavigationTarget = {
  kind: "DELIVERY_ORDER",
  id: "order-2",
  label: "Cliente Dos",
  latitude: 19.16,
  longitude: -96.12,
};
const initialPosition: RouteLocationPosition = {
  accuracyMeters: 12,
  headingDegrees: 90,
  latitude: 19.18,
  longitude: -96.14,
  recordedAt: "2026-08-20T18:00:00.000Z",
  speedKph: 24,
};
const clock = { now: 1_000 };
const now = () => clock.now;

function response(target: DriverNavigationTarget): DriverNavigationResponse {
  return {
    routeId: "route-1",
    target,
    geometry: {
      type: "LineString",
      coordinates: [
        [-96.14, 19.18],
        [target.longitude, target.latitude],
      ],
    },
    distanceMeters: 850,
    durationSeconds: 240,
    steps: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type HarnessProps = {
  enabled?: boolean;
  position?: RouteLocationPosition | null;
  target?: DriverNavigationTarget | null;
};

function Harness({
  enabled = true,
  position = initialPosition,
  target = targetOne,
}: HarnessProps) {
  const session = useDriverNavigationSession({
    enabled,
    now,
    position,
    routeId: "route-1",
    target,
  });
  return (
    <div>
      <output
        data-error={String(session.isError)}
        data-follow={String(session.follow)}
        data-has-geometry={String(Boolean(session.geometry))}
        data-recalculating={String(session.isRecalculating)}
        data-target={session.target?.id ?? ""}
        data-view={session.viewMode}
      />
      <button onClick={session.suspendFollow} type="button">free</button>
      <button onClick={session.showOverview} type="button">overview</button>
      <button onClick={session.recenter} type="button">recenter</button>
    </div>
  );
}

function renderHarness(props: HarnessProps = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (nextProps: HarnessProps = props) =>
    root.render(<Harness {...nextProps} />);
  act(() => render());
  return { container, render, root };
}

function output(container: HTMLElement) {
  return container.querySelector("output") as HTMLOutputElement;
}

describe("useDriverNavigationSession", () => {
  beforeEach(() => {
    clock.now = 1_000;
    navigationRequest.mockReset();
    navigationRequest.mockResolvedValue(response(targetOne));
  });

  afterEach(async () => {
    document.body.replaceChildren();
  });

  it("ignores a stale response after the active target changes", async () => {
    const first = deferred<DriverNavigationResponse>();
    const second = deferred<DriverNavigationResponse>();
    navigationRequest
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const harness = renderHarness();
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(1));

    await act(async () => {
      harness.render({ target: targetTwo });
    });
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(2));
    expect(output(harness.container).dataset.target).toBe("order-2");
    expect(output(harness.container).dataset.hasGeometry).toBe("false");

    await act(async () => second.resolve(response(targetTwo)));
    await vi.waitFor(() =>
      expect(output(harness.container).dataset.target).toBe("order-2"),
    );
    await act(async () => first.resolve(response(targetOne)));
    expect(output(harness.container).dataset.target).toBe("order-2");

    expect(navigationRequest.mock.calls[1][1]).not.toHaveProperty("destination");
    await act(async () => harness.root.unmount());
  });

  it("keeps the previous route when a movement recalculation fails", async () => {
    const harness = renderHarness();
    await vi.waitFor(() =>
      expect(output(harness.container).dataset.target).toBe("order-1"),
    );
    navigationRequest.mockRejectedValueOnce(new Error("network unavailable"));
    clock.now = 14_000;

    await act(async () => {
      harness.render({
        position: {
          ...initialPosition,
          longitude: -96.139,
          recordedAt: "2026-08-20T18:00:13.000Z",
        },
      });
    });
    await vi.waitFor(() => expect(navigationRequest).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(output(harness.container).dataset.error).toBe("true"),
    );
    expect(output(harness.container).dataset.target).toBe("order-1");

    await act(async () => harness.root.unmount());
  });

  it("moves between follow, free and overview modes deterministically", async () => {
    const harness = renderHarness({ enabled: false });
    const buttons = harness.container.querySelectorAll("button");
    expect(output(harness.container).dataset.follow).toBe("true");

    act(() => buttons[0].click());
    expect(output(harness.container).dataset.follow).toBe("false");
    expect(output(harness.container).dataset.view).toBe("free");

    act(() => buttons[1].click());
    expect(output(harness.container).dataset.view).toBe("overview");

    act(() => buttons[2].click());
    expect(output(harness.container).dataset.follow).toBe("true");
    expect(output(harness.container).dataset.view).toBe("follow");

    await act(async () => harness.root.unmount());
  });
});
