import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { resolveMapStyle } from "@/lib/maps/mapConfig";
import { loadMapLibre } from "@/lib/maps/mapLibreRuntime";
import type {
  DeliveryOrder,
  GeoJsonLineString,
  RouteLocationPosition,
} from "../types";

type RouteMapOrder = Omit<
  Pick<
    DeliveryOrder,
    | "id"
    | "latitude"
    | "longitude"
    | "stopSequence"
    | "customerName"
    | "deliveryAddress"
  >,
  "id"
> & { id?: string };

type Props = {
  compact?: boolean;
  currentOrder?: RouteMapOrder;
  currentLocation?: RouteLocationPosition | null;
  geometry: GeoJsonLineString;
  orders?: RouteMapOrder[];
  routeName: string;
};

type LngLat = [number, number];
type MarkerDefinition = {
  current: boolean;
  key: string;
  label: string;
  location: boolean;
  origin: boolean;
  position: LngLat;
  title: string;
};

const fallbackCenter: LngLat = [-96.1342, 19.1738];
const routeSourceId = "driver-route";
const routeLayerId = "driver-route-line";

function isRenderableGeometry(geometry: GeoJsonLineString) {
  return (
    geometry.type === "LineString" &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(
      (coordinate) =>
        coordinate.length === 2 && coordinate.every(Number.isFinite),
    )
  );
}

function isLocatedOrder(order: RouteMapOrder) {
  return (
    order.latitude != null &&
    order.longitude != null &&
    Number.isFinite(order.latitude) &&
    Number.isFinite(order.longitude)
  );
}

function isLocatedPosition(
  position?: RouteLocationPosition | null,
): position is RouteLocationPosition {
  return Boolean(
    position &&
      Number.isFinite(position.latitude) &&
      Number.isFinite(position.longitude),
  );
}

function isSameOrder(order: RouteMapOrder, currentOrder: RouteMapOrder) {
  if (order.id && currentOrder.id) return order.id === currentOrder.id;
  return (
    order.latitude === currentOrder.latitude &&
    order.longitude === currentOrder.longitude &&
    order.stopSequence === currentOrder.stopSequence
  );
}

function geometryBounds(geometry: GeoJsonLineString): [LngLat, LngLat] {
  const bounds = geometry.coordinates.reduce(
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

  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}

function fitMapToGeometry(
  map: MapLibreMap,
  geometry: GeoJsonLineString,
  compact: boolean,
) {
  map.fitBounds(geometryBounds(geometry), {
    duration: 0,
    padding: compact ? 28 : 44,
  });
}

function createMarkerElement({
  current,
  label,
  location,
  origin,
  title,
}: Omit<MarkerDefinition, "key" | "position">) {
  const element = document.createElement("div");
  element.className = "driver-route-pin";
  element.dataset.marker = title;
  element.dataset.markerKind = location
    ? "location"
    : origin
      ? "origin"
      : current
        ? "current"
        : "order";
  element.setAttribute("aria-label", title);
  element.title = title;

  const pin = document.createElement("span");
  pin.style.cssText = [
    "display:grid",
    "place-items:center",
    "width:34px",
    "height:34px",
    `border:${current ? "4px solid #f0c56a" : "3px solid white"}`,
    "border-radius:50% 50% 50% 12%",
    "transform:rotate(-45deg)",
    `background:${location ? "#2f6f73" : origin ? "#1d2420" : "#b62a22"}`,
    `color:${location || origin ? "#f0c56a" : "#fff"}`,
    "box-shadow:0 8px 22px rgba(29,36,32,.28)",
  ].join(";");

  const text = document.createElement("b");
  text.textContent = label;
  text.style.cssText = "transform:rotate(45deg);font:800 12px system-ui";
  pin.append(text);
  element.append(pin);
  return element;
}

function clearMarkers(markers: Map<string, MapLibreMarker>) {
  markers.forEach((marker) => marker.remove());
  markers.clear();
}

export function DriverRouteMap({
  compact = false,
  currentLocation,
  currentOrder,
  geometry,
  orders = [],
  routeName,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markerRefs = useRef(new Map<string, MapLibreMarker>());
  const geometryRef = useRef(geometry);
  const compactRef = useRef(compact);
  const initialCenterRef = useRef<LngLat>(
    geometry.coordinates[0]
      ? [geometry.coordinates[0][0], geometry.coordinates[0][1]]
      : fallbackCenter,
  );
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);

  useEffect(() => {
    geometryRef.current = geometry;
    compactRef.current = compact;
  }, [compact, geometry]);

  const mappedCurrentOrder = useMemo(
    () => (currentOrder && isLocatedOrder(currentOrder) ? currentOrder : null),
    [currentOrder],
  );
  const mappedOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          isLocatedOrder(order) &&
          (!mappedCurrentOrder || !isSameOrder(order, mappedCurrentOrder)),
      ),
    [mappedCurrentOrder, orders],
  );
  const markerDefinitions = useMemo<MarkerDefinition[]>(() => {
    const origin = geometry.coordinates[0];
    const definitions: MarkerDefinition[] = origin
      ? [
          {
            current: false,
            key: "driver-route-origin",
            label: "O",
            location: false,
            origin: true,
            position: [origin[0], origin[1]],
            title: "Origen y regreso",
          },
        ]
      : [];

    mappedOrders.forEach((order, index) => {
      const sequence = order.stopSequence ?? index + 1;
      definitions.push({
        current: false,
        key:
          order.id ??
          `${order.latitude}-${order.longitude}-${order.stopSequence ?? index}`,
        label: String(sequence),
        location: false,
        origin: false,
        position: [Number(order.longitude), Number(order.latitude)],
        title: `Parada ${sequence}: ${order.customerName ?? order.deliveryAddress ?? "Entrega"}`,
      });
    });

    if (mappedCurrentOrder) {
      const sequence = mappedCurrentOrder.stopSequence ?? "asignada";
      definitions.push({
        current: true,
        key: `driver-route-current-${mappedCurrentOrder.id ?? `${mappedCurrentOrder.latitude}-${mappedCurrentOrder.longitude}-${mappedCurrentOrder.stopSequence ?? "current"}`}`,
        label: String(sequence),
        location: false,
        origin: false,
        position: [
          Number(mappedCurrentOrder.longitude),
          Number(mappedCurrentOrder.latitude),
        ],
        title: `Pedido actual · Parada ${sequence}`,
      });
    }

    if (isLocatedPosition(currentLocation)) {
      definitions.push({
        current: false,
        key: "driver-route-current-location",
        label: "GPS",
        location: true,
        origin: false,
        position: [currentLocation.longitude, currentLocation.latitude],
        title: "Última ubicación GPS publicada",
      });
    }

    return definitions;
  }, [currentLocation, geometry.coordinates, mappedCurrentOrder, mappedOrders]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    let disposed = false;
    let map: MapLibreMap | null = null;
    let handleLoad: (() => void) | undefined;

    void loadMapLibre()
      .then((maplibre) => {
        if (disposed) return;

        maplibreRef.current = maplibre;
        map = new maplibre.Map({
          attributionControl: false,
          center: initialCenterRef.current,
          container,
          scrollZoom: !compactRef.current,
          style: resolveMapStyle(),
          zoom: 12,
        });
        mapRef.current = map;
        handleLoad = () => {
          if (!map) return;
          map.addSource(routeSourceId, {
            data: geometryRef.current,
            type: "geojson",
          });
          map.addLayer({
            id: routeLayerId,
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#b62a22",
              "line-opacity": 0.88,
              "line-width": 6,
            },
            source: routeSourceId,
            type: "line",
          });
          map.addControl(new maplibre.AttributionControl(), "bottom-right");
          setMapReady(true);
        };
        map.on("load", handleLoad);
      })
      .catch(() => {
        if (!disposed) setMapLoadError(true);
      });

    const markers = markerRefs.current;
    return () => {
      disposed = true;
      clearMarkers(markers);
      if (map && handleLoad) {
        map.off("load", handleLoad);
        map.remove();
      }
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    if (compact) map.scrollZoom.disable();
    else map.scrollZoom.enable();

    const source = map.getSource(routeSourceId) as
      | GeoJSONSource
      | undefined;
    source?.setData(geometry);
    fitMapToGeometry(map, geometry, compact);
  }, [compact, geometry, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !maplibreRef.current) return;

    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    const markers = markerRefs.current;
    clearMarkers(markers);

    markerDefinitions.forEach((definition) => {
      const marker = new maplibre.Marker({
        anchor: "bottom",
        element: createMarkerElement(definition),
      })
        .setLngLat(definition.position)
        .addTo(map);
      markers.set(definition.key, marker);
    });

    return () => clearMarkers(markers);
  }, [mapReady, markerDefinitions]);

  if (!isRenderableGeometry(geometry)) return null;

  return (
    <div
      aria-label={`Mapa de ${routeName}`}
      className={`${compact ? "h-64 min-h-[256px]" : "h-[28rem] min-h-[360px]"} relative z-0 isolate overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]`}
      data-scroll={String(!compact)}
      data-scroll-wheel-zoom={String(!compact)}
    >
      <div ref={mapContainerRef} className="h-full w-full" />
      {mapLoadError && (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-[#dce5df]/90 p-6 text-center text-sm font-bold text-[var(--erp-foreground)]"
          role="alert"
        >
          No fue posible cargar el mapa. La secuencia continúa disponible en
          la lista de pedidos.
        </div>
      )}
    </div>
  );
}
