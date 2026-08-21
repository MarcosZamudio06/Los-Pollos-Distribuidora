// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockSourceLike = {
  data: unknown;
  setData: (data: unknown) => void;
};
type MockMapLike = {
  container?: HTMLElement;
  fitBoundsCalls: Array<{ bounds: unknown; options: unknown }>;
  layers: string[];
  options: { scrollZoom?: boolean };
  removed: boolean;
  scrollZoom: { disable: () => void; enable: () => void };
  sources: globalThis.Map<string, MockSourceLike>;
  emit: (event: string) => void;
};
type MockMarkerLike = {
  element: HTMLElement;
  removed: boolean;
};

const mapMock = vi.hoisted(() => {
  const state = {
    instances: [] as MockMapLike[],
    markers: [] as MockMarkerLike[],
  };

  class MockSource {
    data: unknown;

    constructor(data: unknown) {
      this.data = data;
    }

    setData(data: unknown) {
      this.data = data;
    }
  }

  class MockMap {
    container?: HTMLElement;
    handlers = new globalThis.Map<string, Set<() => void>>();
    layers: string[] = [];
    options: { container?: HTMLElement; scrollZoom?: boolean };
    fitBoundsCalls: Array<{ bounds: unknown; options: unknown }> = [];
    removed = false;
    scrollZoom = {
      disable: () => undefined,
      enable: () => undefined,
    };
    sources = new globalThis.Map<string, MockSource>();

    constructor(options: { container?: HTMLElement; scrollZoom?: boolean }) {
      this.options = options;
      this.container = options.container;
      state.instances.push(this as unknown as MockMapLike);
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? new Set();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    off(event: string, handler: () => void) {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string) {
      this.handlers.get(event)?.forEach((handler) => handler());
    }

    addSource(id: string, source: { data: unknown }) {
      this.sources.set(id, new MockSource(source.data));
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    addLayer(layer: { id: string }) {
      this.layers.push(layer.id);
    }

    fitBounds(bounds: unknown, options: unknown) {
      this.fitBoundsCalls.push({ bounds, options });
      return this;
    }

    addControl() {
      return this;
    }

    remove() {
      this.removed = true;
    }
  }

  class MockMarker {
    element: HTMLElement;
    removed = false;

    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
      state.markers.push(this as unknown as MockMarkerLike);
    }

    setLngLat() {
      return this;
    }

    addTo(map: MockMap) {
      map.container?.append(this.element);
      return this;
    }

    remove() {
      this.removed = true;
      this.element.remove();
    }
  }

  return {
    AttributionControl: class {},
    Map: MockMap,
    Marker: MockMarker,
    setWorkerUrl: vi.fn(),
    state,
  };
});

const { state: mapState } = mapMock;

vi.mock("maplibre-gl", () => mapMock);

import { DriverRouteMap } from "../components/DriverRouteMap";

const geometry = {
  type: "LineString" as const,
  coordinates: [
    [-96.14, 19.18],
    [-96.13, 19.17],
    [-96.12, 19.16],
  ] as [number, number][],
};

async function renderMap(
  overrides: Partial<React.ComponentProps<typeof DriverRouteMap>> = {},
): Promise<{ container: HTMLElement; map: MockMapLike; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DriverRouteMap geometry={geometry} routeName="Ruta Norte" {...overrides} />,
    );
  });
  await vi.waitFor(() => expect(mapState.instances).toHaveLength(1));
  const map = mapState.instances[0];
  await act(async () => map.emit("load"));
  return { container, map, root };
}

describe("DriverRouteMap", () => {
  beforeEach(() => {
    mapState.instances.length = 0;
    mapState.markers.length = 0;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a compact current-order map without wheel zoom", async () => {
    const { container, map, root } = await renderMap({
      compact: true,
      currentOrder: {
        latitude: 19.17,
        longitude: -96.13,
        stopSequence: 2,
      },
    });

    expect(container.querySelector(".h-64")).not.toBeNull();
    expect(map.options.scrollZoom).toBe(false);
    expect(
      container
        .querySelector('[data-marker-kind="current"]')
        ?.getAttribute("aria-label"),
    ).toBe("Pedido actual · Parada 2");

    await act(async () => root.unmount());
  });

  it("uses the persisted geometry directly, fits it, and draws every marker", async () => {
    const { container, map, root } = await renderMap({
      currentOrder: {
        id: "order-1",
        latitude: 19.17,
        longitude: -96.13,
        stopSequence: 2,
      },
      orders: [
        {
          id: "order-1",
          latitude: 19.17,
          longitude: -96.13,
          stopSequence: 2,
        },
        {
          id: "order-3",
          latitude: 19.16,
          longitude: -96.12,
          stopSequence: 3,
        },
      ],
    });

    expect(map.layers).toEqual(["driver-route-line"]);
    expect(map.sources.get("driver-route")?.data).toBe(geometry);
    expect(map.fitBoundsCalls).toHaveLength(1);
    expect(map.fitBoundsCalls[0].bounds).toEqual([
      [-96.14, 19.16],
      [-96.12, 19.18],
    ]);
    expect(container.querySelectorAll("[data-marker]")).toHaveLength(3);
    expect(
      container
        .querySelector('[data-marker-kind="origin"]')
        ?.getAttribute("aria-label"),
    ).toBe("Origen y regreso");
    expect(container.querySelector('[data-marker-kind="order"]')?.textContent).toBe(
      "3",
    );
    expect(container.querySelectorAll('[data-marker-kind="current"]')).toHaveLength(
      1,
    );

    await act(async () => root.unmount());
  });

  it("keeps wheel zoom enabled for the full-size map", async () => {
    const { map, root } = await renderMap();

    expect(map.options.scrollZoom).toBe(true);

    await act(async () => root.unmount());
  });

  it("shows the last published GPS location without changing the route geometry", async () => {
    const { container, map, root } = await renderMap({
      currentLocation: {
        accuracyMeters: 18,
        headingDegrees: 185,
        latitude: 19.175,
        longitude: -96.135,
        recordedAt: "2026-08-12T16:00:00.000Z",
        speedKph: 32.2,
      },
    });

    expect(container.querySelector('[data-marker-kind="location"]')).not.toBeNull();
    expect(
      container
        .querySelector('[data-marker-kind="location"]')
        ?.getAttribute("aria-label"),
    ).toBe("Última ubicación GPS publicada");
    expect(map.sources.get("driver-route")?.data).toBe(geometry);

    await act(async () => root.unmount());
  });

  it("renders dynamic navigation geometry as a separate overlay", async () => {
    const navigationGeometry = {
      type: "LineString" as const,
      coordinates: [
        [-96.15, 19.19],
        [-96.145, 19.185],
      ] as [number, number][],
    };
    const { map, root } = await renderMap({ navigationGeometry });

    expect(map.layers).toEqual([
      "driver-route-line",
      "driver-navigation-route-line",
    ]);
    expect(map.sources.get("driver-route")?.data).toBe(geometry);
    expect(map.sources.get("driver-navigation-route")?.data).toBe(
      navigationGeometry,
    );
    expect(map.fitBoundsCalls[0].bounds).toEqual([
      [-96.15, 19.16],
      [-96.12, 19.19],
    ]);

    await act(async () => root.unmount());
  });

  it("renders logistics endpoints from canonical location coordinates without persisted geometry", async () => {
    const { container, map, root } = await renderMap({
      geometry: undefined,
      originLocation: {
        id: "branch-1",
        name: "Sucursal Centro",
        latitude: 19.2,
        longitude: -96.2,
      },
      destinationLocation: {
        id: "cedis-1",
        name: "CEDIS Principal",
        latitude: 19.1,
        longitude: -96.1,
      },
    });

    expect(map.layers).toEqual([]);
    expect(map.fitBoundsCalls[0].bounds).toEqual([
      [-96.2, 19.1],
      [-96.1, 19.2],
    ]);
    expect(
      container
        .querySelector('[data-marker-kind="origin"]')
        ?.getAttribute("aria-label"),
    ).toBe("Partida: Sucursal Centro");
    expect(
      container
        .querySelector('[data-marker-kind="destination"]')
        ?.getAttribute("aria-label"),
    ).toBe("Destino: CEDIS Principal");

    await act(async () => root.unmount());
  });

  it("renders the immediate GPS marker even before a route geometry is available", async () => {
    const { container, map, root } = await renderMap({
      geometry: undefined,
      currentLocation: {
        accuracyMeters: 18,
        headingDegrees: null,
        latitude: 19.175,
        longitude: -96.135,
        recordedAt: "2026-08-12T16:00:00.000Z",
        speedKph: null,
      },
    });

    expect(map.layers).toEqual([]);
    expect(
      container.querySelector('[data-marker-kind="location"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("does not create a map for empty geometry", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DriverRouteMap
          geometry={{ type: "LineString", coordinates: [] }}
          routeName="Vacía"
        />,
      );
    });

    expect(container.querySelector('[aria-label="Mapa de Vacía"]')).toBeNull();
    expect(mapState.instances).toHaveLength(0);
    await act(async () => root.unmount());
  });
});
