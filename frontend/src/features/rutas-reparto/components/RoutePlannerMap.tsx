import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  DeliveryRoutePlan,
  GeoJsonLineString,
  PlannerLocation,
  RoutePlanStopInput,
} from "../types";
import { resolveMapStyle } from "@/lib/maps/mapConfig";
import {
  animateRouteLine,
  routeGeometryRevision,
  routeLengthMeters,
  sampleDirectionMarkers,
} from "./routeGeometry";
import {
  RouteStopInfoMarker,
  type RouteStopDisplay,
} from "./RouteStopInfoMarker";
import { selectedRouteSegment } from "./routeStopMetrics";

type Props = {
  activeSaleId?: string;
  origin?: PlannerLocation;
  plan?: DeliveryRoutePlan | null;
  stops: RouteStopDisplay[];
  onMoveStop: (saleId: string, latitude: number, longitude: number) => void;
  onSelectStop: (saleId: string) => void;
};

type LngLat = [number, number];
type LineGeometry = {
  type: "LineString";
  coordinates: LngLat[];
};
type LineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: LineGeometry;
    properties: Record<string, never>;
  }>;
};
type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: LngLat };
  properties: { bearing: number };
};
type PointFeatureCollection = {
  type: "FeatureCollection";
  features: PointFeature[];
};
type ManagedMarker = {
  marker: MapLibreMarker;
  root: Root;
  element: HTMLDivElement;
  onMove?: (latitude: number, longitude: number) => void;
};
type MarkerDefinition = {
  key: string;
  stop: RouteStopDisplay | RoutePlanStopInput;
  index: number;
  latitude: number;
  longitude: number;
  durationSeconds?: number;
  distanceMeters?: number;
  cumulativeDurationSeconds?: number;
  cumulativeDistanceMeters?: number;
  isOrigin: boolean;
  isDestination: boolean;
  isSelected: boolean;
  showInfo: boolean;
  visualOffset: { x: number; y: number };
};

const fallbackCenter: LngLat = [-96.1342, 19.1738];
const routeSourceId = "route-plan";
const routeLayerId = "route-plan-line";
const selectedSegmentSourceId = "route-selected-segment";
const selectedSegmentLayerId = "route-selected-segment-line";
const directionSourceId = "route-direction-markers";
const directionLayerId = "route-direction-markers-symbol";
const emptyLine: LineFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const emptyDirections: PointFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function asLngLat(latitude: number, longitude: number): LngLat {
  return [longitude, latitude];
}

function asLineData(
  geometry?: GeoJsonLineString | null,
): LineFeatureCollection {
  if (!geometry) return emptyLine;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: geometry.coordinates },
        properties: {},
      },
    ],
  };
}

function asDirectionsData(
  geometry: GeoJsonLineString | null | undefined,
): PointFeatureCollection {
  if (!geometry) return emptyDirections;

  const totalDistance = routeLengthMeters(geometry);
  const spacing = Math.min(1_800, Math.max(350, totalDistance / 6));
  return {
    type: "FeatureCollection",
    features: sampleDirectionMarkers(geometry, spacing).map((arrow) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: asLngLat(arrow.latitude, arrow.longitude),
      },
      properties: { bearing: arrow.bearing },
    })),
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function addMapLayers(map: MapLibreMap) {
  map.addSource(routeSourceId, {
    type: "geojson",
    data: emptyLine,
    lineMetrics: true,
  });
  map.addSource(selectedSegmentSourceId, {
    type: "geojson",
    data: emptyLine,
  });
  map.addSource(directionSourceId, {
    type: "geojson",
    data: emptyDirections,
  });
  map.addLayer({
    id: routeLayerId,
    source: routeSourceId,
    type: "line",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#b62a22",
      "line-opacity": 0.88,
      "line-opacity-transition": { duration: 1100, delay: 0 },
      "line-width": 6,
    },
  });
  map.addLayer({
    id: selectedSegmentLayerId,
    source: selectedSegmentSourceId,
    type: "line",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#176b45",
      "line-opacity": 0.95,
      "line-width": 9,
    },
  });
  map.addLayer({
    id: directionLayerId,
    source: directionSourceId,
    type: "symbol",
    layout: {
      "text-allow-overlap": true,
      "text-field": "▲",
      "text-ignore-placement": true,
      "text-rotate": ["get", "bearing"],
      "text-rotation-alignment": "map",
      "text-size": 18,
    },
    paint: {
      "text-color": "#f0c56a",
      "text-halo-color": "#1d2420",
      "text-halo-width": 1,
    },
  });
}

function updateGeoJsonSource(
  map: MapLibreMap,
  sourceId: string,
  data: LineFeatureCollection | PointFeatureCollection,
) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function fitMapToPoints(map: MapLibreMap, points: LngLat[]) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(14);
    return;
  }

  const bounds = points.reduce(
    ([minLongitude, minLatitude, maxLongitude, maxLatitude], [longitude, latitude]) => [
      Math.min(minLongitude, longitude),
      Math.min(minLatitude, latitude),
      Math.max(maxLongitude, longitude),
      Math.max(maxLatitude, latitude),
    ],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
  );
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 42, duration: prefersReducedMotion() ? 0 : 500 },
  );
}

export function RoutePlannerMap({
  activeSaleId,
  origin,
  plan,
  stops,
  onMoveStop,
  onSelectStop,
}: Props) {
  const [showStopInfo, setShowStopInfo] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markerRefs = useRef(new Map<string, ManagedMarker>());
  const activeSaleIdRef = useRef(activeSaleId);
  const onMoveStopRef = useRef(onMoveStop);
  const onSelectStopRef = useRef(onSelectStop);

  useEffect(() => {
    activeSaleIdRef.current = activeSaleId;
    onMoveStopRef.current = onMoveStop;
    onSelectStopRef.current = onSelectStop;
  }, [activeSaleId, onMoveStop, onSelectStop]);

  const originPoint = useMemo(
    () =>
      origin?.latitude != null && origin?.longitude != null
        ? ([Number(origin.latitude), Number(origin.longitude)] as [
            number,
            number,
          ])
        : undefined,
    [origin],
  );
  const initialCenterRef = useRef<LngLat>(
    originPoint
      ? asLngLat(originPoint[0], originPoint[1])
      : fallbackCenter,
  );
  const fitPoints = useMemo(
    () =>
      [
        originPoint ? asLngLat(originPoint[0], originPoint[1]) : undefined,
        ...stops
          .filter(
            (stop) =>
              Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude),
          )
          .map((stop) => asLngLat(stop.latitude, stop.longitude)),
      ].filter(Boolean) as LngLat[],
    [originPoint, stops],
  );
  const selectedSegment = useMemo(
    () =>
      plan && activeSaleId
        ? selectedRouteSegment(plan, activeSaleId, originPoint)
        : null,
    [activeSaleId, originPoint, plan],
  );
  const plannedBySale = useMemo(
    () =>
      new Map((plan?.orderedStops ?? []).map((stop) => [stop.saleId, stop])),
    [plan],
  );
  const cumulativeBySale = useMemo(() => {
    const ordered = [...(plan?.orderedStops ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    );
    return new Map(
      ordered.map((stop, index) => [
        stop.saleId,
        ordered.slice(0, index + 1).reduce(
          (total, item) => ({
            distance: total.distance + item.legDistanceMeters,
            duration: total.duration + item.legDurationSeconds,
          }),
          { distance: 0, duration: 0 },
        ),
      ]),
    );
  }, [plan]);
  const visualOffsets = useMemo(
    () =>
      stops.map((stop, index) => {
        const nearbyBefore = stops
          .slice(0, index)
          .filter(
            (candidate) =>
              Math.abs(candidate.latitude - stop.latitude) < 0.00018 &&
              Math.abs(candidate.longitude - stop.longitude) < 0.00018,
          ).length;
        if (!nearbyBefore) return { x: 0, y: 0 };
        const angle = nearbyBefore * 2.4;
        return {
          x: Math.round(Math.cos(angle) * 22),
          y: Math.round(Math.sin(angle) * 18),
        };
      }),
    [stops],
  );
  const geometryRevision = plan?.geometry
    ? routeGeometryRevision(plan.geometry)
    : "empty";

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    let disposed = false;
    let map: MapLibreMap | null = null;
    let handleLoad: (() => void) | undefined;
    let handleClick: ((event: MapMouseEvent) => void) | undefined;
    const markers = markerRefs.current;

    void import("maplibre-gl")
      .then((maplibre) => {
        if (disposed) return;

        maplibreRef.current = maplibre;
        map = new maplibre.Map({
          attributionControl: false,
          center: initialCenterRef.current,
          container,
          style: resolveMapStyle(),
          zoom: 12,
        });
        handleLoad = () => {
          if (!map) return;
          addMapLayers(map);
          map.addControl(new maplibre.AttributionControl(), "bottom-right");
          setMapReady(true);
        };
        handleClick = (event) => {
          const saleId = activeSaleIdRef.current;
          if (saleId) {
            onMoveStopRef.current(saleId, event.lngLat.lat, event.lngLat.lng);
          }
        };
        mapRef.current = map;
        map.on("load", handleLoad);
        map.on("click", handleClick);
      })
      .catch(() => {
        if (!disposed) setMapLoadError(true);
      });

    return () => {
      disposed = true;
      markers.forEach(({ marker, root }) => {
        root.unmount();
        marker.remove();
      });
      markers.clear();
      if (map && handleLoad && handleClick) {
        map.off("load", handleLoad);
        map.off("click", handleClick);
        map.remove();
      }
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    updateGeoJsonSource(mapRef.current, routeSourceId, asLineData(plan?.geometry));
    updateGeoJsonSource(
      mapRef.current,
      selectedSegmentSourceId,
      asLineData(selectedSegment),
    );
    updateGeoJsonSource(
      mapRef.current,
      directionSourceId,
      asDirectionsData(plan?.geometry),
    );
  }, [mapReady, plan?.geometry, selectedSegment]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    return animateRouteLine(
      mapRef.current,
      prefersReducedMotion(),
      Boolean(plan?.geometry),
    );
  }, [geometryRevision, mapReady, plan?.geometry]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    fitMapToPoints(mapRef.current, fitPoints);
  }, [fitPoints, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!maplibre) return;
    const expectedKeys = new Set<string>();
    const originStop: RoutePlanStopInput = {
      saleId: "route-origin",
      deliveryAddress: origin?.address ?? origin?.name ?? "Origen",
      latitude: originPoint?.[0] ?? 0,
      longitude: originPoint?.[1] ?? 0,
    };

    const markerDefinitions: MarkerDefinition[] = [
      ...(originPoint
        ? [
            {
              key: "route-origin",
              stop: originStop,
              index: 0,
              latitude: originPoint[0],
              longitude: originPoint[1],
              isOrigin: true,
              isDestination: false,
              isSelected: false,
              showInfo: false,
              visualOffset: { x: 0, y: 0 },
            },
          ]
        : []),
      ...stops.map((stop, index) => {
        const planned = plannedBySale.get(stop.saleId);
        const cumulative = cumulativeBySale.get(stop.saleId);
        const displayIndex = planned?.sequence ?? index + 1;
        return {
          key: stop.saleId,
          stop,
          index: displayIndex,
          latitude: stop.latitude,
          longitude: stop.longitude,
          durationSeconds: planned?.legDurationSeconds,
          distanceMeters: planned?.legDistanceMeters,
          cumulativeDurationSeconds: cumulative?.duration,
          cumulativeDistanceMeters: cumulative?.distance,
          isOrigin: false,
          isDestination: displayIndex === plan?.orderedStops.length,
          isSelected: activeSaleId === stop.saleId,
          showInfo: showStopInfo,
          visualOffset: visualOffsets[index],
        };
      }),
    ];

    markerDefinitions.forEach((definition) => {
      expectedKeys.add(definition.key);
      let managed = markerRefs.current.get(definition.key);
      if (!managed) {
        const element = document.createElement("div");
        element.className = "route-stop-marker";
        element.dataset.markerId = definition.key;
        const root = createRoot(element);
        const marker = new maplibre.Marker({
          anchor: "bottom",
          draggable: !definition.isOrigin,
          element,
        })
          .setLngLat(asLngLat(definition.latitude, definition.longitude))
          .addTo(map);
        managed = { marker, root, element };
        if (!definition.isOrigin) {
          managed.onMove = (latitude, longitude) =>
            onMoveStopRef.current(definition.key, latitude, longitude);
          marker.on("dragend", () => {
            const point = marker.getLngLat();
            managed?.onMove?.(point.lat, point.lng);
          });
        }
        markerRefs.current.set(definition.key, managed);
      }
      managed.marker.setLngLat(
        asLngLat(definition.latitude, definition.longitude),
      );
      managed.marker.setDraggable(!definition.isOrigin);
      flushSync(() => {
        managed.root.render(
          <RouteStopInfoMarker
            cumulativeDistanceMeters={definition.cumulativeDistanceMeters}
            cumulativeDurationSeconds={definition.cumulativeDurationSeconds}
            distanceMeters={definition.distanceMeters}
            durationSeconds={definition.durationSeconds}
            index={definition.index}
            isDestination={definition.isDestination}
            isOrigin={definition.isOrigin}
            isSelected={definition.isSelected}
            key={definition.key}
            latitude={definition.latitude}
            longitude={definition.longitude}
            onMove={(latitude, longitude) =>
              onMoveStopRef.current(definition.key, latitude, longitude)
            }
            onSelect={
              definition.isOrigin
                ? undefined
                : () => onSelectStopRef.current(definition.key)
            }
            showInfo={definition.showInfo}
            stop={definition.stop}
            visualOffset={definition.visualOffset}
          />,
        );
      });
    });

    markerRefs.current.forEach((managed, key) => {
      if (expectedKeys.has(key)) return;
      managed.root.unmount();
      managed.marker.remove();
      markerRefs.current.delete(key);
    });
  }, [
    activeSaleId,
    cumulativeBySale,
    mapReady,
    origin,
    originPoint,
    plan?.orderedStops.length,
    plannedBySale,
    showStopInfo,
    stops,
    visualOffsets,
  ]);

  return (
    <div
      className="route-planner-map relative z-0 isolate h-[34rem] min-h-[420px] overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]"
      aria-label="Mapa para planificar la ruta"
    >
      <button
        aria-pressed={showStopInfo}
        className="absolute right-4 top-4 z-[500] rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs font-black text-[var(--erp-foreground)] shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]"
        onClick={() => setShowStopInfo((current) => !current)}
        type="button"
      >
        {showStopInfo ? "Ocultar tiempos" : "Mostrar tiempos"}
      </button>
      <div ref={mapContainerRef} className="h-full w-full" />
      {mapLoadError && (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-[#dce5df]/90 p-6 text-center text-sm font-bold text-[var(--erp-foreground)]"
          role="alert"
        >
          No fue posible cargar el mapa. La planeación continúa disponible en
          la lista de paradas.
        </div>
      )}
      <style>{`.route-planner-map .maplibregl-canvas{outline:none}.route-planner-map .maplibregl-ctrl-attrib{font-size:10px}.route-stop-marker{pointer-events:auto;width:max-content}.route-stop-info{display:flex;flex-direction:column;align-items:center;gap:5px;width:max-content;min-width:56px}.route-stop-card{position:relative;display:grid;min-width:76px;padding:7px 10px 8px;border-radius:11px;background:var(--route-stop-tone);color:#fff;text-align:center;font:700 12px/1.15 ui-sans-serif,system-ui;box-shadow:0 7px 18px rgba(15,23,42,.24);transition:transform .15s ease}.route-stop-card__duration{font-size:15px}.route-stop-card i{position:absolute;bottom:-6px;left:50%;width:12px;height:12px;background:var(--route-stop-tone);transform:translateX(-50%) rotate(45deg)}.route-stop-dot{display:grid;width:34px;height:34px;place-items:center;border:3px solid #fff;border-radius:999px;background:var(--route-stop-tone);color:#fff;font:900 13px ui-sans-serif,system-ui;box-shadow:0 5px 14px rgba(15,23,42,.25)}.route-stop-info.is-selected .route-stop-dot{outline:4px solid rgba(255,255,255,.72);transform:scale(1.08)}.route-stop-card__details{position:absolute;left:50%;bottom:calc(100% + 8px);display:none;width:190px;transform:translateX(-50%);gap:3px;padding:10px;border-radius:10px;background:#17211d;color:#fff;text-align:left;font-size:11px;box-shadow:0 10px 26px rgba(15,23,42,.3)}.route-stop-card__details span,.route-stop-card__details strong{display:block}.route-stop-card:hover .route-stop-card__details,.route-stop-card:focus-within .route-stop-card__details,.route-stop-info.is-selected .route-stop-card__details{display:grid}.route-stop-info:focus-visible{outline:3px solid #2563a8;outline-offset:3px;border-radius:12px}@media(max-width:640px){.route-stop-card{min-width:68px;padding:6px 8px;font-size:11px}.route-stop-card__duration{font-size:13px}.route-stop-card__details{width:160px}}@media(prefers-reduced-motion:reduce){.route-stop-card,.route-stop-dot{transition:none!important}}`}</style>
    </div>
  );
}
