// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryRoutePlan } from "../types";

type MockSourceLike = {
  data: unknown;
  setData: (data: unknown) => void;
};
type MockMapLike = {
  sources: globalThis.Map<string, MockSourceLike>;
  layers: string[];
  fitBoundsCalls: unknown[];
  removed: boolean;
  paint: globalThis.Map<string, unknown>;
  emit: (event: string, payload?: unknown) => void;
};
type MockMarkerLike = {
  element: HTMLElement;
  lngLat: { lat: number; lng: number };
  removed: boolean;
  setLngLat: (point: [number, number]) => MockMarkerLike;
  emit: (event: string) => void;
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
    handlers = new globalThis.Map<
      string,
      Set<(event?: unknown) => void>
    >();
    sources = new globalThis.Map<string, MockSource>();
    layers: string[] = [];
    paint = new globalThis.Map<string, unknown>();
    fitBoundsCalls: unknown[] = [];
    removed = false;

    on(event: string, handler: (event?: unknown) => void) {
      const handlers = this.handlers.get(event) ?? new Set();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    off(event: string, handler: (event?: unknown) => void) {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string, payload?: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload));
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

    setPaintProperty(id: string, property: string, value: unknown) {
      this.paint.set(`${id}:${property}`, value);
    }

    setCenter() {
      return this;
    }

    setZoom() {
      return this;
    }

    fitBounds(bounds: unknown) {
      this.fitBoundsCalls.push(bounds);
      return this;
    }

    addControl() {
      return this;
    }

    remove() {
      this.removed = true;
    }
  }

  class MockMapConstructor extends MockMap {
    constructor(options?: { container?: HTMLElement }) {
      super();
      this.container = options?.container;
      state.instances.push(this);
    }
  }

  class MockMarker {
    element: HTMLElement;
    handlers = new globalThis.Map<string, () => void>();
    lngLat = { lat: 0, lng: 0 };
    removed = false;
    draggable = false;

    constructor(options: { element: HTMLElement; draggable: boolean }) {
      this.element = options.element;
      this.draggable = options.draggable;
      state.markers.push(this);
    }

    setLngLat([lng, lat]: [number, number]) {
      this.lngLat = { lat, lng };
      return this;
    }

    getLngLat() {
      return this.lngLat;
    }

    setDraggable(value: boolean) {
      this.draggable = value;
      return this;
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string) {
      this.handlers.get(event)?.();
    }

    addTo(map?: MockMap) {
      map?.container?.appendChild(this.element);
      return this;
    }

    remove() {
      this.removed = true;
    }
  }

  return {
    AttributionControl: class {},
    Map: MockMapConstructor,
    Marker: MockMarker,
    state,
  };
});

const { state: mapState } = mapMock;

vi.mock("maplibre-gl", () => mapMock);

import { RoutePlannerMap } from "../components/RoutePlannerMap";

const plan: DeliveryRoutePlan = {
  id: "plan-1",
  vehicleId: "vehicle-1",
  expiresAt: "2026-07-16T12:00:00.000Z",
  routingProfile: "driving",
  routingDataVersion: "test",
  distanceMeters: 3300,
  durationSeconds: 660,
  geometry: {
    type: "LineString",
    coordinates: [
      [-96.2, 19.1],
      [-96.15, 19.15],
      [-96.1, 19.2],
    ],
  },
  orderedStops: [
    {
      saleId: "sale-a",
      deliveryAddress: "A",
      latitude: 19.2,
      longitude: -96.1,
      sequence: 1,
      legDistanceMeters: 1600,
      legDurationSeconds: 300,
    },
  ],
};

const origin = {
  id: "origin-1",
  name: "Veracruz",
  latitude: 19.1,
  longitude: -96.2,
};

const stop = {
  saleId: "sale-a",
  deliveryAddress: "A",
  latitude: 19.2,
  longitude: -96.1,
  customerName: "Cliente A",
};

async function renderMap(
  overrides: Partial<React.ComponentProps<typeof RoutePlannerMap>> = {},
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <RoutePlannerMap
        origin={origin}
        plan={plan}
        stops={[stop]}
        onMoveStop={vi.fn()}
        onSelectStop={vi.fn()}
        {...overrides}
      />,
    );
  });
  await act(async () => {
    mapState.instances[0]?.emit("load");
  });
  return { container, root };
}

describe("RoutePlannerMap", () => {
  beforeEach(() => {
    mapState.instances.length = 0;
    mapState.markers.length = 0;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates one MapLibre instance, adds sources and fits origin plus stops", async () => {
    const { container, root } = await renderMap();
    const map = mapState.instances[0];

    expect(mapState.instances).toHaveLength(1);
    expect(map.layers).toEqual([
      "route-plan-line",
      "route-selected-segment-line",
      "route-direction-markers-symbol",
    ]);
    expect(map.sources.get("route-plan")?.data).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: plan.geometry,
          properties: {},
        },
      ],
    });
    expect(map.fitBoundsCalls).toHaveLength(1);
    expect(map.fitBoundsCalls[0]).toEqual([
      [-96.2, 19.1],
      [-96.1, 19.2],
    ]);
    expect(container.querySelectorAll(".route-stop-marker")).toHaveLength(2);

    await act(async () => root.unmount());
    expect(map.removed).toBe(true);
    container.remove();
  });

  it("moves only the active sale when the map is clicked", async () => {
    const onMoveStop = vi.fn();
    const { container, root } = await renderMap({
      activeSaleId: "sale-a",
      onMoveStop,
    });
    await act(async () => {
      mapState.instances[0].emit("click", {
        lngLat: { lat: 19.3, lng: -96.3 },
      });
    });

    expect(onMoveStop).toHaveBeenCalledWith("sale-a", 19.3, -96.3);
    await act(async () => root.unmount());
    container.remove();
  });

  it("calls onMoveStop for the dragged sale with latitude and longitude", async () => {
    const onMoveStop = vi.fn();
    const { container, root } = await renderMap({ onMoveStop });
    const saleMarker = mapState.markers.find(
      (marker) => marker.element.dataset.markerId === "sale-a",
    );
    await act(async () => {
      saleMarker?.setLngLat([-96.4, 19.4]);
      saleMarker?.emit("dragend");
    });

    expect(onMoveStop).toHaveBeenCalledWith("sale-a", 19.4, -96.4);
    await act(async () => root.unmount());
    container.remove();
  });

  it("updates the selected segment and hides geometry when the plan is null", async () => {
    const { container, root } = await renderMap({ activeSaleId: "sale-a" });
    const map = mapState.instances[0];
    expect(map.sources.get("route-selected-segment")?.data).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-96.2, 19.1],
              [-96.15, 19.15],
              [-96.1, 19.2],
            ],
          },
          properties: {},
        },
      ],
    });

    await act(async () => {
      root.render(
        <RoutePlannerMap
          origin={origin}
          plan={null}
          stops={[]}
          onMoveStop={vi.fn()}
          onSelectStop={vi.fn()}
        />,
      );
    });
    expect(map.sources.get("route-plan")?.data).toEqual({
      type: "FeatureCollection",
      features: [],
    });
    expect(map.sources.get("route-selected-segment")?.data).toEqual({
      type: "FeatureCollection",
      features: [],
    });

    await act(async () => root.unmount());
    container.remove();
  });

  it("toggles stop timing information and supports keyboard selection", async () => {
    const onSelectStop = vi.fn();
    const { container, root } = await renderMap({ onSelectStop });
    const marker = container.querySelector(
      '[data-marker-id="sale-a"] .route-stop-info',
    );
    expect(
      marker?.querySelector(".route-stop-card__duration")?.textContent,
    ).toBe("5 min");
    await act(async () => {
      marker?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onSelectStop).toHaveBeenCalledWith("sale-a");

    const toggle = container.querySelector(
      'button[aria-pressed="true"]',
    ) as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(
      container.querySelector('[data-marker-id="sale-a"] .route-stop-card'),
    ).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
