import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import { resolveMapStyle } from "../../../lib/maps/mapConfig";
import { loadMapLibre } from "../../../lib/maps/mapLibreRuntime";
import {
  createFleetFeatureCollections,
  getFleetFeatureBounds,
  type FleetFeatureCollections,
} from "../fleetLiveUtils";
import type {
  DeliveryZone,
  FleetCoordinate,
  FleetHeatmapFeatureCollection,
  FleetLiveItem,
  FleetTrafficFeatureCollection,
} from "../types";

type Props = {
  items: FleetLiveItem[];
  zones?: DeliveryZone[];
  showZones?: boolean;
  selectedVehicleId?: string | null;
  selectedZoneId?: string | null;
  highlightedVehicleId?: string | null;
  highlightedZoneId?: string | null;
  editorActive?: boolean;
  editorPoints?: FleetCoordinate[];
  heatmap?: FleetHeatmapFeatureCollection | null;
  showHeatmap?: boolean;
  traffic?: FleetTrafficFeatureCollection | null;
  trafficAvailable?: boolean;
  showTraffic?: boolean;
  onSelectVehicle: (vehicleId: string) => void;
  onSelectZone?: (zoneId: string) => void;
  onMapPoint?: (point: FleetCoordinate) => void;
};

const sourceIds = {
  deliveries: "fleet-deliveries",
  incidents: "fleet-incidents",
  routes: "fleet-routes",
  vehicles: "fleet-vehicles",
  zones: "delivery-zones",
  heatmap: "fleet-heatmap",
  traffic: "fleet-traffic",
  editor: "delivery-zone-editor",
} as const;

const vehicleIconImage = "car_11";

const emptyData: FleetFeatureCollections = {
  vehicles: { type: "FeatureCollection", features: [] },
  routes: { type: "FeatureCollection", features: [] },
  deliveries: { type: "FeatureCollection", features: [] },
  incidents: { type: "FeatureCollection", features: [] },
  zones: { type: "FeatureCollection", features: [] },
};

const emptyHeatmap: FleetHeatmapFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const emptyTraffic: FleetTrafficFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type GeoJSONSourceDiff = Parameters<GeoJSONSource["updateData"]>[0];
type GeoJSONFeatureUpdate = NonNullable<GeoJSONSourceDiff["update"]>[number];

type EditorFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry:
      | { type: "Polygon"; coordinates: FleetCoordinate[][] }
      | { type: "Point"; coordinates: FleetCoordinate };
    properties: { kind: "polygon" | "vertex"; index?: number };
  }>;
};

function syncSource(
  map: MapLibreMap,
  sourceId: string,
  previous: FleetFeatureCollections[keyof FleetFeatureCollections] | null,
  next: FleetFeatureCollections[keyof FleetFeatureCollections],
) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (!source) return;
  if (!previous) {
    source.setData(next);
    return;
  }

  const previousById = new Map(
    previous.features.map((feature) => [feature.id, feature]),
  );
  const nextById = new Map(next.features.map((feature) => [feature.id, feature]));
  const add = next.features.filter((feature) => !previousById.has(feature.id));
  const update: GeoJSONFeatureUpdate[] = [];
  next.features.forEach((feature) => {
    const previousFeature = previousById.get(feature.id);
    if (!previousFeature) return;

    const previousProperties = previousFeature.properties as Record<
      string,
      unknown
    >;
    const nextProperties = feature.properties as Record<string, unknown>;
    const addOrUpdateProperties = Object.entries(nextProperties)
      .filter(([key, value]) => previousProperties[key] !== value)
      .map(([key, value]) => ({ key, value }));
    const removeProperties = Object.keys(previousProperties).filter(
      (key) => !(key in nextProperties),
    );
    const geometryChanged =
      JSON.stringify(previousFeature.geometry) !==
      JSON.stringify(feature.geometry);

    if (geometryChanged || addOrUpdateProperties.length || removeProperties.length) {
      update.push({
        id: feature.id,
        ...(geometryChanged ? { newGeometry: feature.geometry } : {}),
        ...(addOrUpdateProperties.length ? { addOrUpdateProperties } : {}),
        ...(removeProperties.length ? { removeProperties } : {}),
      });
    }
  });
  const remove = previous.features
    .filter((feature) => !nextById.has(feature.id))
    .map((feature) => feature.id);
  if (add.length || update.length || remove.length) {
    source.updateData({ add, update, remove });
  }
}

function createEditorFeatureCollection(
  points: FleetCoordinate[],
): EditorFeatureCollection {
  const features: EditorFeatureCollection["features"] = points.map(
    (point, index) => ({
      type: "Feature",
      id: `editor-vertex-${index}`,
      geometry: { type: "Point", coordinates: point },
      properties: { kind: "vertex", index },
    }),
  );

  if (points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    const closed =
      first[0] === last[0] && first[1] === last[1]
        ? points
        : [...points, first];
    features.unshift({
      type: "Feature",
      id: "editor-polygon",
      geometry: { type: "Polygon", coordinates: [closed] },
      properties: { kind: "polygon" },
    });
  }

  return { type: "FeatureCollection", features };
}

function fitMapToData(
  map: MapLibreMap,
  data: FleetFeatureCollections,
  includeZones = true,
) {
  const bounds = getFleetFeatureBounds(data, includeZones);
  if (!bounds) return;
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bounds;
  if (minLongitude === maxLongitude && minLatitude === maxLatitude) {
    map.setCenter([minLongitude, minLatitude]);
    map.setZoom(14);
    return;
  }
  map.fitBounds(
    [
      [minLongitude, minLatitude],
      [maxLongitude, maxLatitude],
    ],
    { padding: 48, duration: 0 },
  );
}

function addFleetLayers(map: MapLibreMap) {
  map.addSource(sourceIds.vehicles, {
    type: "geojson",
    data: emptyData.vehicles,
  });
  map.addSource(sourceIds.routes, { type: "geojson", data: emptyData.routes });
  map.addSource(sourceIds.deliveries, {
    type: "geojson",
    data: emptyData.deliveries,
  });
  map.addSource(sourceIds.incidents, {
    type: "geojson",
    data: emptyData.incidents,
  });
  map.addSource(sourceIds.zones, { type: "geojson", data: emptyData.zones });
  map.addSource(sourceIds.heatmap, {
    type: "geojson",
    data: emptyHeatmap,
  });
  map.addSource(sourceIds.traffic, {
    type: "geojson",
    data: emptyTraffic,
  });
  map.addSource(sourceIds.editor, {
    type: "geojson",
    data: createEditorFeatureCollection([]),
  });
  map.addLayer({
    id: "fleet-routes-lines",
    source: sourceIds.routes,
    type: "line",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#b62a22",
        "#176b45",
      ],
      "line-opacity": 0.72,
      "line-width": [
        "case",
        ["boolean", ["get", "selected"], false],
        7,
        4,
      ],
    },
  });
  map.addLayer({
    id: "fleet-deliveries-pending",
    source: sourceIds.deliveries,
    type: "circle",
    filter: [
      "!in",
      "status",
      "DELIVERED",
      "NOT_DELIVERED",
      "CANCELLED",
      "PARTIALLY_REJECTED",
      "RETURNED",
    ],
    paint: {
      "circle-color": "#d69b2d",
      "circle-radius": 6,
      "circle-stroke-color": "#fff7e1",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "fleet-deliveries-completed",
    source: sourceIds.deliveries,
    type: "circle",
    filter: [
      "in",
      "status",
      "DELIVERED",
      "NOT_DELIVERED",
      "CANCELLED",
      "PARTIALLY_REJECTED",
      "RETURNED",
    ],
    paint: {
      "circle-color": "#3f7b41",
      "circle-opacity": 0.78,
      "circle-radius": 5,
      "circle-stroke-color": "#f6fff6",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "fleet-incidents-symbol",
    source: sourceIds.incidents,
    type: "symbol",
    layout: {
      "text-allow-overlap": true,
      "text-field": "!",
      "text-size": 17,
    },
    paint: {
      "text-color": "#b62a22",
      "text-halo-color": "#fff7e1",
      "text-halo-width": 2,
    },
  });
  map.addLayer({
    id: "fleet-heatmap",
    source: sourceIds.heatmap,
    type: "heatmap",
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": [
        "interpolate",
        ["linear"],
        ["get", "weight"],
        0,
        0,
        10,
        1,
      ],
      "heatmap-intensity": 1.2,
      "heatmap-radius": 28,
      "heatmap-opacity": 0.72,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(47,111,115,0)",
        0.25,
        "#2f6f73",
        0.55,
        "#d69b2d",
        0.85,
        "#b62a22",
      ],
    },
  });
  map.addLayer({
    id: "fleet-traffic-lines",
    source: sourceIds.traffic,
    type: "line",
    layout: { visibility: "none" },
    paint: {
      "line-color": [
        "match",
        ["get", "congestionLevel"],
        "LOW",
        "#3f7b41",
        "MODERATE",
        "#d69b2d",
        "HIGH",
        "#b62a22",
        "SEVERE",
        "#7d1d18",
        "#6f7b78",
      ],
      "line-opacity": 0.82,
      "line-width": 4,
    },
  });
  map.addLayer({
    id: "delivery-zones-fill",
    source: sourceIds.zones,
    type: "fill",
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#b62a22",
        ["boolean", ["get", "isActive"], true],
        "#2f6f73",
        "#6f7b78",
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["get", "isActive"], true],
        0.18,
        0.07,
      ],
    },
  });
  map.addLayer({
    id: "delivery-zones-outline",
    source: sourceIds.zones,
    type: "line",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "isActive"], true],
        "#2f6f73",
        "#6f7b78",
      ],
      "line-dasharray": [
        "case",
        ["boolean", ["get", "isActive"], true],
        ["literal", [1, 0]],
        ["literal", [2, 2]],
      ],
      "line-width": 2,
      "line-opacity": 0.82,
    },
  });
  map.addLayer({
    id: "delivery-zone-selected",
    source: sourceIds.zones,
    type: "line",
    filter: [
      "any",
      ["==", ["get", "selected"], true],
      ["==", ["get", "highlighted"], true],
    ],
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "highlighted"], false],
        "#d69b2d",
        "#b62a22",
      ],
      "line-width": 5,
      "line-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "fleet-vehicle-selected",
    source: sourceIds.vehicles,
    type: "circle",
    filter: [
      "any",
      ["==", ["get", "selected"], true],
      ["==", ["get", "highlighted"], true],
    ],
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["get", "highlighted"], false],
        "#e1ad3f",
        "#d69b2d",
      ],
      "circle-opacity": [
        "case",
        ["boolean", ["get", "highlighted"], false],
        0.16,
        0.12,
      ],
      "circle-radius": [
        "case",
        ["boolean", ["get", "highlighted"], false],
        25,
        23,
      ],
      "circle-stroke-color": [
        "case",
        ["boolean", ["get", "highlighted"], false],
        "#e1ad3f",
        "#d69b2d",
      ],
      "circle-stroke-opacity": 0.9,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "fleet-vehicle-base",
    source: sourceIds.vehicles,
    type: "circle",
    paint: {
      "circle-color": "#fff7e1",
      "circle-opacity": [
        "case",
        ["boolean", ["get", "stale"], false],
        0.72,
        1,
      ],
      "circle-radius": [
        "case",
        ["boolean", ["get", "stale"], false],
        16,
        17,
      ],
      "circle-stroke-color": [
        "case",
        ["boolean", ["get", "hasActiveIncident"], false],
        "#b62a22",
        ["boolean", ["get", "stale"], false],
        "#6f7b78",
        "#2f6f73",
      ],
      "circle-stroke-opacity": [
        "case",
        ["boolean", ["get", "stale"], false],
        0.78,
        1,
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["get", "stale"], false],
        2,
        3,
      ],
    },
  });
  map.addLayer({
    id: "fleet-vehicles-symbol",
    source: sourceIds.vehicles,
    type: "symbol",
    layout: {
      "icon-image": vehicleIconImage,
      "icon-size": 1.15,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotate": ["coalesce", ["get", "headingDegrees"], 0],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "fleet-vehicles-label",
    source: sourceIds.vehicles,
    type: "symbol",
    minzoom: 13,
    filter: ["==", ["get", "selected"], false],
    layout: {
      "text-allow-overlap": true,
      "text-field": ["get", "code"],
      "text-ignore-placement": true,
      "text-offset": [0, 1.8],
      "text-size": 11,
    },
    paint: {
      "text-color": "#1d2420",
      "text-halo-color": "#fff7e1",
      "text-halo-width": 2,
    },
  });
  map.addLayer({
    id: "fleet-vehicles-label-selected",
    source: sourceIds.vehicles,
    type: "symbol",
    filter: ["==", ["get", "selected"], true],
    layout: {
      "text-allow-overlap": true,
      "text-field": ["get", "selectedLabel"],
      "text-ignore-placement": true,
      "text-offset": [0, 1.8],
      "text-size": 11,
    },
    paint: {
      "text-color": "#1d2420",
      "text-halo-color": "#fff7e1",
      "text-halo-width": 2,
    },
  });
  map.addLayer({
    id: "delivery-zone-editor-fill",
    source: sourceIds.editor,
    type: "fill",
    filter: ["==", ["get", "kind"], "polygon"],
    paint: {
      "fill-color": "#d69b2d",
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: "delivery-zone-editor-outline",
    source: sourceIds.editor,
    type: "line",
    filter: ["==", ["get", "kind"], "polygon"],
    paint: { "line-color": "#d69b2d", "line-width": 3 },
  });
  map.addLayer({
    id: "delivery-zone-editor-vertices",
    source: sourceIds.editor,
    type: "circle",
    filter: ["==", ["get", "kind"], "vertex"],
    paint: {
      "circle-color": "#fff7e1",
      "circle-radius": 5,
      "circle-stroke-color": "#b62a22",
      "circle-stroke-width": 2,
    },
  });
}

function mapErrorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return "";

  const record = value as Record<string, unknown>;
  const nestedError = record.error;
  return [
    record.message,
    record.resourceType,
    record.sourceDataType,
    record.sourceId,
    record.url,
    nestedError instanceof Error
      ? nestedError.message
      : typeof nestedError === "string"
        ? nestedError
        : undefined,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
}

function isFatalFleetMapError(value: unknown, mapLoaded: boolean): boolean {
  const normalized = mapErrorText(value).toLowerCase();
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  const resourceDescriptor = [
    record?.resourceType,
    record?.sourceDataType,
    record?.sourceId,
    record?.url,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();

  if (
    /\b(tile|pbf|glyph|sprite)\b/.test(
      resourceDescriptor + " " + normalized,
    )
  ) {
    return false;
  }
  if (typeof record?.sourceId === "string" && record.sourceId.length > 0) {
    return false;
  }
  if (/\b(style|stylesheet)\b/.test(resourceDescriptor)) return true;

  const fatalSignal =
    normalized.includes("worker") ||
    normalized.includes("module script") ||
    normalized.includes("mime type") ||
    normalized.includes("webgl") ||
    normalized.includes("context lost") ||
    normalized.includes("canvas") ||
    normalized.includes("stylesheet") ||
    normalized.includes("failed to parse style") ||
    normalized.includes("invalid style") ||
    normalized.includes("failed to load style");

  return fatalSignal || (!mapLoaded && resourceDescriptor.length === 0);
}

export function FleetLiveMap({
  items,
  zones = [],
  showZones = true,
  selectedVehicleId,
  selectedZoneId,
  highlightedVehicleId,
  highlightedZoneId,
  editorActive = false,
  editorPoints = [],
  heatmap = null,
  showHeatmap = false,
  traffic = null,
  trafficAvailable = false,
  showTraffic = false,
  onSelectVehicle,
  onSelectZone,
  onMapPoint,
}: Props) {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLoadedRef = useRef(false);
  const hasFittedRef = useRef(false);
  const previousDataRef = useRef<FleetFeatureCollections | null>(null);
  const cameraSelectionRef = useRef<string | null>(null);
  const followedVehiclePositionRef = useRef<{
    vehicleId: string;
    coordinates: FleetCoordinate;
  } | null>(null);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const onSelectZoneRef = useRef(onSelectZone);
  const onMapPointRef = useRef(onMapPoint);
  const editorActiveRef = useRef(editorActive);
  const data = useMemo(
    () =>
      createFleetFeatureCollections(
        items,
        selectedVehicleId,
        zones,
        selectedZoneId,
        highlightedVehicleId,
        highlightedZoneId,
      ),
    [
      highlightedVehicleId,
      highlightedZoneId,
      items,
      selectedVehicleId,
      selectedZoneId,
      zones,
    ],
  );
  const editorData = useMemo(
    () => createEditorFeatureCollection(editorPoints),
    [editorPoints],
  );
  const selectedVehicle = useMemo(
    () =>
      selectedVehicleId
        ? data.vehicles.features.find(
            (feature) => feature.properties.id === selectedVehicleId,
          ) ?? null
        : null,
    [data.vehicles.features, selectedVehicleId],
  );
  const selectedVehicleLongitude = selectedVehicle?.geometry.coordinates[0] ?? null;
  const selectedVehicleLatitude = selectedVehicle?.geometry.coordinates[1] ?? null;

  useEffect(() => {
    onSelectVehicleRef.current = onSelectVehicle;
    onSelectZoneRef.current = onSelectZone;
    onMapPointRef.current = onMapPoint;
    editorActiveRef.current = editorActive;
  }, [editorActive, onMapPoint, onSelectVehicle, onSelectZone]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    async function createMap() {
      if (!containerRef.current || mapRef.current) return;
      try {
        const maplibre = await loadMapLibre();
        const container = containerRef.current;
        if (cancelled || !container) return;
        const map = new maplibre.Map({
          container,
          style: resolveMapStyle(),
          center: [-96.1342, 19.1738],
          zoom: 11,
        });
        mapRef.current = map;
        mapLoadedRef.current = false;
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            if (!cancelled) map.resize();
          });
          resizeObserver.observe(container);
        }
        map.on("error", (event) => {
          console.error("[FleetLiveMap] MapLibre error:", event);
          if (!cancelled && isFatalFleetMapError(event, mapLoadedRef.current)) {
            setMapError(true);
          }
        });
        map.on("load", () => {
          if (cancelled) return;
          try {
            addFleetLayers(map);
            map.on("click", "fleet-vehicles-symbol", (event) => {
              if (editorActiveRef.current) return;
              const vehicleId = event.features?.[0]?.id;
              if (vehicleId !== undefined && vehicleId !== null) {
                onSelectVehicleRef.current(String(vehicleId));
              }
            });
            map.on("mouseenter", "fleet-vehicles-symbol", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "fleet-vehicles-symbol", () => {
              map.getCanvas().style.cursor = "";
            });
            map.on("mouseenter", "fleet-vehicles-label", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "fleet-vehicles-label", () => {
              map.getCanvas().style.cursor = "";
            });
            map.on("mouseenter", "fleet-vehicles-label-selected", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "fleet-vehicles-label-selected", () => {
              map.getCanvas().style.cursor = "";
            });
            map.on("click", "delivery-zones-fill", (event) => {
              if (editorActiveRef.current) return;
              const feature = event.features?.[0];
              const zoneId = feature?.properties?.id ?? feature?.id;
              if (zoneId !== undefined && zoneId !== null) {
                onSelectZoneRef.current?.(String(zoneId));
              }
            });
            map.on("click", (event) => {
              if (!editorActiveRef.current || !onMapPointRef.current) return;
              onMapPointRef.current([event.lngLat.lng, event.lngLat.lat]);
            });
            map.resize();
            mapLoadedRef.current = true;
            setMapReady(true);
          } catch (error) {
            console.error("[FleetLiveMap] MapLibre error:", error);
            if (!cancelled) setMapError(true);
          }
        });
      } catch (error) {
        console.error("[FleetLiveMap] MapLibre error:", error);
        if (!cancelled) setMapError(true);
      }
    }
    void createMap();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      mapLoadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      hasFittedRef.current = false;
      previousDataRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const previous = previousDataRef.current;
    syncSource(map, sourceIds.vehicles, previous?.vehicles ?? null, data.vehicles);
    syncSource(map, sourceIds.routes, previous?.routes ?? null, data.routes);
    syncSource(
      map,
      sourceIds.deliveries,
      previous?.deliveries ?? null,
      data.deliveries,
    );
    syncSource(
      map,
      sourceIds.incidents,
      previous?.incidents ?? null,
      data.incidents,
    );
    syncSource(map, sourceIds.zones, previous?.zones ?? null, data.zones);
    const heatmapSource = map.getSource(sourceIds.heatmap) as
      | GeoJSONSource
      | undefined;
    heatmapSource?.setData(heatmap ?? emptyHeatmap);
    const trafficSource = map.getSource(sourceIds.traffic) as
      | GeoJSONSource
      | undefined;
    trafficSource?.setData(traffic ?? emptyTraffic);
    const editorSource = map.getSource(sourceIds.editor) as
      | GeoJSONSource
      | undefined;
    editorSource?.setData(editorData);
    previousDataRef.current = data;
  }, [data, editorData, heatmap, mapReady, traffic]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const visibility = showZones ? "visible" : "none";
    [
      "delivery-zones-fill",
      "delivery-zones-outline",
      "delivery-zone-selected",
    ].forEach((layerId) => map.setLayoutProperty(layerId, "visibility", visibility));
  }, [mapReady, showZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setLayoutProperty(
      "fleet-heatmap",
      "visibility",
      showHeatmap ? "visible" : "none",
    );
  }, [mapReady, showHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setLayoutProperty(
      "fleet-traffic-lines",
      "visibility",
      trafficAvailable && showTraffic ? "visible" : "none",
    );
  }, [mapReady, showTraffic, trafficAvailable]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !mapReady ||
      !map ||
      hasFittedRef.current ||
      !getFleetFeatureBounds(data, showZones)
    ) {
      return;
    }
    fitMapToData(map, data, showZones);
    hasFittedRef.current = true;
  }, [data, mapReady, showZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (
      !selectedVehicleId ||
      selectedVehicleLongitude === null ||
      selectedVehicleLatitude === null
    ) {
      cameraSelectionRef.current = null;
      followedVehiclePositionRef.current = null;
      return;
    }
    if (cameraSelectionRef.current === selectedVehicleId) return;

    const coordinates: FleetCoordinate = [
      selectedVehicleLongitude,
      selectedVehicleLatitude,
    ];
    cameraSelectionRef.current = selectedVehicleId;
    followedVehiclePositionRef.current = {
      vehicleId: selectedVehicleId,
      coordinates,
    };
    map.flyTo({
      center: coordinates,
      zoom: Math.max(map.getZoom(), 14),
      duration: 0,
    });
  }, [
    mapReady,
    selectedVehicleId,
    selectedVehicleLatitude,
    selectedVehicleLongitude,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !mapReady ||
      !map ||
      !selectedVehicleId ||
      selectedVehicleLongitude === null ||
      selectedVehicleLatitude === null
    ) {
      return;
    }

    const coordinates: FleetCoordinate = [
      selectedVehicleLongitude,
      selectedVehicleLatitude,
    ];
    const previous = followedVehiclePositionRef.current;
    if (!previous || previous.vehicleId !== selectedVehicleId) {
      followedVehiclePositionRef.current = {
        vehicleId: selectedVehicleId,
        coordinates,
      };
      return;
    }
    if (
      previous.coordinates[0] === coordinates[0] &&
      previous.coordinates[1] === coordinates[1]
    ) {
      return;
    }

    map.easeTo({ center: coordinates });
    followedVehiclePositionRef.current = {
      vehicleId: selectedVehicleId,
      coordinates,
    };
  }, [
    mapReady,
    selectedVehicleId,
    selectedVehicleLatitude,
    selectedVehicleLongitude,
  ]);

  const centerFleet = () => {
    const map = mapRef.current;
    if (map) fitMapToData(map, data, false);
  };

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[#dfe8df]">
      <div
        ref={containerRef}
        aria-label="Mapa de monitoreo de flota"
        className="h-full min-h-[34rem] w-full"
      />
      <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <button
          className="rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs font-black text-[var(--erp-foreground)] shadow-lg transition hover:bg-white"
          onClick={centerFleet}
          type="button"
        >
          Centrar en flota
        </button>
        <span className="rounded-xl border border-white/60 bg-white/90 px-3 py-2 text-xs font-bold text-[var(--erp-muted-foreground)] shadow-lg">
          {items.length} unidad{items.length === 1 ? "" : "es"} visibles
        </span>
      </div>
      {editorActive && (
        <div className="absolute bottom-4 left-4 z-10 max-w-xs rounded-xl border border-white/70 bg-[var(--erp-charcoal)]/95 px-3 py-2 text-xs font-bold text-white shadow-lg">
          Haz clic en el mapa para agregar vértices. Se requieren al menos 3 vértices distintos.
          <span className="ml-1 text-[var(--erp-brand-gold-soft)]">{editorPoints.length} capturados</span>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/85 p-6 text-center">
          <p className="max-w-sm text-sm font-bold text-[var(--erp-danger)]">
            El mapa no está disponible. La lista de unidades sigue mostrando el snapshot autorizado.
          </p>
        </div>
      )}
    </div>
  );
}
