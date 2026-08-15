import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { MapUnavailableState } from "./MapUnavailableState";
import { loadMapLibre } from "../../lib/maps/mapLibreRuntime";
import {
  toMapLibrePoint,
  type MapCanvasError,
  type MapCanvasProps,
  type MapErrorKind,
} from "./types";
type MapInstance = MapLibreMap;
type MarkerInstance = MapLibreMarker;
type MapLibreModule = typeof import("maplibre-gl");

class MapInitializationError extends Error {
  readonly kind: MapErrorKind;

  constructor(
    kind: MapErrorKind,
    message: string,
  ) {
    super(message);
    this.kind = kind;
    this.name = "MapInitializationError";
  }
}

function errorText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return "";

  const record = value as Record<string, unknown>;
  const nestedError = record.error;
  return [
    record.message,
    record.statusText,
    record.resourceType,
    record.sourceDataType,
    record.sourceId,
    record.source,
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

function classifyMapError(value: unknown): MapErrorKind {
  if (value instanceof MapInitializationError) return value.kind;
  const normalized = errorText(value).toLowerCase();

  if (
    normalized.includes("webgl") ||
    normalized.includes("webgl2") ||
    normalized.includes("context lost") ||
    normalized.includes("canvas")
  ) {
    return "webgl";
  }
  if (normalized.includes("glyph")) return "glyphs";
  if (normalized.includes("sprite")) return "sprites";
  if (
    normalized.includes("tile") ||
    normalized.includes("source") ||
    normalized.includes("vector")
  ) {
    return "tiles";
  }
  if (
    normalized.includes("style") ||
    normalized.includes("stylesheet") ||
    normalized.includes("json")
  ) {
    return "style";
  }
  return "runtime";
}

function toMapCanvasError(value: unknown): MapCanvasError {
  const kind = classifyMapError(value);
  return {
    kind,
    message: errorText(value) || "MapLibre could not initialize the map.",
  };
}

function supportsWebGL() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");

  try {
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function attributionHtml(label: string, url?: string) {
  const safeLabel = escapeHtml(label);
  if (!url) return safeLabel;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
}

export function MapLibreCanvas({
  config,
  initialCoordinates,
  marker,
  onCoordinateChange,
  onError,
  className,
  ariaLabel = "Mapa interactivo",
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCoordinateChangeRef = useRef(onCoordinateChange);
  const onErrorRef = useRef(onError);
  const onMarkerDragEndRef = useRef(marker?.onDragEnd);
  const markerConfigRef = useRef(marker);
  const mapRef = useRef<MapInstance | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const [mapError, setMapError] = useState<MapCanvasError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const initialViewport = initialCoordinates
    ? { ...config.defaultViewport, ...initialCoordinates }
    : config.defaultViewport;
  const initialLatitude = initialViewport.latitude;
  const initialLongitude = initialViewport.longitude;
  const initialZoom = initialViewport.zoom;

  useEffect(() => {
    onCoordinateChangeRef.current = onCoordinateChange;
    onErrorRef.current = onError;
  }, [onCoordinateChange, onError]);

  useEffect(() => {
    onMarkerDragEndRef.current = marker?.onDragEnd;
    markerConfigRef.current = marker;
  }, [marker]);

  useEffect(() => {
    const currentMarker = markerRef.current;
    const nextMarker = markerConfigRef.current;
    const map = mapRef.current;
    const maplibre = maplibreRef.current;

    if (!nextMarker) {
      currentMarker?.remove();
      markerRef.current = null;
      return;
    }

    if (!currentMarker) {
      if (!map || !maplibre) return;
      markerRef.current = new maplibre.Marker({
        draggable: nextMarker.draggable ?? false,
      })
        .setLngLat(toMapLibrePoint(nextMarker.coordinates))
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const markerInstance = markerRef.current;
        if (!markerInstance) return;
        const lngLat = markerInstance.getLngLat();
        onMarkerDragEndRef.current?.({
          latitude: lngLat.lat,
          longitude: lngLat.lng,
        });
      });
      return;
    }

    currentMarker.setLngLat(toMapLibrePoint(nextMarker.coordinates));
    currentMarker.setDraggable(nextMarker.draggable ?? false);
  }, [
    marker?.coordinates.latitude,
    marker?.coordinates.longitude,
    marker?.draggable,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !config.available) return undefined;

    let disposed = false;
    let map: MapInstance | null = null;

    setMapError(null);
    setIsLoading(true);

    void (async () => {
      try {
        if (!supportsWebGL()) {
          throw new MapInitializationError(
            "webgl",
            "The browser does not expose a WebGL context.",
          );
        }

        const maplibre = await loadMapLibre();

        if (disposed) return;

        map = new maplibre.Map({
          attributionControl: false,
          center: toMapLibrePoint({
            latitude: initialLatitude,
            longitude: initialLongitude,
          }),
          container,
          fadeDuration: prefersReducedMotion() ? 0 : 300,
          style: config.style,
          zoom: initialZoom,
        });
        mapRef.current = map;
        maplibreRef.current = maplibre;

        const initialMarker = markerConfigRef.current;
        if (initialMarker) {
          markerRef.current = new maplibre.Marker({
            draggable: initialMarker.draggable ?? false,
          })
            .setLngLat(toMapLibrePoint(initialMarker.coordinates))
            .addTo(map);
          markerRef.current.on("dragend", () => {
            const markerInstance = markerRef.current;
            if (!markerInstance) return;
            const lngLat = markerInstance.getLngLat();
            onMarkerDragEndRef.current?.({
              latitude: lngLat.lat,
              longitude: lngLat.lng,
            });
          });
        }

        map.addControl(
          new maplibre.AttributionControl({
            compact: true,
            customAttribution: config.attribution.map(({ label, url }) =>
              attributionHtml(label, url),
            ),
          }),
          "bottom-right",
        );

        map.on("click", (event) => {
          onCoordinateChangeRef.current?.({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
        });

        map.on("error", (event) => {
          const error = toMapCanvasError(event);
          markerRef.current?.remove();
          markerRef.current = null;
          mapRef.current = null;
          maplibreRef.current = null;
          map?.remove();
          map = null;
          setMapError(error);
          onErrorRef.current?.(error);
        });

        setIsLoading(false);
      } catch (error) {
        if (disposed) return;
        markerRef.current?.remove();
        markerRef.current = null;
        mapRef.current = null;
        maplibreRef.current = null;
        map?.remove();
        map = null;
        const normalizedError = toMapCanvasError(error);
        setMapError(normalizedError);
        setIsLoading(false);
        onErrorRef.current?.(normalizedError);
      }
    })();

    return () => {
      disposed = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      maplibreRef.current = null;
      map?.remove();
    };
  }, [
    config.available,
    config.attribution,
    config.defaultViewport.latitude,
    config.defaultViewport.longitude,
    config.defaultViewport.zoom,
    config.revision,
    config.style,
    initialLatitude,
    initialLongitude,
    initialZoom,
    retryKey,
  ]);

  if (!config.available) {
    return <MapUnavailableState reason="disabled" className={className} />;
  }

  if (mapError) {
    return (
      <MapUnavailableState
        className={className}
        onRetry={() => setRetryKey((current) => current + 1)}
        reason={mapError.kind}
      />
    );
  }

  return (
    <div
      aria-busy={isLoading}
      aria-label={ariaLabel}
      className={[
        "relative min-h-64 overflow-hidden rounded-xl bg-slate-900",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-maplibre-canvas="true"
      ref={containerRef}
      role="application"
    >
      {isLoading ? (
        <div
          aria-live="polite"
          className="absolute inset-x-0 top-0 z-10 bg-slate-950/80 px-4 py-2 text-sm text-white"
          role="status"
        >
          Cargando mapa…
        </div>
      ) : null}
    </div>
  );
}

export default MapLibreCanvas;
