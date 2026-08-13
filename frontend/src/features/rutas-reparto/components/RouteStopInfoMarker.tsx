import type { CSSProperties, KeyboardEvent } from "react";
import type { RoutePlanStopInput } from "../types";
import { formatRouteDistance, formatRouteDuration } from "./routeStopMetrics";

export type RouteStopDisplay = RoutePlanStopInput & {
  customerName?: string;
  saleNumber?: string;
};

export type RouteStopInfoMarkerProps = {
  stop: RouteStopDisplay;
  index: number;
  latitude: number;
  longitude: number;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  cumulativeDurationSeconds?: number | null;
  cumulativeDistanceMeters?: number | null;
  isOrigin?: boolean;
  isDestination?: boolean;
  isSelected?: boolean;
  showInfo?: boolean;
  visualOffset?: { x: number; y: number };
  onSelect?: () => void;
  onMove?: (latitude: number, longitude: number) => void;
};

function markerLabel(index: number, isOrigin: boolean) {
  if (isOrigin) return "A";
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

function handleMarkerKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onSelect?: () => void,
  onMove?: (latitude: number, longitude: number) => void,
  latitude?: number,
  longitude?: number,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect?.();
    return;
  }
  if (
    !onMove ||
    latitude == null ||
    longitude == null ||
    !["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
  )
    return;

  event.preventDefault();
  const delta = 0.0001;
  const nextLatitude =
    latitude + (event.key === "ArrowUp" ? delta : event.key === "ArrowDown" ? -delta : 0);
  const nextLongitude =
    longitude +
    (event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0);
  onMove(nextLatitude, nextLongitude);
}

export function RouteStopInfoMarker({
  stop,
  index,
  durationSeconds,
  distanceMeters,
  cumulativeDurationSeconds,
  cumulativeDistanceMeters,
  isOrigin = false,
  isDestination = false,
  isSelected = false,
  showInfo = true,
  visualOffset = { x: 0, y: 0 },
  onSelect,
  onMove,
  latitude,
  longitude,
}: RouteStopInfoMarkerProps) {
  const duration = formatRouteDuration(durationSeconds);
  const distance = formatRouteDistance(distanceMeters);
  const cumulativeDuration = formatRouteDuration(cumulativeDurationSeconds);
  const cumulativeDistance = formatRouteDistance(cumulativeDistanceMeters);
  const label = markerLabel(index, isOrigin);
  const title = isOrigin
    ? "Origen"
    : `Parada ${index}: ${stop.customerName ?? stop.saleNumber ?? stop.deliveryAddress}`;
  const metricsLabel = `${duration ?? "Calculando"}, ${distance ?? "distancia pendiente"}`;
  const tone = isOrigin ? "#2563a8" : isSelected ? "#176b45" : "#238052";

  return (
    <div
      aria-label={title}
      className={`route-stop-info ${isSelected ? "is-selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      onKeyDown={(event) =>
        handleMarkerKeyDown(event, onSelect, onMove, latitude, longitude)
      }
      role={onSelect ? "button" : "img"}
      style={
        {
          "--route-stop-tone": tone,
          transform: `translate(${visualOffset.x}px, ${visualOffset.y}px)`,
        } as CSSProperties
      }
      tabIndex={onSelect ? 0 : -1}
      title={title}
    >
      {showInfo && !isOrigin && (
        <div
          aria-label={metricsLabel}
          className="route-stop-card"
          role="status"
        >
          {duration && distance ? (
            <>
              <span className="route-stop-card__duration">{duration}</span>
              <span>{distance}</span>
            </>
          ) : (
            <span className="route-stop-card__pending">Calculando...</span>
          )}
          <i aria-hidden="true" />
          <div className="route-stop-card__details">
            {stop.customerName && <strong>{stop.customerName}</strong>}
            {stop.deliveryAddress && <span>{stop.deliveryAddress}</span>}
            <span>Orden de visita: {index}</span>
            {isDestination && cumulativeDuration && cumulativeDistance && (
              <span>
                Total: {cumulativeDuration} · {cumulativeDistance}
              </span>
            )}
          </div>
        </div>
      )}
      <span aria-hidden="true" className="route-stop-dot">
        {label}
      </span>
    </div>
  );
}
