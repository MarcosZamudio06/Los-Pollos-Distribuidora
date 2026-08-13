// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapLibreCanvas } from "../MapLibreCanvas";
import type { MapClientConfig } from "../types";

const maplibre = vi.hoisted(() => {
  class MockMap {
    static instances: MockMap[] = [];
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, (event: unknown) => void>();
    readonly addControl = vi.fn();
    readonly remove = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMap.instances.push(this);
    }

    on(event: string, handler: (payload: unknown) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    getCanvas() {
      return document.createElement("canvas");
    }

    emit(event: string, payload: unknown) {
      this.handlers.get(event)?.(payload);
    }
  }

  class MockAttributionControl {
    readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockMarker {
    static instances: MockMarker[] = [];
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, (event?: unknown) => void>();
    readonly remove = vi.fn();
    readonly addTo = vi.fn(() => this);
    private coordinates: [number, number] = [0, 0];

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMarker.instances.push(this);
    }

    setLngLat(coordinates: [number, number]) {
      this.coordinates = coordinates;
      return this;
    }

    setDraggable(value: boolean) {
      this.options.draggable = value;
      return this;
    }

    on(event: string, handler: (payload?: unknown) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    getLngLat() {
      return { lat: this.coordinates[1], lng: this.coordinates[0] };
    }

    emit(event: string, payload?: unknown) {
      this.handlers.get(event)?.(payload);
    }
  }

  return {
    AttributionControl: MockAttributionControl,
    Map: MockMap,
    Marker: MockMarker,
  };
});

vi.mock("maplibre-gl", () => maplibre);
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

const config: MapClientConfig = {
  renderer: "maplibre",
  available: true,
  style: "/maps/styles/operations/style.json",
  revision: "mexico-2026-08",
  attribution: [{ label: "OpenStreetMap" }],
  defaultViewport: { latitude: 19.1738, longitude: -96.1342, zoom: 11 },
  capabilities: { geocoding: true, routing: true, optimization: true },
};

function ClickMarkerHarness() {
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  return createElement(MapLibreCanvas, {
    config,
    marker: coordinates
      ? {
          coordinates,
          draggable: true,
        }
      : undefined,
    onCoordinateChange: setCoordinates,
  });
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalMatchMedia: typeof window.matchMedia;

async function flushImport() {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("MapLibreCanvas", () => {
  beforeEach(() => {
    maplibre.Map.instances.length = 0;
    maplibre.Marker.instances.length = 0;
    host = document.createElement("div");
    document.body.append(host);
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}) as never);
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(() =>
      ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never,
    );
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    host?.remove();
    host = null;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.matchMedia = originalMatchMedia;
  });

  it("creates the map with runtime style, attribution, reduced motion, and lng/lat order", async () => {
    const onCoordinateChange = vi.fn();

    await act(async () => {
      root = createRoot(host as HTMLDivElement);
      root.render(
        createElement(MapLibreCanvas, { config, onCoordinateChange }),
      );
      await flushImport();
    });

    const map = maplibre.Map.instances[0];
    expect(map.options).toMatchObject({
      center: [-96.1342, 19.1738],
      fadeDuration: 0,
      style: "/maps/styles/operations/style.json",
      zoom: 11,
    });
    expect(map.addControl).toHaveBeenCalledOnce();

    map.emit("click", { lngLat: { lat: 19.18, lng: -96.13 } });
    expect(onCoordinateChange).toHaveBeenCalledWith({
      latitude: 19.18,
      longitude: -96.13,
    });
  });

  it("destroys the MapLibre instance on unmount", async () => {
    await act(async () => {
      root = createRoot(host as HTMLDivElement);
      root.render(createElement(MapLibreCanvas, { config }));
      await flushImport();
    });

    const map = maplibre.Map.instances[0];
    await act(async () => root?.unmount());
    expect(map.remove).toHaveBeenCalledOnce();
    root = null;
  });

  it("creates a draggable marker and converts its dragend to latitude/longitude", async () => {
    const onDragEnd = vi.fn();

    await act(async () => {
      root = createRoot(host as HTMLDivElement);
      root.render(
        createElement(MapLibreCanvas, {
          config,
          marker: {
            coordinates: { latitude: 19.432608, longitude: -96.1342 },
            draggable: true,
            onDragEnd,
          },
        }),
      );
      await flushImport();
    });

    const marker = maplibre.Marker.instances[0];
    expect(marker.options.draggable).toBe(true);
    expect(marker.getLngLat()).toEqual({ lat: 19.432608, lng: -96.1342 });

    marker.setLngLat([-96.14, 19.44]);
    marker.emit("dragend");
    expect(onDragEnd).toHaveBeenCalledWith({ latitude: 19.44, longitude: -96.14 });
  });

  it("adds the marker after a map click when the controlled coordinates start empty", async () => {
    await act(async () => {
      root = createRoot(host as HTMLDivElement);
      root.render(createElement(ClickMarkerHarness));
      await flushImport();
    });

    const map = maplibre.Map.instances[0];
    map.emit("click", { lngLat: { lat: 19.44, lng: -96.14 } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(maplibre.Marker.instances).toHaveLength(1);
    expect(maplibre.Marker.instances[0]?.getLngLat()).toEqual({
      lat: 19.44,
      lng: -96.14,
    });
  });

  it.each([
    ["style", "estilo"],
    ["tiles", "mosaicos"],
    ["glyphs", "fuentes"],
    ["sprites", "recursos"],
  ] as const)("surfaces %s resource failures without keeping the map alive", async (kind, copy) => {
    await act(async () => {
      root = createRoot(host as HTMLDivElement);
      root.render(createElement(MapLibreCanvas, { config }));
      await flushImport();
    });

    const map = maplibre.Map.instances.at(-1);
    expect(map).toBeDefined();
    await act(async () => {
      map?.emit("error", { error: new Error(`${kind} request failed`) });
    });

    expect(host?.textContent).toContain(copy);
    expect(map?.remove).toHaveBeenCalledOnce();
    await act(async () => root?.unmount());
    root = null;
  });
});
