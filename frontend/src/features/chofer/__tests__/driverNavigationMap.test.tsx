// @vitest-environment jsdom
import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockSource = {
  data: unknown;
  setData: (data: unknown) => void;
};
type MockMap = {
  layers: string[];
  removed: boolean;
  sources: globalThis.Map<string, MockSource>;
  fitBoundsCalls: Array<{ bounds: unknown; options: unknown }>;
  emit: (event: string) => void;
  getZoom: () => number;
  easeToCalls: Array<Record<string, unknown>>;
};
type MockMarker = {
  callOrder: string[];
  element: HTMLElement;
  removed: boolean;
  setLngLatCalls: Array<[number, number]>;
};

const mapMock = vi.hoisted(() => {
  const state = {
    instances: [] as MockMap[],
    markers: [] as MockMarker[],
  };

  class Source {
    data: unknown;

    constructor(data: unknown) {
      this.data = data;
    }

    setData(data: unknown) {
      this.data = data;
    }
  }

  class Map {
    handlers = new globalThis.Map<string, Set<() => void>>();
    layers: string[] = [];
    removed = false;
    sources = new globalThis.Map<string, Source>();
    fitBoundsCalls: Array<{ bounds: unknown; options: unknown }> = [];
    easeToCalls: Array<Record<string, unknown>> = [];

    constructor() {
      state.instances.push(this as unknown as MockMap);
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
      this.sources.set(id, new Source(source.data));
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    addLayer(layer: { id: string }) {
      this.layers.push(layer.id);
    }

    addControl() {
      return this;
    }

    fitBounds(bounds: unknown, options: unknown) {
      this.fitBoundsCalls.push({ bounds, options });
      return this;
    }

    getZoom() {
      return 14;
    }

    easeTo(options: Record<string, unknown>) {
      this.easeToCalls.push(options);
      return this;
    }

    remove() {
      this.removed = true;
    }
  }

  class Marker {
    callOrder: string[] = [];
    element: HTMLElement;
    removed = false;
    setLngLatCalls: Array<[number, number]> = [];

    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
      state.markers.push(this as unknown as MockMarker);
    }

    setLngLat(position: [number, number]) {
      this.callOrder.push("setLngLat");
      this.setLngLatCalls.push(position);
      return this;
    }

    getElement() {
      return this.element;
    }

    addTo() {
      this.callOrder.push("addTo");
      return this;
    }

    remove() {
      this.removed = true;
      this.element.remove();
    }
  }

  return {
    AttributionControl: class {},
    Map,
    Marker,
    setWorkerUrl: vi.fn(),
    state,
  };
});

vi.mock("maplibre-gl", () => mapMock);

import {
  DriverNavigationMap,
  type DriverNavigationMapHandle,
  type DriverNavigationMapProps,
} from "../components/DriverNavigationMap";

const geometry = {
  type: "LineString" as const,
  coordinates: [
    [-96.14, 19.18],
    [-96.13, 19.17],
  ] as [number, number][],
};
const destination = {
  kind: "DELIVERY_ORDER" as const,
  id: "order-1",
  label: "Cliente Centro",
  address: "Av. Centro 10",
  latitude: 19.17,
  longitude: -96.13,
};

async function renderMap(
  props: Partial<DriverNavigationMapProps> = {},
  mapRef?: RefObject<DriverNavigationMapHandle | null>,
): Promise<{ container: HTMLElement; root: Root; map: MockMap }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DriverNavigationMap
        ref={mapRef}
        currentLocation={{
          accuracyMeters: 16,
          headingDegrees: 90,
          latitude: 19.18,
          longitude: -96.14,
          recordedAt: "2026-08-20T18:00:00.000Z",
          speedKph: 28,
        }}
        destination={destination}
        geometry={geometry}
        routeName="Ruta Centro"
        {...props}
      />,
    );
  });
  await vi.waitFor(() => expect(mapMock.state.instances).toHaveLength(1));
  const map = mapMock.state.instances[0];
  await act(async () => map.emit("load"));
  return { container, map, root };
}

describe("DriverNavigationMap", () => {
  beforeEach(() => {
    mapMock.state.instances.length = 0;
    mapMock.state.markers.length = 0;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("adds a dedicated navigation source and visible route layers", async () => {
    const { map, root } = await renderMap();

    expect(map.sources.get("driver-navigation-geometry")?.data).toBe(geometry);
    expect(map.layers).toEqual([
      "driver-navigation-geometry-casing",
      "driver-navigation-geometry-line",
    ]);
    expect(map.fitBoundsCalls).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it("updates the driver marker incrementally and rotates the heading", async () => {
    const { root } = await renderMap();
    expect(mapMock.state.markers).toHaveLength(2);
    const driverMarker = mapMock.state.markers.find(
      (marker) => marker.element.dataset.marker === "driver-navigation",
    );
    expect(driverMarker?.callOrder.slice(0, 2)).toEqual([
      "setLngLat",
      "addTo",
    ]);
    expect(driverMarker?.setLngLatCalls).toHaveLength(1);

    await act(async () => {
      root.render(
        <DriverNavigationMap
          currentLocation={{
            accuracyMeters: 140,
            headingDegrees: 180,
            latitude: 19.181,
            longitude: -96.139,
            recordedAt: "2026-08-20T18:00:05.000Z",
            speedKph: 30,
          }}
          destination={destination}
          geometry={geometry}
          lowAccuracy
          routeName="Ruta Centro"
        />,
      );
    });

    expect(mapMock.state.instances).toHaveLength(1);
    expect(mapMock.state.markers).toHaveLength(2);
    expect(
      mapMock.state.markers.find(
        (marker) => marker.element.dataset.marker === "driver-navigation",
      ),
    ).toBe(driverMarker);
    expect(driverMarker?.element.textContent).not.toContain("GPS");
    expect(driverMarker?.setLngLatCalls).toHaveLength(2);
    expect(
      driverMarker?.element
        .querySelector('[data-marker-role="heading-arrow"]')
        ?.getAttribute("style"),
    ).toContain("rotate(180deg)");
    expect(
      driverMarker?.element.getAttribute("data-low-accuracy"),
    ).toBe("true");

    await act(async () => root.unmount());
  });

  it("initializes the destination marker before adding it to the map", async () => {
    const { root } = await renderMap();
    const destinationMarker = mapMock.state.markers.find(
      (marker) => marker.element.dataset.marker === "destination",
    );

    expect(destinationMarker?.callOrder.slice(0, 2)).toEqual([
      "setLngLat",
      "addTo",
    ]);
    expect(destinationMarker?.setLngLatCalls[0]).toEqual([
      destination.longitude,
      destination.latitude,
    ]);

    await act(async () => root.unmount());
  });

  it("reuses the destination marker when its target changes", async () => {
    const { root } = await renderMap();
    const destinationMarker = mapMock.state.markers.find(
      (marker) => marker.element.dataset.marker === "destination",
    );
    const updatedDestination = {
      ...destination,
      id: "order-2",
      label: "Cliente Norte",
      latitude: 19.171,
      longitude: -96.129,
    };

    await act(async () => {
      root.render(
        <DriverNavigationMap
          currentLocation={{
            accuracyMeters: 16,
            headingDegrees: 90,
            latitude: 19.18,
            longitude: -96.14,
            recordedAt: "2026-08-20T18:00:00.000Z",
            speedKph: 28,
          }}
          destination={updatedDestination}
          geometry={geometry}
          routeName="Ruta Centro"
        />,
      );
    });

    expect(mapMock.state.markers).toHaveLength(2);
    expect(
      mapMock.state.markers.find(
        (marker) => marker.element.dataset.marker === "destination",
      ),
    ).toBe(destinationMarker);
    expect(destinationMarker?.setLngLatCalls.at(-1)).toEqual([
      updatedDestination.longitude,
      updatedDestination.latitude,
    ]);
    expect(destinationMarker?.element.title).toBe(updatedDestination.label);

    await act(async () => root.unmount());
  });

  it("does not create markers without valid coordinates", async () => {
    const { root } = await renderMap({
      currentLocation: {
        accuracyMeters: 16,
        headingDegrees: 90,
        latitude: Number.NaN,
        longitude: Number.NaN,
        recordedAt: "2026-08-20T18:00:00.000Z",
        speedKph: 28,
      },
      destination: {
        ...destination,
        latitude: Number.NaN,
        longitude: Number.NaN,
      },
    });

    expect(mapMock.state.markers).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it("cleans up MapLibre and both persistent markers on unmount", async () => {
    const { map, root } = await renderMap();

    await act(async () => root.unmount());

    expect(map.removed).toBe(true);
    expect(mapMock.state.markers.every((marker) => marker.removed)).toBe(true);
  });

  it("follows the driver camera and tolerates a missing heading", async () => {
    const { map, root } = await renderMap();
    expect(map.easeToCalls.at(-1)).toMatchObject({
      bearing: 90,
      pitch: 35,
      zoom: 16.2,
    });

    await act(async () => {
      root.render(
        <DriverNavigationMap
          currentLocation={{
            accuracyMeters: 15,
            headingDegrees: null,
            latitude: 19.181,
            longitude: -96.139,
            recordedAt: "2026-08-20T18:00:05.000Z",
            speedKph: 20,
          }}
          destination={destination}
          geometry={geometry}
          routeName="Ruta Centro"
        />,
      );
    });

    expect(map.easeToCalls.at(-1)).toMatchObject({ pitch: 35, zoom: 16.2 });
    expect(map.easeToCalls.at(-1)).not.toHaveProperty("bearing");
    await act(async () => root.unmount());
  });

  it("interrupts follow on manual interaction and fits bounds only on overview action", async () => {
    const onFollowInterrupted = vi.fn();
    const ref = createRef<DriverNavigationMapHandle>();
    const { map, root } = await renderMap({ onFollowInterrupted }, ref);
    expect(map.fitBoundsCalls).toHaveLength(0);

    act(() => map.emit("dragstart"));
    expect(onFollowInterrupted).toHaveBeenCalledTimes(1);

    act(() => ref.current?.overview());
    expect(map.fitBoundsCalls).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it("forwards a map click without changing navigation state", async () => {
    const onMapClick = vi.fn();
    const { map, root } = await renderMap({ onMapClick });

    act(() => map.emit("click"));

    expect(onMapClick).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
