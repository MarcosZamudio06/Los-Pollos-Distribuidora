import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  LocateFixed,
  Navigation,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../../lib/api";
import { useAuth } from "../../auth";
import {
  DriverNavigationMap,
  type DriverNavigationMapHandle,
  DriverNavigationOperationsPanel,
  NavigationDeliverySheet,
  NavigationInstructionBanner,
  NavigationMapControls,
} from "../components";
import { DeliveryEvidenceCapture } from "../../rutas-reparto/components/DeliveryEvidenceCapture";
import { DeliveryIncidentDialog } from "../../rutas-reparto/components/DeliveryIncidentDialog";
import { LogisticsRouteCompletionControl } from "../../rutas-reparto/components/LogisticsRouteCompletionControl";
import { LogisticsStopConfirmationControl } from "../../rutas-reparto/components/LogisticsStopConfirmationControl";
import {
  RouteCollectionDialog,
  RouteSecondPassCollectionDialog,
} from "../../rutas-reparto/components/RouteCollectionDialog";
import { RouteCompletionControl } from "../../rutas-reparto/components/RouteCompletionControl";
import { UpdateDeliveryStatusDialog } from "../../rutas-reparto/components/UpdateDeliveryStatusDialog";
import {
  useCompleteLogisticsStop,
  useDeliveryRoute,
  useUpdateDeliveryRouteStatus,
} from "../../rutas-reparto/hooks";
import { useRouteLocationTracking } from "../../rutas-reparto/useRouteLocationTracking";
import type {
  DeliveryOrder,
  DeliveryRouteDetail,
  DriverNavigationTarget,
} from "../../rutas-reparto/types";
import {
  getPendingNavigationCandidate,
  hasNavigationCoordinates,
  isLogisticsRoute,
} from "../../rutas-reparto/navigationTarget";
import { useDriverNavigationSession } from "../hooks";
import { DriverNavigationStatus } from "../components/DriverNavigationStatus";
import { isFinalOrderStatus } from "../../rutas-reparto/labels";
import { distanceBetweenNavigationPointsMeters } from "../navigationSessionPolicy";

function isProviderUnavailable(error: unknown) {
  if (!(error instanceof ApiClientError)) return Boolean(error);
  if ([502, 503, 504].includes(error.statusCode)) return true;
  if (typeof error.payload !== "object" || !error.payload) return false;
  const code = "code" in error.payload ? error.payload.code : undefined;
  return code === "ROUTING_PROVIDER_UNAVAILABLE" || code === "OSRM_UNAVAILABLE";
}

function routeStatusErrorMessage(
  error: unknown,
  fallback = "No se pudo actualizar el estado de la ruta.",
) {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function candidateTarget(
  candidate: ReturnType<typeof getPendingNavigationCandidate>,
): DriverNavigationTarget | null {
  if (!hasNavigationCoordinates(candidate)) return null;
  return {
    address: candidate.address,
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    ...(candidate.stopSequence == null
      ? {}
      : { stopSequence: candidate.stopSequence }),
  };
}

export function DriverNavigationPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mapRef = useRef<DriverNavigationMapHandle | null>(null);
  const previousTargetKeyRef = useRef<string | null>(null);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [statusOrder, setStatusOrder] = useState<DeliveryOrder | null>(null);
  const [evidenceOrder, setEvidenceOrder] = useState<DeliveryOrder | null>(
    null,
  );
  const [collectionOrder, setCollectionOrder] =
    useState<DeliveryOrder | null>(null);
  const [secondPassCollectionOrder, setSecondPassCollectionOrder] =
    useState<DeliveryOrder | null>(null);
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(
    null,
  );
  const [routeStatusError, setRouteStatusError] = useState<string | null>(
    null,
  );
  const route = useDeliveryRoute(routeId);
  const updateRouteStatus = useUpdateDeliveryRouteStatus(routeId);
  const completeLogisticsStop = useCompleteLogisticsStop(routeId);
  const detail = route.data;
  const isAssignedDriver = Boolean(
    user?.role === "DRIVER" && detail?.driverId === user.id,
  );
  const isActiveAssignedRoute = Boolean(
    isAssignedDriver && detail?.status === "IN_PROGRESS",
  );
  const pendingCandidate = useMemo(
    () => getPendingNavigationCandidate(detail),
    [detail],
  );
  const tracking = useRouteLocationTracking({
    enabled: isActiveAssignedRoute,
    route: detail,
  });
  const requestedTarget = useMemo(
    () => candidateTarget(pendingCandidate),
    [pendingCandidate],
  );
  const navigation = useDriverNavigationSession({
    enabled:
      isActiveAssignedRoute &&
      tracking.isTracking &&
      Boolean(tracking.lastPosition) &&
      Boolean(requestedTarget),
    position: tracking.lastPosition,
    routeId,
    target: requestedTarget,
  });
  const target = navigation.target;
  const targetKey = target ? `${target.kind}:${target.id}` : null;
  const activeOrder =
    target?.kind === "DELIVERY_ORDER"
      ? detail?.orders?.find((order) => order.id === target.id) ?? null
      : null;
  const isNearDestination = Boolean(
    tracking.lastPosition &&
      target &&
      tracking.lastPosition.accuracyMeters <= 100 &&
      distanceBetweenNavigationPointsMeters(tracking.lastPosition, target) <=
        150,
  );
  const providerUnavailable = isProviderUnavailable(navigation.error);
  const isOffline = providerUnavailable || tracking.status === "sync_error";
  const routeAvailable = Boolean(
    navigation.data ||
      tracking.status === "stopped" ||
      tracking.status === "active" ||
      isOffline,
  );

  useEffect(() => {
    const previousTargetKey = previousTargetKeyRef.current;
    if (previousTargetKey && previousTargetKey !== targetKey) {
      setOperationsOpen(false);
      setStatusOrder(null);
      setEvidenceOrder(null);
      setCollectionOrder(null);
      setSecondPassCollectionOrder(null);
      setIncidentOrder(null);
    }
    previousTargetKeyRef.current = targetKey;
  }, [targetKey]);

  function closeNavigation() {
    tracking.stop();
    setOperationsOpen(false);
    navigate("/my-routes");
  }

  async function finishRoute() {
    if (!routeId) return;
    setRouteStatusError(null);
    try {
      await updateRouteStatus.mutateAsync({ status: "COMPLETED" });
    } catch (error) {
      setRouteStatusError(
        routeStatusErrorMessage(error, "No se pudo terminar la ruta."),
      );
      throw error;
    }
  }

  async function completeLogisticsDestination() {
    setRouteStatusError(null);
    try {
      await completeLogisticsStop.mutateAsync({});
    } catch (error) {
      setRouteStatusError(
        routeStatusErrorMessage(
          error,
          "No se pudo confirmar la recepción física.",
        ),
      );
      throw error;
    }
  }

  if (!routeId) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="Ruta no disponible" tone="error">
          No se recibió un identificador de ruta válido.
        </DriverNavigationStatus>
      </NavigationFrame>
    );
  }

  if (route.isLoading) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="Cargando ruta">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            Consultando la ruta asignada antes de activar navegación.
          </span>
        </DriverNavigationStatus>
      </NavigationFrame>
    );
  }

  if (route.error || !detail) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="No se pudo cargar la ruta" tone="error">
          No es posible abrir navegación para esta ruta. Verifica tu sesión y
          vuelve a intentarlo desde Mis rutas.
        </DriverNavigationStatus>
      </NavigationFrame>
    );
  }

  if (!isAssignedDriver) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="Ruta no disponible" tone="error">
          Esta ruta no está asignada a tu usuario DRIVER.
        </DriverNavigationStatus>
      </NavigationFrame>
    );
  }

  if (detail.status !== "IN_PROGRESS") {
    return <InactiveRouteState route={detail} />;
  }

  if (!pendingCandidate) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="Ninguna parada pendiente" tone="success">
          Todas las entregas o la parada logística de esta ruta ya están
          finalizadas. No se cambiará ningún pedido por proximidad GPS.
        </DriverNavigationStatus>
        {isLogisticsRoute(detail.type) ? (
          detail.logisticsStop ? (
            <>
              <LogisticsRouteCompletionControl
                error={routeStatusError}
                isCompleting={updateRouteStatus.isPending}
                onComplete={finishRoute}
                routeName={detail.name}
                stopCompleted={detail.logisticsStop.status === "COMPLETED"}
              />
              <p className="text-sm font-semibold text-white/65">
                El seguimiento GPS se detendrá cuando cierres la ruta. No se
                inicia un regreso automático a CEDIS.
              </p>
            </>
          ) : (
            <DriverNavigationStatus title="Parada logística no disponible" tone="error">
              La ruta no tiene una parada física completa para cerrar. No se
              enviarán nuevos cálculos de navegación.
            </DriverNavigationStatus>
          )
        ) : (
          <RouteCompletionControl
            completedOrders={(detail.orders ?? []).filter((order) =>
              isFinalOrderStatus(order.status),
            ).length}
            error={routeStatusError}
            isCompleting={updateRouteStatus.isPending}
            onComplete={finishRoute}
            routeName={detail.name}
            totalOrders={detail.orders?.length ?? 0}
          />
        )}
      </NavigationFrame>
    );
  }

  if (!target) {
    return (
      <NavigationFrame>
        <DriverNavigationStatus title="Parada pendiente sin coordenadas" tone="error">
          La próxima parada no tiene coordenadas válidas. Corrige la dirección
          en la ruta antes de solicitar navegación.
        </DriverNavigationStatus>
      </NavigationFrame>
    );
  }

  const isLowAccuracy = tracking.status === "low_accuracy";
  const isNoGps = ["permission_denied", "gps_unavailable"].includes(
    tracking.status,
  );
  const mapGeometry = navigation.geometry ?? detail.geometry ?? null;

  return (
    <main
      className="relative min-h-[100dvh] overflow-hidden bg-[#17201b] text-white"
      data-navigation-page="true"
    >
      <DriverNavigationMap
        ref={mapRef}
        currentLocation={tracking.lastPosition}
        destination={target}
        follow={navigation.follow}
        geometry={mapGeometry}
        lowAccuracy={isLowAccuracy}
        onFollowInterrupted={navigation.suspendFollow}
        routeName={detail.name}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
        <NavigationInstructionBanner
          isCalculating={navigation.isRecalculating}
          isOffline={isOffline}
          isLowAccuracy={isLowAccuracy}
          isRequestingPermission={tracking.status === "requesting_permission"}
          onRetry={tracking.canStart ? tracking.start : undefined}
          recalculationFailed={navigation.isError}
          routeAvailable={!isNoGps && routeAvailable}
          step={navigation.nextStep}
        />
      </div>

      <button
        aria-label="Volver a mis rutas"
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 grid min-h-12 min-w-12 place-items-center rounded-2xl border border-white/20 bg-[#17201b]/90 text-white shadow-[0_12px_32px_rgba(17,24,21,.28)] backdrop-blur transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 sm:left-6"
        onClick={closeNavigation}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-5 w-5" />
      </button>

      <NavigationMapControls
        onOverview={() => {
          navigation.showOverview();
          mapRef.current?.overview();
        }}
        onRecenter={() => {
          navigation.recenter();
          mapRef.current?.recenter();
        }}
        recenterDisabled={!tracking.lastPosition}
      />

      {isNoGps && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(50%+2.5rem)] z-20 -translate-x-1/2 rounded-full border border-white/20 bg-[#17201b]/85 px-4 py-2 text-center text-xs font-black text-white shadow-lg backdrop-blur">
          <span className="inline-flex items-center gap-2">
            <LocateFixed aria-hidden="true" className="h-4 w-4 text-[var(--erp-brand-gold-soft)]" />
            {tracking.status === "permission_denied"
              ? "Permiso de ubicación denegado"
              : "GPS no disponible"}
          </span>
        </div>
      )}

      <NavigationDeliverySheet
        canStart={tracking.canStart}
        isNearDestination={isNearDestination}
        isStarting={tracking.status === "requesting_permission"}
        isTracking={tracking.isTracking}
        navigation={navigation.data}
        onArrived={() => setOperationsOpen(true)}
        onNextStop={() => setOperationsOpen(false)}
        onOpenDelivery={() => setOperationsOpen(true)}
        onStart={tracking.start}
        route={detail}
        target={target}
      />

      <DriverNavigationOperationsPanel
        evidence={detail.evidenceSummary ?? []}
        onCaptureEvidence={setEvidenceOrder}
        onClose={() => setOperationsOpen(false)}
        onCollect={setCollectionOrder}
        onIncident={setIncidentOrder}
        onSecondPassCollect={setSecondPassCollectionOrder}
        onUpdateStatus={setStatusOrder}
        open={operationsOpen}
        order={activeOrder}
        route={detail}
      >
        {isLogisticsRoute(detail.type) && detail.logisticsStop && (
          <div className="grid gap-4">
            <LogisticsStopConfirmationControl
              error={routeStatusError}
              isCompleting={completeLogisticsStop.isPending}
              onComplete={completeLogisticsDestination}
              routeName={detail.name}
              stop={detail.logisticsStop}
            />
            <LogisticsRouteCompletionControl
              error={routeStatusError}
              isCompleting={updateRouteStatus.isPending}
              onComplete={finishRoute}
              routeName={detail.name}
              stopCompleted={detail.logisticsStop.status === "COMPLETED"}
            />
          </div>
        )}
      </DriverNavigationOperationsPanel>

      {statusOrder && (
        <UpdateDeliveryStatusDialog
          onClose={() => setStatusOrder(null)}
          order={statusOrder}
          routeId={detail.id}
        />
      )}
      {evidenceOrder && (
        <DeliveryEvidenceCapture
          onClose={() => setEvidenceOrder(null)}
          order={evidenceOrder}
          routeId={detail.id}
        />
      )}
      {collectionOrder && (
        <RouteCollectionDialog
          onClose={() => setCollectionOrder(null)}
          order={collectionOrder}
          routeId={detail.id}
        />
      )}
      {secondPassCollectionOrder && (
        <RouteSecondPassCollectionDialog
          onClose={() => setSecondPassCollectionOrder(null)}
          order={secondPassCollectionOrder}
          routeId={detail.id}
        />
      )}
      {incidentOrder && (
        <DeliveryIncidentDialog
          onClose={() => setIncidentOrder(null)}
          order={incidentOrder}
          routeId={detail.id}
        />
      )}
    </main>
  );
}

function InactiveRouteState({ route }: { route: DeliveryRouteDetail }) {
  return (
    <NavigationFrame>
      <div className="flex items-center gap-3">
        <Navigation aria-hidden="true" className="h-5 w-5 text-[var(--erp-brand-gold-soft)]" />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">
            Navegación del conductor
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.05em] text-white">
            {route.name}
          </h1>
        </div>
      </div>
      <DriverNavigationStatus
        title={route.status === "PENDING" ? "Ruta pendiente" : "Ruta finalizada"}
        tone="warning"
      >
        La navegación sólo está disponible mientras la ruta permanece en
        IN_PROGRESS. {route.status === "PENDING" ? "Inicia la ruta desde Mis rutas." : "Esta ruta ya no admite navegación."}
      </DriverNavigationStatus>
    </NavigationFrame>
  );
}

function NavigationFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--erp-charcoal)] px-3 py-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-white sm:px-6 sm:py-6">
      <div className="mx-auto grid min-w-0 max-w-5xl gap-4 sm:gap-5">{children}</div>
    </main>
  );
}
