// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetLiveItem } from "../types";

type Source = {
  data: unknown;
  updateDataCalls: unknown[];
  setData: (data: unknown) => void;
  updateData: (data: { update?: unknown[]; remove?: string[] }) => void;
};
type MockMap = {
  sources: globalThis.Map<string, Source>;
  layers: string[];
  fitBoundsCalls: unknown[];
  flyToCalls: unknown[];
  layoutChanges: unknown[];
  removed: boolean;
  hasHandler: (event: string) => boolean;
  emit: (event: string, payload?: unknown) => void;
  emitLayer: (layer: string, payload?: unknown) => void;
};

const mapMock = vi.hoisted(() => {
  const state = { instances: [] as MockMap[] };

  class MockSource implements Source {
    data: unknown;
    updateDataCalls: unknown[] = [];

    constructor(data: unknown) {
      this.data = data;
    }

    setData(data: unknown) {
      this.data = data;
    }

    updateData(data: { update?: unknown[]; remove?: string[] }) {
      this.updateDataCalls.push(data);
      const collection = this.data as {
        type: "FeatureCollection";
        features: Array<{ id: string }>;
      };
      const updates = (data.update ?? []) as Array<{ id: string }>;
      const removes = new Set(data.remove ?? []);
      const byId = new globalThis.Map(
        collection.features.map((feature) => [feature.id, feature]),
      );
      updates.forEach((feature) => byId.set(feature.id, feature));
      removes.forEach((id) => byId.delete(id));
      this.data = { ...collection, features: [...byId.values()] };
    }
  }

  class MockMap {
    sources = new globalThis.Map<string, Source>();
    layers: string[] = [];
    fitBoundsCalls: unknown[] = [];
    flyToCalls: unknown[] = [];
    layoutChanges: unknown[] = [];
    removed = false;
    handlers = new globalThis.Map<string, Set<(payload?: unknown) => void>>();

    constructor() {
      state.instances.push(this as unknown as MockMap);
    }

    on(event: string, layerOrHandler: string | ((payload?: unknown) => void), maybeHandler?: (payload?: unknown) => void) {
      const key = typeof layerOrHandler === "string" ? `${event}:${layerOrHandler}` : event;
      const handler = typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler;
      if (!handler) return this;
      const handlers = this.handlers.get(key) ?? new Set();
      handlers.add(handler);
      this.handlers.set(key, handlers);
      return this;
    }

    off() {
      return this;
    }

    emit(event: string, payload?: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload));
    }

    hasHandler(event: string) {
      return (this.handlers.get(event)?.size ?? 0) > 0;
    }

    emitLayer(layer: string, payload?: unknown) {
      this.emit(`click:${layer}`, payload);
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

    flyTo(options: unknown) {
      this.flyToCalls.push(options);
      return this;
    }

    setLayoutProperty(layerId: string, property: string, value: unknown) {
      this.layoutChanges.push({ layerId, property, value });
      return this;
    }

    remove() {
      this.removed = true;
    }
  }

  return { Map: MockMap, state };
});

const runtimeMock = vi.hoisted(() => ({
  loadMapLibre: vi.fn(),
}));

vi.mock("maplibre-gl", () => mapMock);
vi.mock("../../../lib/maps/mapLibreRuntime", () => runtimeMock);

runtimeMock.loadMapLibre.mockResolvedValue(mapMock);

import { FleetLiveMap } from "../components/FleetLiveMap";

const item = (latitude = 19.15): FleetLiveItem => ({
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
    geometry: {
      type: "LineString",
      coordinates: [[-96.2, 19.1], [-96.15, 19.15]],
    },
  },
  position: {
    latitude,
    longitude: -96.15,
    accuracyMeters: 8,
    speedKph: null,
    headingDegrees: null,
    recordedAt: "2026-08-12T16:00:00.000Z",
  },
  stale: false,
  nextStop: null,
});

async function renderMap(
  items: FleetLiveItem[] = [item()],
): Promise<{ container: HTMLElement; root: Root; map: MockMap }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <FleetLiveMap
        items={items}
        onSelectVehicle={vi.fn()}
        selectedVehicleId={null}
      />,
    );
  });
  await vi.waitFor(() => expect(mapMock.state.instances).toHaveLength(1));
  const map = mapMock.state.instances[0];
  await act(async () => map.emit("load"));
  return { container, root, map };
}

describe("FleetLiveMap", () => {
  beforeEach(() => {
    mapMock.state.instances.length = 0;
    runtimeMock.loadMapLibre.mockClear();
    runtimeMock.loadMapLibre.mockResolvedValue(mapMock);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates one MapLibre map with stable vehicle ids and the required sources/layers", async () => {
    const { map, root, container } = await renderMap();

    expect(mapMock.state.instances).toHaveLength(1);
    expect(runtimeMock.loadMapLibre).toHaveBeenCalledTimes(1);
    expect(map.hasHandler("error")).toBe(true);
    expect(map.layers).toEqual([
      "fleet-routes-lines",
      "fleet-deliveries-pending",
      "fleet-deliveries-completed",
      "fleet-incidents-symbol",
      "fleet-heatmap",
      "fleet-traffic-lines",
      "delivery-zones-fill",
      "delivery-zones-outline",
      "delivery-zone-selected",
      "fleet-vehicles-symbol",
      "fleet-vehicle-selected",
      "delivery-zone-editor-fill",
      "delivery-zone-editor-outline",
      "delivery-zone-editor-vertices",
    ]);
    expect(map.sources.get("fleet-vehicles")?.data).toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: [expect.objectContaining({ id: "vehicle-1" })],
      }),
    );
    expect(map.sources.get("fleet-routes")?.data).toEqual(
      expect.objectContaining({ features: [expect.objectContaining({ id: "route-1" })] }),
    );
    expect(map.sources.get("delivery-zones")?.data).toEqual(
      expect.objectContaining({ type: "FeatureCollection", features: [] }),
    );
    expect(map.sources.get("fleet-incidents")?.data).toEqual(
      expect.objectContaining({ type: "FeatureCollection", features: [] }),
    );
    expect(map.sources.get("fleet-heatmap")?.data).toEqual(
      expect.objectContaining({ type: "FeatureCollection", features: [] }),
    );
    expect(map.sources.get("fleet-traffic")?.data).toEqual(
      expect.objectContaining({ type: "FeatureCollection", features: [] }),
    );
    expect(map.layoutChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "delivery-zones-fill",
          value: "visible",
        }),
        expect.objectContaining({
          layerId: "fleet-traffic-lines",
          value: "none",
        }),
      ]),
    );
    expect(map.fitBoundsCalls).toHaveLength(1);

    await act(async () => root.unmount());
    expect(map.removed).toBe(true);
    container.remove();
  });

  it("logs asynchronous errors without treating recoverable tiles as fatal", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { map, root, container } = await renderMap();

    await act(async () => {
      map.emit("error", {
        error: new Error("tile request failed"),
        sourceId: "openmaptiles",
      });
    });

    expect(container.textContent).not.toContain("El mapa no está disponible");
    expect(map.removed).toBe(false);

    await act(async () => {
      map.emit("error", {
        error: new Error("Failed to load maplibre worker"),
      });
    });

    expect(container.textContent).toContain("El mapa no está disponible");
    expect(errorSpy).toHaveBeenCalledWith(
      "[FleetLiveMap] MapLibre error:",
      expect.anything(),
    );

    await act(async () => root.unmount());
    container.remove();
    errorSpy.mockRestore();
  });

  it("keeps traffic hidden when the provider is unavailable", async () => {
    const { map, root } = await renderMap();
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item()]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId={null}
          showTraffic
          trafficAvailable={false}
          traffic={{ type: "FeatureCollection", features: [] }}
        />,
      );
    });

    expect(map.layoutChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "fleet-traffic-lines",
          value: "none",
        }),
      ]),
    );

    await act(async () => root.unmount());
  });

  it("updates a source without creating another map and synchronizes map selection", async () => {
    const onSelectVehicle = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item()]}
          onSelectVehicle={onSelectVehicle}
          selectedVehicleId={null}
        />,
      );
    });
    await vi.waitFor(() => expect(mapMock.state.instances).toHaveLength(1));
    const map = mapMock.state.instances[0];
    await act(async () => map.emit("load"));
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item(19.2)]}
          onSelectVehicle={onSelectVehicle}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(mapMock.state.instances).toHaveLength(1);
    expect(
      (map.sources.get("fleet-vehicles")?.data as { features: Array<{ geometry: { coordinates: number[] } }> }).features[0].geometry.coordinates,
    ).toEqual([-96.15, 19.2]);
    expect(map.sources.get("fleet-vehicles")?.updateDataCalls).toHaveLength(1);
    await act(async () => {
      map.emitLayer("fleet-vehicles-symbol", { features: [{ id: "vehicle-1" }] });
    });
    expect(onSelectVehicle).toHaveBeenCalledWith("vehicle-1");

    await act(async () => root.unmount());
  });

  it("renders persisted heatmap cells with weight without recreating the map", async () => {
    const { map, root } = await renderMap();
    await act(async () => {
      root.render(
        <FleetLiveMap
          heatmap={{
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-96.14, 19.17] },
                properties: { weight: 4, count: 4, metric: "DELIVERIES" },
              },
            ],
          }}
          items={[item()]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId={null}
          showHeatmap
        />,
      );
    });

    expect(mapMock.state.instances).toHaveLength(1);
    expect(map.sources.get("fleet-heatmap")?.data).toEqual(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ weight: 4 }),
          }),
        ],
      }),
    );
    expect(map.layoutChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "fleet-heatmap",
          value: "visible",
        }),
      ]),
    );

    await act(async () => root.unmount());
  });
});
