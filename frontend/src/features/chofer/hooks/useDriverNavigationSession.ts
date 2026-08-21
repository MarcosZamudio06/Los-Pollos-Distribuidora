import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth";
import { deliveryService } from "../../rutas-reparto/deliveryService";
import type {
  DriverNavigationResponse,
  DriverNavigationStep,
  DriverNavigationTarget,
  GeoJsonLineString,
  RouteLocationPosition,
} from "../../rutas-reparto/types";
import { selectNextActionableStep } from "../navigationPresentation";
import {
  NAVIGATION_MAX_RECALC_ACCURACY_METERS,
  NAVIGATION_RECALCULATION_COOLDOWN_MS,
  evaluateNavigationRecalculation,
} from "../navigationSessionPolicy";

export type DriverNavigationViewMode = "follow" | "free" | "overview";

type UseDriverNavigationSessionOptions = {
  enabled?: boolean;
  now?: () => number;
  position?: RouteLocationPosition | null;
  routeId?: string;
  target?: DriverNavigationTarget | null;
};

export type UseDriverNavigationSessionResult = {
  data: DriverNavigationResponse | null;
  distanceFromRouteMeters: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  error: unknown;
  follow: boolean;
  geometry: GeoJsonLineString | null;
  isError: boolean;
  isOffRoute: boolean;
  isRecalculating: boolean;
  nextStep: DriverNavigationStep | null;
  position: RouteLocationPosition | null;
  recenter: () => void;
  showOverview: () => void;
  steps: DriverNavigationStep[];
  suspendFollow: () => void;
  target: DriverNavigationTarget | null;
  viewMode: DriverNavigationViewMode;
};

const systemNow = () => Date.now();

function positionKey(position: RouteLocationPosition) {
  return [
    position.recordedAt,
    position.latitude,
    position.longitude,
    position.accuracyMeters,
    position.headingDegrees ?? "",
  ].join(":");
}

function sessionScopeKey(
  routeId: string | undefined,
  target: DriverNavigationTarget | null | undefined,
) {
  if (!routeId) return null;
  return target
    ? `${routeId}:${target.kind}:${target.id}`
    : `${routeId}:backend-derived`;
}

export function useDriverNavigationSession({
  enabled = true,
  now = systemNow,
  position = null,
  routeId,
  target: requestedTarget = null,
}: UseDriverNavigationSessionOptions): UseDriverNavigationSessionResult {
  const { accessToken } = useAuth();
  const [data, setData] = useState<DriverNavigationResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [distanceFromRouteMeters, setDistanceFromRouteMeters] = useState<
    number | null
  >(null);
  const [viewMode, setViewMode] = useState<DriverNavigationViewMode>("follow");
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const activeScopeRef = useRef<string | null>(null);
  const lastEvaluationKeyRef = useRef<string | null>(null);
  const lastRequestAtRef = useRef<number | null>(null);
  const lastRequestPositionRef = useRef<RouteLocationPosition | null>(null);
  const offRouteReadingCountRef = useRef(0);
  const retryPendingRef = useRef(false);
  const scopeKey = sessionScopeKey(routeId, requestedTarget);
  const currentPositionKey = position ? positionKey(position) : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (activeScopeRef.current === scopeKey) return;
    activeScopeRef.current = scopeKey;
    requestSequenceRef.current += 1;
    lastEvaluationKeyRef.current = null;
    lastRequestAtRef.current = null;
    lastRequestPositionRef.current = null;
    offRouteReadingCountRef.current = 0;
    retryPendingRef.current = false;
    setData(null);
    setError(null);
    setIsRecalculating(false);
    setIsOffRoute(false);
    setDistanceFromRouteMeters(null);
  }, [scopeKey]);

  useEffect(() => {
    if (
      !enabled ||
      !routeId ||
      !scopeKey ||
      !position ||
      !currentPositionKey
    ) {
      return;
    }
    const evaluationKey = `${scopeKey}:${currentPositionKey}`;
    if (lastEvaluationKeyRef.current === evaluationKey) return;
    lastEvaluationKeyRef.current = evaluationKey;
    const nowMs = now();
    const decision = evaluateNavigationRecalculation({
      geometry: data?.geometry,
      lastRequestAtMs: lastRequestAtRef.current,
      lastRequestPosition: lastRequestPositionRef.current,
      nowMs,
      offRouteReadingCount: offRouteReadingCountRef.current,
      position,
    });
    offRouteReadingCountRef.current = decision.nextOffRouteReadingCount;
    setIsOffRoute(decision.isOffRoute);
    setDistanceFromRouteMeters(decision.distanceFromRouteMeters);

    const retryDue = Boolean(
      retryPendingRef.current &&
        lastRequestAtRef.current != null &&
        nowMs - lastRequestAtRef.current >=
          NAVIGATION_RECALCULATION_COOLDOWN_MS &&
        position.accuracyMeters <= NAVIGATION_MAX_RECALC_ACCURACY_METERS,
    );
    if (!decision.reason && !retryDue) return;

    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const requestScope = scopeKey;
    lastRequestAtRef.current = nowMs;
    lastRequestPositionRef.current = position;
    retryPendingRef.current = false;
    setIsRecalculating(true);
    setError(null);
    void deliveryService
      .getRouteNavigation(
        routeId,
        {
          accuracyMeters: position.accuracyMeters,
          ...(position.headingDegrees == null
            ? {}
            : { headingDegrees: position.headingDegrees }),
          latitude: position.latitude,
          longitude: position.longitude,
        },
        accessToken,
      )
      .then((response) => {
        if (
          !mountedRef.current ||
          sequence !== requestSequenceRef.current ||
          requestScope !== activeScopeRef.current
        ) {
          return;
        }
        retryPendingRef.current = false;
        offRouteReadingCountRef.current = 0;
        setData(response);
        setError(null);
        setIsOffRoute(false);
        setDistanceFromRouteMeters(0);
      })
      .catch((requestError: unknown) => {
        if (
          !mountedRef.current ||
          sequence !== requestSequenceRef.current ||
          requestScope !== activeScopeRef.current
        ) {
          return;
        }
        retryPendingRef.current = true;
        setError(requestError);
      })
      .finally(() => {
        if (
          mountedRef.current &&
          sequence === requestSequenceRef.current &&
          requestScope === activeScopeRef.current
        ) {
          setIsRecalculating(false);
        }
      });
  }, [
    accessToken,
    currentPositionKey,
    data?.geometry,
    enabled,
    now,
    position,
    routeId,
    scopeKey,
  ]);

  const suspendFollow = useCallback(() => setViewMode("free"), []);
  const showOverview = useCallback(() => setViewMode("overview"), []);
  const recenter = useCallback(() => setViewMode("follow"), []);
  const steps = useMemo(() => data?.steps ?? [], [data?.steps]);
  const nextStep = useMemo(() => selectNextActionableStep(steps), [steps]);

  return {
    data,
    distanceFromRouteMeters,
    distanceMeters: data?.distanceMeters ?? null,
    durationSeconds: data?.durationSeconds ?? null,
    error,
    follow: viewMode === "follow",
    geometry: data?.geometry ?? null,
    isError: Boolean(error),
    isOffRoute,
    isRecalculating,
    nextStep,
    position,
    recenter,
    showOverview,
    steps,
    suspendFollow,
    target: data?.target ?? requestedTarget,
    viewMode,
  };
}
