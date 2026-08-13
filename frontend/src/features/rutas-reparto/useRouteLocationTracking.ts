import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../lib/api";
import { useAuth } from "../auth";
import { deliveryService } from "./deliveryService";
import type {
  DeliveryRouteDetail,
  FleetPositionPublication,
  PublishFleetPositionPayload,
  RouteLocationPosition,
} from "./types";

export const TRACKING_PUBLISH_INTERVAL_MS = 10_000;
export const TRACKING_MOVEMENT_THRESHOLD_METERS = 25;
export const TRACKING_LOW_ACCURACY_METERS = 100;
export const TRACKING_MAX_RETRIES = 2;
export const TRACKING_RETRY_DELAYS_MS = [1_000, 3_000] as const;

export const TRACKING_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

export type RouteLocationTrackingStatus =
  | "stopped"
  | "requesting_permission"
  | "active"
  | "low_accuracy"
  | "gps_unavailable"
  | "permission_denied"
  | "sync_error";

export type RouteLocationTrackingRoute = Pick<
  DeliveryRouteDetail,
  "id" | "driverId" | "status" | "vehicleId"
>;

export type RouteLocationTrackingResult = {
  canStart: boolean;
  errorMessage: string | null;
  isEligible: boolean;
  isTracking: boolean;
  lastPosition: RouteLocationPosition | null;
  lastPublishedAt: string | null;
  lastPublishedPosition: RouteLocationPosition | null;
  start: () => void;
  status: RouteLocationTrackingStatus;
  stop: () => void;
};

type PendingPublication = {
  attempt: number;
  gpsStatus: "active" | "low_accuracy";
  payload: PublishFleetPositionPayload;
  position: RouteLocationPosition;
  timer: number | null;
};

type LastPublished = {
  latitude: number;
  longitude: number;
  publishedAtMs: number;
};

function getGeolocation(): Geolocation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.geolocation;
}

function createClientEventId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `gps-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function distanceInMeters(
  first: Pick<RouteLocationPosition, "latitude" | "longitude">,
  second: Pick<RouteLocationPosition, "latitude" | "longitude">,
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function normalizeHeading(heading: number | null) {
  if (typeof heading !== "number" || !Number.isFinite(heading)) {
    return null;
  }

  return ((heading % 360) + 360) % 360;
}

function isFatalPublicationError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    [401, 403, 409].includes(error.statusCode)
  );
}

function publicationErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 409) {
      return "La ruta ya no admite seguimiento GPS. Revisa que permanezca activa.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "La sesión o los permisos ya no permiten compartir ubicación.";
    }
    return error.message || "No se pudo sincronizar la ubicación.";
  }

  return "No se pudo sincronizar la ubicación. Se reintentará automáticamente.";
}

export function useRouteLocationTracking({
  enabled = true,
  route,
}: {
  enabled?: boolean;
  route?: RouteLocationTrackingRoute | null;
}): RouteLocationTrackingResult {
  const { accessToken, user } = useAuth();
  const [status, setStatus] = useState<RouteLocationTrackingStatus>("stopped");
  const [isTracking, setIsTracking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastPosition, setLastPosition] =
    useState<RouteLocationPosition | null>(null);
  const [lastPublishedPosition, setLastPublishedPosition] =
    useState<RouteLocationPosition | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const activeRef = useRef(false);
  const eligibleRef = useRef(false);
  const accessTokenRef = useRef<string | null>(accessToken);
  const watchIdRef = useRef<number | null>(null);
  const geolocationRef = useRef<Geolocation | undefined>(undefined);
  const pendingPublicationRef = useRef<PendingPublication | null>(null);
  const attemptPublicationRef = useRef<
    ((pending: PendingPublication) => Promise<void>) | undefined
  >(undefined);
  const lastPublishedRef = useRef<LastPublished | null>(null);
  const lastReadingKeyRef = useRef<string | null>(null);
  const routeIdRef = useRef(route?.id ?? null);

  const isEligible = Boolean(
    enabled &&
      user?.role === "DRIVER" &&
      route?.id &&
      route.driverId === user.id &&
      route.status === "IN_PROGRESS" &&
      route.vehicleId,
  );

  useEffect(() => {
    eligibleRef.current = isEligible;
    accessTokenRef.current = accessToken;
  }, [accessToken, isEligible]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current === null) return;

    geolocationRef.current?.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  const clearPendingPublication = useCallback(() => {
    const pending = pendingPublicationRef.current;
    if (pending?.timer !== null && pending?.timer !== undefined) {
      window.clearTimeout(pending.timer);
    }
    pendingPublicationRef.current = null;
  }, []);

  const clearTrackingResources = useCallback(() => {
    clearWatch();
    clearPendingPublication();
    activeRef.current = false;
    lastPublishedRef.current = null;
    lastReadingKeyRef.current = null;
  }, [clearPendingPublication, clearWatch]);

  const stopInternal = useCallback(
    (nextStatus: RouteLocationTrackingStatus = "stopped", message: string | null = null) => {
      clearTrackingResources();
      if (!mountedRef.current) return;

      setIsTracking(false);
      setStatus(nextStatus);
      setErrorMessage(message);
    },
    [clearTrackingResources],
  );

  const attemptPublication = useCallback(
    async (pending: PendingPublication) => {
      if (!mountedRef.current || !activeRef.current) return;

      const token = accessTokenRef.current;
      if (!token) {
        if (pendingPublicationRef.current === pending) {
          pendingPublicationRef.current = null;
        }
        stopInternal(
          "sync_error",
          "La sesión ya no está disponible para compartir ubicación.",
        );
        return;
      }

      try {
        const publication = await deliveryService.publishFleetPosition(
          pending.payload,
          token,
        );
        if (
          !mountedRef.current ||
          !activeRef.current ||
          pendingPublicationRef.current !== pending
        ) {
          return;
        }

        pendingPublicationRef.current = null;
        lastPublishedRef.current = {
          latitude: pending.position.latitude,
          longitude: pending.position.longitude,
          publishedAtMs: Date.now(),
        };
        setLastPublishedPosition(pending.position);
        setLastPublishedAt(
          (publication as FleetPositionPublication).recordedAt ??
            pending.position.recordedAt,
        );
        setStatus(pending.gpsStatus);
        setErrorMessage(null);
      } catch (error) {
        if (
          !mountedRef.current ||
          !activeRef.current ||
          pendingPublicationRef.current !== pending
        ) {
          return;
        }

        if (isFatalPublicationError(error)) {
          pendingPublicationRef.current = null;
          stopInternal("sync_error", publicationErrorMessage(error));
          return;
        }

        if (pending.attempt < TRACKING_MAX_RETRIES) {
          const delay = TRACKING_RETRY_DELAYS_MS[pending.attempt];
          pending.attempt += 1;
          pending.timer = window.setTimeout(() => {
            pending.timer = null;
            void attemptPublicationRef.current?.(pending);
          }, delay);
          setStatus("sync_error");
          setErrorMessage(publicationErrorMessage(error));
          return;
        }

        pendingPublicationRef.current = null;
        setStatus("sync_error");
        setErrorMessage(
          "No se pudo sincronizar la ubicación después de varios intentos.",
        );
      }
    },
    [stopInternal],
  );

  useEffect(() => {
    attemptPublicationRef.current = attemptPublication;
  }, [attemptPublication]);

  const handlePosition = useCallback((position: GeolocationPosition) => {
    if (!mountedRef.current || !activeRef.current || !eligibleRef.current) {
      return;
    }

    const { accuracy, heading, latitude, longitude, speed } = position.coords;
    const timestamp = position.timestamp;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      !Number.isFinite(timestamp)
    ) {
      setStatus("gps_unavailable");
      setErrorMessage("El navegador entregó una lectura GPS no válida.");
      return;
    }

    const recordedAt = new Date(timestamp).toISOString();
    const speedKph =
      typeof speed === "number" && Number.isFinite(speed) && speed >= 0
        ? speed * 3.6
        : null;
    const headingDegrees = normalizeHeading(heading);
    const currentPosition: RouteLocationPosition = {
      accuracyMeters: accuracy,
      headingDegrees,
      latitude,
      longitude,
      recordedAt,
      speedKph,
    };
    const gpsStatus =
      accuracy > TRACKING_LOW_ACCURACY_METERS ? "low_accuracy" : "active";
    const readingKey = [
      timestamp,
      latitude,
      longitude,
      accuracy,
      speed ?? "",
      heading ?? "",
    ].join("|");

    setLastPosition(currentPosition);
    if (pendingPublicationRef.current) return;

    setStatus(gpsStatus);
    setErrorMessage(null);
    if (lastReadingKeyRef.current === readingKey) return;
    lastReadingKeyRef.current = readingKey;

    const lastPublished = lastPublishedRef.current;
    const elapsedSincePublication = lastPublished
      ? Date.now() - lastPublished.publishedAtMs
      : Number.POSITIVE_INFINITY;
    const movedMeters = lastPublished
      ? distanceInMeters(lastPublished, currentPosition)
      : Number.POSITIVE_INFINITY;
    if (
      lastPublished &&
      elapsedSincePublication < TRACKING_PUBLISH_INTERVAL_MS &&
      movedMeters < TRACKING_MOVEMENT_THRESHOLD_METERS
    ) {
      return;
    }

    const payload: PublishFleetPositionPayload = {
      accuracyMeters: currentPosition.accuracyMeters,
      clientEventId: createClientEventId(),
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      recordedAt: currentPosition.recordedAt,
    };
    if (currentPosition.speedKph !== null) {
      payload.speedKph = currentPosition.speedKph;
    }
    if (currentPosition.headingDegrees !== null) {
      payload.headingDegrees = currentPosition.headingDegrees;
    }

    const pending: PendingPublication = {
      attempt: 0,
      gpsStatus,
      payload,
      position: currentPosition,
      timer: null,
    };
    pendingPublicationRef.current = pending;
    void attemptPublicationRef.current?.(pending);
  }, []);

  const handleGeolocationError = useCallback(
    (error: GeolocationPositionError) => {
      if (!mountedRef.current || !activeRef.current) return;

      if (error.code === 1) {
        stopInternal(
          "permission_denied",
          "El permiso de ubicación fue denegado. Habilítalo en el navegador para intentarlo nuevamente.",
        );
        return;
      }

      setStatus("gps_unavailable");
      setErrorMessage(
        error.code === 3
          ? "El GPS tardó demasiado en responder. Se seguirá intentando mientras el seguimiento esté activo."
          : "El navegador no pudo obtener una ubicación GPS disponible.",
      );
    },
    [stopInternal],
  );

  const start = useCallback(() => {
    if (!mountedRef.current || !eligibleRef.current || activeRef.current) {
      return;
    }

    const geolocation = getGeolocation();
    if (!geolocation) {
      setStatus("gps_unavailable");
      setErrorMessage("Este navegador no ofrece geolocalización.");
      return;
    }
    if (!accessTokenRef.current) {
      setStatus("sync_error");
      setErrorMessage("La sesión ya no está disponible para compartir ubicación.");
      return;
    }

    clearTrackingResources();
    geolocationRef.current = geolocation;
    activeRef.current = true;
    setIsTracking(true);
    setStatus("requesting_permission");
    setErrorMessage(null);

    try {
      watchIdRef.current = geolocation.watchPosition(
        handlePosition,
        handleGeolocationError,
        TRACKING_GEOLOCATION_OPTIONS,
      );
    } catch {
      stopInternal("gps_unavailable", "No fue posible iniciar el GPS.");
    }
  }, [
    clearTrackingResources,
    handleGeolocationError,
    handlePosition,
    stopInternal,
  ]);

  const stop = useCallback(() => {
    stopInternal("stopped");
  }, [stopInternal]);

  useEffect(() => {
    if (!isEligible) stopInternal("stopped");
  }, [isEligible, stopInternal]);

  useEffect(() => {
    const nextRouteId = route?.id ?? null;
    if (routeIdRef.current === nextRouteId) return;

    routeIdRef.current = nextRouteId;
    stopInternal("stopped");
    setLastPosition(null);
    setLastPublishedPosition(null);
    setLastPublishedAt(null);
  }, [route?.id, stopInternal]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearTrackingResources();
    },
    [clearTrackingResources],
  );

  return {
    canStart: isEligible && !isTracking,
    errorMessage,
    isEligible,
    isTracking,
    lastPosition,
    lastPublishedAt,
    lastPublishedPosition,
    start,
    status,
    stop,
  };
}
