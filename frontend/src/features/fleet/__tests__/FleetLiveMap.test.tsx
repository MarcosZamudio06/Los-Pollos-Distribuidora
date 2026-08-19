// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetLiveItem } from "../types";

type MockFeature = {
  type: "Feature";
  id: string | number;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};
type MockFeatureUpdate = {
  id: string | number;
  newGeometry?: MockFeature["geometry"];
  addOrUpdateProperties?: Array<{ key: string; value: unknown }>;
  removeProperties?: string[];
};
type MockSourceDiff = {
  add?: MockFeature[];
  update?: MockFeatureUpdate[];
  remove?: Array<string | number>;
};

type Source = {
  data: unknown;
  setDataCalls: unknown[];
  updateDataCalls: MockSourceDiff[];
  setData: (data: unknown) => void;
  updateData: (data: MockSourceDiff) => void;
};
type MockMap = {
  sources: globalThis.Map<string, Source>;
  layers: string[];
  layerDefinitions: globalThis.Map<
    string,
    {
      id: string;
      type?: string;
      source?: string;
      minzoom?: number;
      filter?: unknown;
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
    }
  >;
  fitBoundsCalls: unknown[];
  flyToCalls: unknown[];
  easeToCalls: unknown[];
  zoom: number;
  layoutChanges: unknown[];
  resizeCalls: number;
  removed: boolean;
  setZoom: (zoom?: number) => unknown;
  getZoom: () => number;
  hasHandler: (event: string) => boolean;
  emit: (event: string, payload?: unknown) => void;
  emitLayer: (layer: string, payload?: unknown) => void;
};

type ResizeObserverInstance = {
  observedElements: Element[];
  disconnectCalls: number;
  trigger: () => void;
};

const resizeObserverMock = vi.hoisted(() => {
  const instances: ResizeObserverInstance[] = [];

  class MockResizeObserver {
    readonly observedElements: Element[] = [];
    disconnectCalls = 0;
    private readonly callback: () => void;

    constructor(callback: () => void) {
      this.callback = callback;
      instances.push(this as unknown as ResizeObserverInstance);
    }

    observe(element: Element) {
      this.observedElements.push(element);
    }

    unobserve() {}

    disconnect() {
      this.disconnectCalls += 1;
    }

    trigger() {
      this.callback();
    }
  }

  return { MockResizeObserver, state: { instances } };
});

const mapMock = vi.hoisted(() => {
  const state = { instances: [] as MockMap[] };

  class MockSource implements Source {
    data: unknown;
    setDataCalls: unknown[] = [];
    updateDataCalls: MockSourceDiff[] = [];

    constructor(data: unknown) {
      this.data = data;
    }

    setData(data: unknown) {
      this.setDataCalls.push(data);
      this.data = data;
    }

    updateData(data: MockSourceDiff) {
      this.updateDataCalls.push(data);
      const collection = this.data as {
        type: "FeatureCollection";
        features: MockFeature[];
      };
      const additions = data.add ?? [];
      const removes = new Set(data.remove ?? []);
      const byId = new globalThis.Map(
        collection.features.map((feature) => [feature.id, feature]),
      );
      additions.forEach((feature) => byId.set(feature.id, feature));
      data.update?.forEach((diff) => {
        const feature = byId.get(diff.id);
        if (!feature) return;
        if (diff.newGeometry) feature.geometry = diff.newGeometry;
        diff.removeProperties?.forEach((key) => {
          delete feature.properties[key];
        });
        diff.addOrUpdateProperties?.forEach(({ key, value }) => {
          feature.properties[key] = value;
        });
      });
      removes.forEach((id) => byId.delete(id));
      this.data = { ...collection, features: [...byId.values()] };
    }
  }

  class MockMap {
    sources = new globalThis.Map<string, Source>();
    layers: string[] = [];
    layerDefinitions = new globalThis.Map<
      string,
      {
        id: string;
        type?: string;
        source?: string;
        minzoom?: number;
        filter?: unknown;
        layout?: Record<string, unknown>;
        paint?: Record<string, unknown>;
      }
    >();
    fitBoundsCalls: unknown[] = [];
    flyToCalls: unknown[] = [];
    easeToCalls: unknown[] = [];
    zoom = 11;
    layoutChanges: unknown[] = [];
    resizeCalls = 0;
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

    addLayer(layer: {
      id: string;
      type?: string;
      source?: string;
      minzoom?: number;
      filter?: unknown;
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
    }) {
      this.layers.push(layer.id);
      this.layerDefinitions.set(layer.id, layer);
    }

    setCenter() {
      return this;
    }

    setZoom(zoom?: number) {
      if (typeof zoom === "number") this.zoom = zoom;
      return this;
    }

    getZoom() {
      return this.zoom;
    }

    fitBounds(bounds: unknown) {
      this.fitBoundsCalls.push(bounds);
      return this;
    }

    flyTo(options: unknown) {
      this.flyToCalls.push(options);
      if (typeof options === "object" && options !== null) {
        const camera = options as { zoom?: unknown };
        if (typeof camera.zoom === "number") this.zoom = camera.zoom;
      }
      return this;
    }

    easeTo(options: unknown) {
      this.easeToCalls.push(options);
      if (typeof options === "object" && options !== null) {
        const camera = options as { zoom?: unknown };
        if (typeof camera.zoom === "number") this.zoom = camera.zoom;
      }
      return this;
    }

    resize() {
      this.resizeCalls += 1;
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

const vehicleItem = (vehicleId: string, latitude = 19.15): FleetLiveItem => {
  const base = item(latitude);
  return {
    ...base,
    vehicle: { ...base.vehicle, id: vehicleId, code: vehicleId.toUpperCase() },
    route: { ...base.route, id: `route-${vehicleId}` },
  };
};

async function renderMap(
  items: FleetLiveItem[] = [item()],
  selectedVehicleId: string | null = null,
): Promise<{ container: HTMLElement; root: Root; map: MockMap }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <FleetLiveMap
        items={items}
        onSelectVehicle={vi.fn()}
        selectedVehicleId={selectedVehicleId}
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
    resizeObserverMock.state.instances.length = 0;
    vi.stubGlobal("ResizeObserver", resizeObserverMock.MockResizeObserver);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("creates one MapLibre map with stable vehicle ids and the required sources/layers", async () => {
    const { map, root, container } = await renderMap();

    expect(mapMock.state.instances).toHaveLength(1);
    expect(runtimeMock.loadMapLibre).toHaveBeenCalledTimes(1);
    expect(map.hasHandler("error")).toBe(true);
    expect(map.hasHandler("mouseenter:fleet-vehicles-symbol")).toBe(true);
    expect(map.hasHandler("mouseleave:fleet-vehicles-symbol")).toBe(true);
    expect(map.layerDefinitions.get("fleet-vehicles-symbol")?.layout).toEqual(
      expect.objectContaining({
        "icon-image": "car_11",
        "icon-size": expect.any(Number),
        "icon-rotate": ["coalesce", ["get", "headingDegrees"], 0],
        "icon-rotation-alignment": "map",
      }),
    );
    expect(map.layerDefinitions.get("fleet-vehicle-selected")).toEqual(
      expect.objectContaining({ type: "circle" }),
    );
    expect(map.layerDefinitions.get("fleet-vehicle-base")).toEqual(
      expect.objectContaining({ type: "circle" }),
    );
    expect(map.layerDefinitions.get("fleet-vehicles-label")).toEqual(
      expect.objectContaining({ type: "symbol" }),
    );
    expect(
      map.layerDefinitions.get("fleet-vehicles-label")?.layout?.[
        "text-allow-overlap"
      ],
    ).toBe(true);
    expect(
      map.layerDefinitions.get("fleet-vehicles-label")?.layout?.[
        "text-ignore-placement"
      ],
    ).toBe(true);
    expect(map.layerDefinitions.get("fleet-vehicles-label")).toEqual(
      expect.objectContaining({
        minzoom: 13,
        filter: ["==", ["get", "selected"], false],
        layout: expect.objectContaining({
          "text-field": ["get", "code"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        }),
      }),
    );
    expect(map.layerDefinitions.get("fleet-vehicles-label")?.paint).toEqual(
      expect.not.objectContaining({ "text-opacity": expect.anything() }),
    );
    expect(
      map.layerDefinitions.get("fleet-vehicles-label-selected"),
    ).toEqual(
      expect.objectContaining({
        filter: ["==", ["get", "selected"], true],
        layout: expect.objectContaining({
          "text-field": ["get", "selectedLabel"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        }),
      }),
    );
    expect(
      JSON.stringify(map.layerDefinitions.get("fleet-vehicle-selected")?.paint),
    ).toEqual(expect.stringContaining("#d69b2d"));
    expect(
      JSON.stringify(map.layerDefinitions.get("fleet-vehicle-selected")?.paint),
    ).not.toContain("#b62a22");
    const mapContainer = container.querySelector<HTMLElement>(
      '[aria-label="Mapa de monitoreo de flota"]',
    );
    expect(mapContainer).not.toBeNull();
    expect(mapContainer?.className).toContain("h-full");
    expect(mapContainer?.className).toContain("min-h-[34rem]");
    expect(mapContainer?.className).toContain("w-full");
    expect(resizeObserverMock.state.instances).toHaveLength(1);
    expect(resizeObserverMock.state.instances[0].observedElements[0]).toBe(
      mapContainer,
    );
    expect(map.resizeCalls).toBe(1);
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
      "fleet-vehicle-selected",
      "fleet-vehicle-base",
      "fleet-vehicles-symbol",
      "fleet-vehicles-label",
      "fleet-vehicles-label-selected",
      "delivery-zone-editor-fill",
      "delivery-zone-editor-outline",
      "delivery-zone-editor-vertices",
    ]);
    expect(map.sources.get("fleet-vehicles")?.data).toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: [
          expect.objectContaining({
            id: "vehicle-1",
            geometry: {
              type: "Point",
              coordinates: [-96.15, 19.15],
            },
          }),
        ],
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

    const observer = resizeObserverMock.state.instances[0];
    observer.trigger();
    expect(map.resizeCalls).toBe(2);

    await act(async () => root.unmount());
    expect(observer.disconnectCalls).toBe(1);
    expect(map.removed).toBe(true);
    observer.trigger();
    expect(map.resizeCalls).toBe(2);
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

  it("keeps null headings safe and exposes stale, incident, and selected marker state", async () => {
    const staleItem: FleetLiveItem = {
      ...vehicleItem("vehicle-stale"),
      stale: true,
      position: {
        ...vehicleItem("vehicle-stale").position!,
        headingDegrees: null,
      },
    };
    const incidentItem: FleetLiveItem = {
      ...item(),
      incidentCountActive: 1,
      position: {
        ...item().position!,
        headingDegrees: null,
        speedKph: null,
      },
    };
    const { map, root } = await renderMap(
      [staleItem, incidentItem],
      "vehicle-1",
    );

    const vehicleFeatures = (
      map.sources.get("fleet-vehicles")?.data as {
        features: Array<{
          id: string;
          properties: Record<string, unknown>;
        }>;
      }
    ).features;
    expect(vehicleFeatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vehicle-stale",
          properties: expect.objectContaining({ stale: true }),
        }),
        expect.objectContaining({
          id: "vehicle-1",
          properties: expect.objectContaining({
            hasActiveIncident: true,
            selected: true,
            selectedLabel: "UNIDAD-01",
            headingDegrees: null,
          }),
        }),
      ]),
    );

    const basePaint = JSON.stringify(
      map.layerDefinitions.get("fleet-vehicle-base")?.paint,
    );
    expect(basePaint).toContain("#6f7b78");
    expect(basePaint).toContain("0.72");
    expect(basePaint).toContain("#b62a22");

    await act(async () => root.unmount());
  });

  it("keeps a selected unit label with a valid speed and no invalid speed text", async () => {
    const selectedItem = item();
    selectedItem.position = {
      ...selectedItem.position!,
      speedKph: 38.4,
    };
    const { map, root } = await renderMap([selectedItem], "vehicle-1");

    const feature = (
      map.sources.get("fleet-vehicles")?.data as {
        features: Array<{ properties: Record<string, unknown> }>;
      }
    ).features[0];
    expect(feature.properties.selectedLabel).toBe("UNIDAD-01 · 38 km/h");
    expect(feature.properties.selectedLabel).not.toMatch(/null|undefined|NaN/);

    await act(async () => root.unmount());
  });

  it("centers a newly selected vehicle without reducing the current zoom", async () => {
    const { map, root } = await renderMap();

    map.setZoom(17);
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item()]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(map.flyToCalls).toEqual([
      {
        center: [-96.15, 19.15],
        zoom: 17,
        duration: 0,
      },
    ]);

    await act(async () => root.unmount());
  });

  it("follows the selected vehicle position without changing its zoom", async () => {
    const { map, root } = await renderMap([item()], "vehicle-1");

    map.setZoom(17);
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item(19.2)]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(map.flyToCalls).toHaveLength(1);
    expect(map.flyToCalls[0]).toEqual(
      expect.objectContaining({
        center: [-96.15, 19.15],
        zoom: 14,
      }),
    );
    expect(map.easeToCalls).toEqual([{ center: [-96.15, 19.2] }]);
    expect(map.easeToCalls[0]).not.toHaveProperty("zoom");
    expect(map.getZoom()).toBe(17);

    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item(19.25)]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(map.flyToCalls).toHaveLength(1);
    expect(map.easeToCalls).toHaveLength(2);
    expect(map.getZoom()).toBe(17);

    await act(async () => root.unmount());
  });

  it("does not move the camera when another vehicle changes", async () => {
    const { map, root } = await renderMap(
      [item(), vehicleItem("vehicle-2", 19.3)],
      "vehicle-1",
    );

    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item(), vehicleItem("vehicle-2", 19.4)]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(map.flyToCalls).toHaveLength(1);
    expect(map.easeToCalls).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it("does not move the camera when no vehicle is selected", async () => {
    const { map, root } = await renderMap();

    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[item(19.2)]}
          onSelectVehicle={vi.fn()}
          selectedVehicleId={null}
        />,
      );
    });

    expect(map.flyToCalls).toHaveLength(0);
    expect(map.easeToCalls).toHaveLength(0);

    await act(async () => root.unmount());
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
    const fetchSpy = vi.spyOn(globalThis, "fetch");
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
    const movedItem = item(19.2);
    movedItem.position = {
      ...movedItem.position!,
      headingDegrees: 135,
      speedKph: 38,
    };
    await act(async () => {
      root.render(
        <FleetLiveMap
          items={[movedItem]}
          onSelectVehicle={onSelectVehicle}
          selectedVehicleId="vehicle-1"
        />,
      );
    });

    expect(mapMock.state.instances).toHaveLength(1);
    expect(
      (map.sources.get("fleet-vehicles")?.data as { features: Array<{ geometry: { coordinates: number[] } }> }).features[0].geometry.coordinates,
    ).toEqual([-96.15, 19.2]);
    expect(map.sources.get("fleet-vehicles")?.setDataCalls).toHaveLength(1);
    expect(map.sources.get("fleet-vehicles")?.updateDataCalls).toEqual([
      {
        add: [],
        update: [
          {
            id: "vehicle-1",
            newGeometry: {
              type: "Point",
              coordinates: [-96.15, 19.2],
            },
            addOrUpdateProperties: expect.arrayContaining([
              { key: "selected", value: true },
              { key: "headingDegrees", value: 135 },
            ]),
          },
        ],
        remove: [],
      },
    ]);
    expect(
      (map.sources.get("fleet-vehicles")?.updateDataCalls[0] as MockSourceDiff)
        .update?.[0],
    ).not.toHaveProperty("geometry");
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      map.emitLayer("fleet-vehicles-symbol", { features: [{ id: "vehicle-1" }] });
    });
    expect(onSelectVehicle).toHaveBeenCalledWith("vehicle-1");

    await act(async () => root.unmount());
    fetchSpy.mockRestore();
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
