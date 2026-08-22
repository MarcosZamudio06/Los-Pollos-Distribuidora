import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import type {
  EaseToOptions,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { resolveMapStyle } from "@/lib/maps/mapConfig";
import { loadMapLibre } from "@/lib/maps/mapLibreRuntime";
import type {
  DriverNavigationTarget,
  GeoJsonLineString,
  RouteLocationPosition,
} from "../../rutas-reparto/types";

const navigationSourceId = "driver-navigation-geometry";
const navigationCasingLayerId = "driver-navigation-geometry-casing";
const navigationLayerId = "driver-navigation-geometry-line";
const fallbackCenter: LngLat = [-96.1342, 19.1738];

type LngLat = [number, number];

export type DriverNavigationMapHandle = {
  overview: () => void;
  recenter: () => void;
};

export type DriverNavigationMapProps = {
  className?: string;
  currentLocation?: RouteLocationPosition | null;
  destination?: DriverNavigationTarget | null;
  follow?: boolean;
  geometry?: GeoJsonLineString | null;
  lowAccuracy?: boolean;
  onMapClick?: () => void;
  onFollowInterrupted?: () => void;
  routeName: string;
};

function isLocatedPosition(
  position?: RouteLocationPosition | null,
): position is RouteLocationPosition {
  return Boolean(
    position &&
      Number.isFinite(position.latitude) &&
      Number.isFinite(position.longitude),
  );
}

function isLocatedTarget(
  target?: DriverNavigationTarget | null,
): target is DriverNavigationTarget {
  return Boolean(
    target &&
      Number.isFinite(target.latitude) &&
      Number.isFinite(target.longitude),
  );
}

function isRenderableGeometry(
  geometry?: GeoJsonLineString | null,
): geometry is GeoJsonLineString {
  return Boolean(
    geometry?.type === "LineString" &&
      geometry.coordinates.length >= 2 &&
      geometry.coordinates.every(
        ([longitude, latitude]) =>
          Number.isFinite(longitude) && Number.isFinite(latitude),
      ),
  );
}

function pointsBounds(points: LngLat[]): [LngLat, LngLat] {
  const bounds = points.reduce(
    (
      [minLongitude, minLatitude, maxLongitude, maxLatitude],
      [longitude, latitude],
    ) => [
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

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function followDriver(
  map: MapLibreMap,
  position: RouteLocationPosition,
  animate: boolean,
) {
  const camera: EaseToOptions = {
    center: [position.longitude, position.latitude],
    duration: animate && !prefersReducedMotion() ? 280 : 0,
    pitch: 35,
    zoom: 16.2,
  };
  if (
    typeof position.headingDegrees === "number" &&
    Number.isFinite(position.headingDegrees)
  ) {
    camera.bearing =
      ((position.headingDegrees % 360) + 360) % 360;
  }
  map.easeTo(camera);
}

function createDriverMarkerElement() {
  const element = document.createElement("div");
  element.className = "driver-navigation-driver-marker";
  element.dataset.marker = "driver-navigation";
  element.setAttribute("aria-label", "Ubicación actual del conductor");
  element.style.cssText =
    "position:relative;width:48px;height:48px;display:grid;place-items:center;pointer-events:none";

  const halo = document.createElement("span");
  halo.dataset.markerRole = "accuracy-halo";
  halo.style.cssText =
    "position:absolute;inset:4px;border:1px solid rgba(240,197,106,.52);border-radius:999px;background:rgba(240,197,106,.12);opacity:.55";

  const arrow = document.createElement("span");
  arrow.dataset.markerRole = "heading-arrow";
  arrow.style.cssText =
    "position:relative;z-index:1;width:28px;height:34px;display:block;transform:rotate(0deg);filter:drop-shadow(0 5px 8px rgba(17,24,21,.38));transition:transform 180ms ease-out";
  arrow.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 28 34" width="28" height="34" fill="none"><path d="M14 2 25 28l-11-5-11 5L14 2Z" fill="#f0c56a" stroke="#17201b" stroke-width="2.25" stroke-linejoin="round"/><path d="M14 8v13" stroke="#17201b" stroke-width="2" stroke-linecap="round"/></svg>';

  element.append(halo, arrow);
  return element;
}

function createDestinationMarkerElement(target: DriverNavigationTarget) {
  const element = document.createElement("div");
  element.className = "driver-navigation-destination-marker";
  element.dataset.marker = "destination";
  element.setAttribute("aria-label", `Destino: ${target.label}`);
  element.title = target.label;
  element.style.cssText =
    "width:42px;height:48px;display:grid;place-items:center;pointer-events:none";
  element.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 42 48" width="42" height="48" fill="none"><path d="M21 2C11.6 2 4 9.4 4 18.6 4 31 21 46 21 46s17-15 17-27.4C38 9.4 30.4 2 21 2Z" fill="#b62a22" stroke="#fff" stroke-width="2.5"/><circle cx="21" cy="18.5" r="6" fill="#fff"/><path d="M21 13.5v10M16 18.5h10" stroke="#b62a22" stroke-width="2" stroke-linecap="round"/></svg>';
  return element;
}

function setDriverMarkerState(
  marker: MapLibreMarker,
  position: RouteLocationPosition,
  lowAccuracy: boolean,
) {
  marker.setLngLat([position.longitude, position.latitude]);
  const element = marker.getElement();
  const arrow = element.querySelector<HTMLElement>(
    '[data-marker-role="heading-arrow"]',
  );
  const halo = element.querySelector<HTMLElement>(
    '[data-marker-role="accuracy-halo"]',
  );
  if (arrow) {
    arrow.style.transform = `rotate(${position.headingDegrees ?? 0}deg)`;
  }
  if (halo) {
    halo.style.opacity = lowAccuracy ? "0.82" : "0.45";
    halo.style.transform = lowAccuracy ? "scale(1.16)" : "scale(1)";
  }
  element.dataset.lowAccuracy = String(lowAccuracy);
}

function ensureNavigationGeometry(
  map: MapLibreMap,
  geometry: GeoJsonLineString | null | undefined,
) {
  if (!isRenderableGeometry(geometry)) return;
  const source = map.getSource(navigationSourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(geometry);
    return;
  }
  map.addSource(navigationSourceId, { type: "geojson", data: geometry });
  map.addLayer({
    id: navigationCasingLayerId,
    type: "line",
    source: navigationSourceId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#17201b",
      "line-opacity": 0.66,
      "line-width": 10,
    },
  });
  map.addLayer({
    id: navigationLayerId,
    type: "line",
    source: navigationSourceId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f0c56a",
      "line-opacity": 0.98,
      "line-width": 6,
    },
  });
}

function mapPoints(
  geometry: GeoJsonLineString | null | undefined,
  currentLocation: RouteLocationPosition | null | undefined,
  destination: DriverNavigationTarget | null | undefined,
) {
  return [
    ...(isRenderableGeometry(geometry) ? geometry.coordinates : []),
    ...(isLocatedPosition(currentLocation)
      ? [[currentLocation.longitude, currentLocation.latitude] as LngLat]
      : []),
    ...(isLocatedTarget(destination)
      ? [[destination.longitude, destination.latitude] as LngLat]
      : []),
  ];
}

export const DriverNavigationMap = forwardRef(function DriverNavigationMap(
  {
    className = "",
    currentLocation,
    destination,
    follow = true,
    geometry,
    lowAccuracy = false,
    onMapClick,
    onFollowInterrupted,
    routeName,
  }: DriverNavigationMapProps,
  forwardedRef: ForwardedRef<DriverNavigationMapHandle>,
) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const driverMarkerRef = useRef<MapLibreMarker | null>(null);
  const destinationMarkerRef = useRef<MapLibreMarker | null>(null);
  const initialCenterRef = useRef<LngLat>(
    isLocatedPosition(currentLocation)
      ? [currentLocation.longitude, currentLocation.latitude]
      : isLocatedTarget(destination)
        ? [destination.longitude, destination.latitude]
        : geometry?.coordinates[0]
          ? [geometry.coordinates[0][0], geometry.coordinates[0][1]]
          : fallbackCenter,
  );
  const geometryRef = useRef(geometry);
  const currentLocationRef = useRef(currentLocation);
  const destinationRef = useRef(destination);
  const onFollowInterruptedRef = useRef(onFollowInterrupted);
  const onMapClickRef = useRef(onMapClick);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);

  useEffect(() => {
    geometryRef.current = geometry;
    currentLocationRef.current = currentLocation;
    destinationRef.current = destination;
  }, [currentLocation, destination, geometry]);

  useEffect(() => {
    onFollowInterruptedRef.current = onFollowInterrupted;
    onMapClickRef.current = onMapClick;
  }, [onFollowInterrupted, onMapClick]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      overview: () => {
        const map = mapRef.current;
        if (!map) return;
        const points = mapPoints(
          geometryRef.current,
          currentLocationRef.current,
          destinationRef.current,
        );
        if (points.length >= 2) {
          map.fitBounds(pointsBounds(points), {
            duration: prefersReducedMotion() ? 0 : 360,
            padding: { top: 180, right: 72, bottom: 300, left: 72 },
          });
        } else if (points[0]) {
          map.easeTo({
            center: points[0],
            duration: prefersReducedMotion() ? 0 : 360,
            zoom: 15,
          });
        }
      },
      recenter: () => {
        const map = mapRef.current;
        const position = currentLocationRef.current;
        if (!map || !isLocatedPosition(position)) return;
        followDriver(map, position, false);
      },
    }),
    [],
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    let disposed = false;
    let map: MapLibreMap | null = null;
    let handleLoad: (() => void) | undefined;
    const handleFollowInterrupted = () => onFollowInterruptedRef.current?.();
    const handleMapClick = () => onMapClickRef.current?.();

    void loadMapLibre()
      .then((maplibre) => {
        if (disposed) return;
        maplibreRef.current = maplibre;
        map = new maplibre.Map({
          attributionControl: false,
          center: initialCenterRef.current,
          container,
          scrollZoom: false,
          style: resolveMapStyle(),
          zoom: 15,
        });
        mapRef.current = map;
        handleLoad = () => {
          if (!map) return;
          ensureNavigationGeometry(map, geometryRef.current);
          map.addControl(new maplibre.AttributionControl(), "bottom-right");
          setMapReady(true);
        };
        map.on("load", handleLoad);
        map.on("dragstart", handleFollowInterrupted);
        map.on("rotatestart", handleFollowInterrupted);
        map.on("pitchstart", handleFollowInterrupted);
        map.on("click", handleMapClick);
      })
      .catch(() => {
        if (!disposed) setMapLoadError(true);
      });

    return () => {
      disposed = true;
      driverMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      destinationMarkerRef.current = null;
      if (map && handleLoad) map.off("load", handleLoad);
      map?.off("dragstart", handleFollowInterrupted);
      map?.off("rotatestart", handleFollowInterrupted);
      map?.off("pitchstart", handleFollowInterrupted);
      map?.off("click", handleMapClick);
      try {
        map?.remove();
      } catch {
        // MapLibre can leave a partial renderer when WebGL initialization fails.
      }
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    ensureNavigationGeometry(mapRef.current, geometry);
  }, [geometry, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !maplibreRef.current) return;
    const map = mapRef.current;
    if (isLocatedPosition(currentLocation)) {
      if (!driverMarkerRef.current) {
        const marker = new maplibreRef.current.Marker({
          anchor: "center",
          element: createDriverMarkerElement(),
        });
        setDriverMarkerState(marker, currentLocation, lowAccuracy);
        driverMarkerRef.current = marker.addTo(map);
      } else {
        setDriverMarkerState(
          driverMarkerRef.current,
          currentLocation,
          lowAccuracy,
        );
      }
    }
  }, [currentLocation, currentLocation?.accuracyMeters, currentLocation?.headingDegrees, currentLocation?.latitude, currentLocation?.longitude, lowAccuracy, mapReady]);

  useEffect(() => {
    if (
      !follow ||
      !mapReady ||
      !mapRef.current ||
      !isLocatedPosition(currentLocation)
    ) {
      return;
    }
    followDriver(mapRef.current, currentLocation, true);
  }, [currentLocation, follow, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !maplibreRef.current) return;
    if (!isLocatedTarget(destination)) {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.getElement().style.display = "none";
      }
      return;
    }
    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new maplibreRef.current.Marker({
        anchor: "bottom",
        element: createDestinationMarkerElement(destination),
      })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(mapRef.current);
    } else {
      destinationMarkerRef.current.setLngLat([
        destination.longitude,
        destination.latitude,
      ]);
    }
    const element = destinationMarkerRef.current.getElement();
    element.style.display = "grid";
    element.setAttribute("aria-label", `Destino: ${destination.label}`);
    element.title = destination.label;
  }, [destination, destination?.id, destination?.label, destination?.latitude, destination?.longitude, mapReady]);

  return (
    <div
      aria-label={`Mapa de navegación de ${routeName}`}
      className={`relative isolate h-full min-h-[100dvh] w-full overflow-hidden bg-[#dce5df] ${className}`}
      data-navigation-map="true"
    >
      <div ref={mapContainerRef} className="h-full min-h-[100dvh] w-full" />
      {mapLoadError && (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-[#17201b]/90 p-6 text-center text-sm font-bold text-white"
          role="alert"
        >
          El mapa no está disponible. La ruta y sus instrucciones siguen visibles.
        </div>
      )}
      {!mapReady && !mapLoadError && (
        <div
          aria-label="Cargando mapa"
          className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(135deg,rgba(23,32,27,.18),rgba(47,111,115,.12),rgba(240,197,106,.12))] motion-reduce:animate-none"
        />
      )}
    </div>
  );
});
