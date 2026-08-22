import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../../lib/api";
import {
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Navigation,
  Route,
  Ruler,
  Truck,
} from "lucide-react";
import { DeliveryEvidenceCapture } from "../components/DeliveryEvidenceCapture";
import { DeliveryIncidentDialog } from "../components/DeliveryIncidentDialog";
import { DeliveryOrderCard } from "../components/DeliveryOrderCard";
import { DriverRouteMap } from "../components/DriverRouteMap";
import { LogisticsTransportProgress } from "../components/LogisticsTransportProgress";
import { LogisticsRouteCompletionControl } from "../components/LogisticsRouteCompletionControl";
import { LogisticsStopConfirmationControl } from "../components/LogisticsStopConfirmationControl";
import { RouteCompletionControl } from "../components/RouteCompletionControl";
import { RouteLocationTrackingControl } from "../components/RouteLocationTrackingControl";
import { RouteStartControl } from "../components/RouteStartControl";
import {
  RouteCollectionDialog,
  RouteSecondPassCollectionDialog,
} from "../components/RouteCollectionDialog";
import {
  Card,
  PageFrame,
  PageShell,
  RouteHero,
  RouteStatusBadge,
  StatusMessage,
} from "../components/RouteUi";
import { UpdateDeliveryStatusDialog } from "../components/UpdateDeliveryStatusDialog";
import {
  useCompleteLogisticsStop,
  useDeliveryRoute,
  useDeliveryRoutes,
  useUpdateDeliveryRouteStatus,
} from "../hooks";
import { useRouteLocationTracking } from "../useRouteLocationTracking";
import {
  date,
  isFinalOrderStatus,
  money,
  routeTypeLabel,
  shortId,
} from "../labels";
import { canOpenDriverNavigation } from "../navigationTarget";
import { isNearNavigationDestination } from "../../chofer/navigationSessionPolicy";
import type {
  DeliveryOrder,
  DeliveryRouteListItem,
  LogisticsLocation,
  RouteCollectionResponse,
} from "../types";

function routeSortValue(route: DeliveryRouteListItem) {
  return route.scheduledDate ? new Date(route.scheduledDate).getTime() : 0;
}

function isUnauthorizedRemoteError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
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

function distanceLabel(meters?: number | null) {
  if (meters == null) return "Sin estimación";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function durationLabel(seconds?: number | null) {
  if (seconds == null) return "Sin estimación";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
}

function isLogisticsRouteType(type?: string | null) {
  return type === "BRANCH_RETURN" || type === "CEDIS_SUPPLY";
}

function logisticsQuantityLabel(
  quantityKg?: number | string | null,
  quantityPieces?: number | string | null,
) {
  const parts: string[] = [];
  if (quantityKg != null && Number(quantityKg) > 0) {
    parts.push(String(quantityKg) + " kg");
  }
  if (quantityPieces != null && Number(quantityPieces) > 0) {
    parts.push(String(quantityPieces) + " piezas");
  }
  return parts.join(" · ") || "Sin cantidad";
}

function hasMapCoordinates(location?: LogisticsLocation | null) {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude),
  );
}

export function MyRoutesPage() {
  const routes = useDeliveryRoutes({ limit: 50 });
  const routeItems = useMemo(
    () =>
      [...(routes.data?.items ?? [])].sort(
        (a, b) => routeSortValue(b) - routeSortValue(a),
      ),
    [routes.data?.items],
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();
  const [statusOrder, setStatusOrder] = useState<DeliveryOrder | null>(null);
  const [evidenceOrder, setEvidenceOrder] = useState<DeliveryOrder | null>(
    null,
  );
  const [collectionOrder, setCollectionOrder] = useState<DeliveryOrder | null>(
    null,
  );
  const [secondPassCollectionOrder, setSecondPassCollectionOrder] =
    useState<DeliveryOrder | null>(null);
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(
    null,
  );
  const [lastCollection, setLastCollection] =
    useState<RouteCollectionResponse | null>(null);
  const [routeStatusError, setRouteStatusError] = useState<string | null>(null);

  const activeRouteId = selectedRouteId ?? routeItems[0]?.id;
  const route = useDeliveryRoute(activeRouteId);
  const completeLogisticsStop = useCompleteLogisticsStop(activeRouteId);
  const updateRouteStatus = useUpdateDeliveryRouteStatus(activeRouteId);
  const detail = route.data;
  const isLogisticsRoute = isLogisticsRouteType(detail?.type);
  const logisticsStop = detail?.logisticsStop;
  const logisticsStopCompleted = logisticsStop?.status === "COMPLETED";
  const tracking = useRouteLocationTracking({ route: detail });
  const canConfirmLogisticsArrival = Boolean(
    detail?.status === "IN_PROGRESS" &&
      isLogisticsRoute &&
      !logisticsStopCompleted &&
      tracking.isTracking &&
      isNearNavigationDestination(tracking.lastPosition, logisticsStop?.destination),
  );
  const orders = detail?.orders ?? [];
  const finalOrders = orders.filter((order) =>
    isFinalOrderStatus(order.status),
  ).length;
  const routesUnauthorized = isUnauthorizedRemoteError(routes.error);
  const routeUnauthorized = isUnauthorizedRemoteError(route.error);

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          eyebrow="Cabina del repartidor"
          title="Entregas asignadas"
          subtitle="Consulta tus rutas, actualiza pedidos, captura evidencia, registra cobros permitidos e incidencias con una vista enfocada en la operación del día."
        />

        {routes.isLoading && (
          <StatusMessage>Cargando rutas asignadas...</StatusMessage>
        )}
        {routes.error && (
          <StatusMessage tone="error">
            {routesUnauthorized
              ? "Tu sesión no tiene permisos para consultar estas rutas. Ingresa nuevamente o solicita acceso DRIVER."
              : "No se pudieron cargar tus rutas. Revisa sesión y permisos DRIVER."}
          </StatusMessage>
        )}
        {!routes.isLoading && !routes.error && routeItems.length === 0 && (
          <StatusMessage tone="empty">
            No tienes rutas asignadas por el momento.
          </StatusMessage>
        )}

        {lastCollection && (
          <StatusMessage tone="success">
            Cobro registrado por {money(lastCollection.payment.amount)}.{" "}
            {lastCollection.payment.routeSettlementId
              ? `Quedó relacionado con la liquidación ${shortId(lastCollection.payment.routeSettlementId)}.`
              : "Quedó asociado a la ruta, aún sin liquidación asociada."}
          </StatusMessage>
        )}

        {routeItems.length > 0 && (
          <section className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">
                  <Route className="h-4 w-4" />
                  Rutas
                </p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">
                  Trabajo del día
                </h2>
                <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)] lg:hidden">
                  Desliza para cambiar de ruta
                </p>
              </div>
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-3 pb-4 lg:grid lg:gap-3 lg:overflow-visible lg:p-4">
                {routeItems.map((item) => {
                  const selected = item.id === activeRouteId;
                  return (
                    <button
                      className={`min-w-[17rem] snap-start rounded-xl border p-3 text-left transition focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] lg:min-w-0 lg:rounded-2xl lg:p-4 ${selected ? "border-[var(--erp-info)] bg-[rgba(47,111,115,0.08)] shadow-[var(--erp-shadow)]" : "border-[color:var(--erp-border)] bg-white hover:border-[rgba(47,111,115,0.40)]"}`}
                      key={item.id}
                      onClick={() => {
                        setSelectedRouteId(item.id);
                        setLastCollection(null);
                        setRouteStatusError(null);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-black">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                            Programada: {date(item.scheduledDate)}
                          </p>
                          {isLogisticsRouteType(item.type) && (
                            <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-info)]">
                              {routeTypeLabel(item.type)}
                            </p>
                          )}
                        </div>
                        <RouteStatusBadge status={item.status} />
                      </div>
                      {isLogisticsRouteType(item.type) ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--erp-muted-foreground)]">
                          <span>
                            <strong className="text-[var(--erp-foreground)]">
                              1
                            </strong>{" "}
                            parada logística
                          </span>
                          <span>
                            <strong className="text-[var(--erp-foreground)]">
                              {item.pendingStopsCount ?? 0}
                            </strong>{" "}
                            pendientes
                          </span>
                          <span className="col-span-2 break-words">
                            Unidad: {item.vehicle?.displayName ?? "Sin unidad"}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--erp-muted-foreground)]">
                          <span>
                            <strong className="text-[var(--erp-foreground)]">
                              {item.ordersCount ?? 0}
                            </strong>{" "}
                            pedidos
                          </span>
                          <span>
                            <strong className="text-[var(--erp-foreground)]">
                              {item.pendingOrdersCount ?? 0}
                            </strong>{" "}
                            pendientes
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-5">
              {route.isLoading && (
                <StatusMessage>Cargando detalle de ruta...</StatusMessage>
              )}
              {route.error && (
                <StatusMessage tone="error">
                  {routeUnauthorized
                    ? "No tienes autorización para consultar el detalle de esta ruta."
                    : "No se pudo cargar el detalle de la ruta seleccionada."}
                </StatusMessage>
              )}
              {detail && (
                <>
                  <Card className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
                          <Truck className="h-4 w-4" />
                          Ruta seleccionada
                        </p>
                        <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.05em] sm:text-3xl">
                          {detail.name}
                        </h2>
                        <p className="mt-2 break-words text-sm leading-6 text-[var(--erp-muted-foreground)]">
                          {isLogisticsRoute
                            ? `${routeTypeLabel(detail.type)} · ${logisticsStop?.origin?.name ?? "Sin origen"} → ${logisticsStop?.destination?.name ?? "Sin destino"} · Unidad ${detail.vehicle?.displayName ?? "sin asignar"}`
                            : `Origen ${detail.originLocationName ?? shortId(detail.originLocationId)} · Unidad ${detail.vehicle?.displayName ?? "sin asignar"} · ROUTE_STOCK ${detail.routeStockLocationName ?? shortId(detail.routeStockLocationId)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {canOpenDriverNavigation(detail) && (
                          <Link
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-4 py-2 text-sm font-black text-white transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]"
                            to={`/my-routes/${detail.id}/navigation`}
                          >
                            <Navigation aria-hidden="true" className="h-4 w-4" />
                            Abrir navegación
                          </Link>
                        )}
                        <RouteStatusBadge status={detail.status} />
                      </div>
                    </div>
                    {isLogisticsRoute ? (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            <CheckCircle2 className="h-4 w-4 text-[var(--erp-success)]" />
                            Parada física
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {logisticsStopCompleted
                              ? "Confirmada"
                              : "Pendiente"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            Traslado
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {logisticsStop?.transferNumber ?? "Sin traslado"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            Origen
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {logisticsStop?.origin?.name ?? "Sin origen"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            Destino
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {logisticsStop?.destination?.name ?? "Sin destino"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            <CheckCircle2 className="h-4 w-4 text-[var(--erp-success)]" />
                            Pedidos cerrados
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {finalOrders}/{orders.length}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            <BadgeDollarSign className="h-4 w-4 text-[var(--erp-info)]" />
                            Esperado
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {money(detail.collectionsSummary?.expectedAmount)}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            <BadgeDollarSign className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />
                            Cobrado
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {money(
                              detail.collectionsSummary?.derivedCollectedAmount,
                            )}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4">
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                            <ClipboardList className="h-4 w-4 text-[var(--erp-danger)]" />
                            Liquidación
                          </p>
                          <p className="mt-2 break-words text-base font-black sm:text-xl">
                            {detail.routeSettlementId
                              ? shortId(detail.routeSettlementId)
                              : "Sin asociar"}
                          </p>
                        </div>
                      </div>
                    )}
                  </Card>

                  {isLogisticsRoute && logisticsStop && (
                    <LogisticsTransportProgress
                      routeStatus={detail.status}
                      stopStatus={logisticsStop.status}
                    />
                  )}

                  {detail.status === "PENDING" && (
                    <RouteStartControl
                      error={routeStatusError}
                      hasVehicle={Boolean(detail.vehicleId)}
                      isStarting={updateRouteStatus.isPending}
                      onStart={async () => {
                        setRouteStatusError(null);
                        try {
                          await updateRouteStatus.mutateAsync({
                            status: "IN_PROGRESS",
                          });
                        } catch (error) {
                          const message = routeStatusErrorMessage(
                            error,
                            "No se pudo iniciar la ruta.",
                          );
                          setRouteStatusError(message);
                          throw error;
                        }
                      }}
                      routeName={detail.name}
                      vehicleName={detail.vehicle?.displayName}
                    />
                  )}

                  {detail.status === "IN_PROGRESS" &&
                    isLogisticsRoute &&
                    logisticsStop && (
                      <>
                        <LogisticsStopConfirmationControl
                          canConfirm={canConfirmLogisticsArrival}
                          error={routeStatusError}
                          isCompleting={completeLogisticsStop.isPending}
                          onComplete={async () => {
                            setRouteStatusError(null);
                            try {
                              await completeLogisticsStop.mutateAsync({});
                            } catch (error) {
                              const message = routeStatusErrorMessage(
                                error,
                                "No se pudo confirmar la recepción física.",
                              );
                              setRouteStatusError(message);
                              throw error;
                            }
                          }}
                          routeName={detail.name}
                          stop={logisticsStop}
                        />
                        <LogisticsRouteCompletionControl
                          error={routeStatusError}
                          isCompleting={updateRouteStatus.isPending}
                          onComplete={async () => {
                            setRouteStatusError(null);
                            try {
                              await updateRouteStatus.mutateAsync({
                                status: "COMPLETED",
                              });
                            } catch (error) {
                              const message = routeStatusErrorMessage(
                                error,
                                "No se pudo terminar la ruta logística.",
                              );
                              setRouteStatusError(message);
                              throw error;
                            }
                          }}
                          routeName={detail.name}
                          stopCompleted={logisticsStopCompleted}
                        />
                      </>
                    )}

                  {detail.status === "IN_PROGRESS" && !isLogisticsRoute && (
                    <RouteCompletionControl
                      completedOrders={finalOrders}
                      error={routeStatusError}
                      isCompleting={updateRouteStatus.isPending}
                      onComplete={async () => {
                        setRouteStatusError(null);
                        try {
                          await updateRouteStatus.mutateAsync({
                            status: "COMPLETED",
                          });
                        } catch (error) {
                          const message = routeStatusErrorMessage(
                            error,
                            "No se pudo terminar la ruta.",
                          );
                          setRouteStatusError(message);
                          throw error;
                        }
                      }}
                      routeName={detail.name}
                      totalOrders={orders.length}
                    />
                  )}

                  <RouteLocationTrackingControl tracking={tracking} />

                  {(detail.mapAvailable && detail.geometry) ||
                  (isLogisticsRoute &&
                    hasMapCoordinates(logisticsStop?.origin) &&
                    hasMapCoordinates(logisticsStop?.destination)) ? (
                    <Card className="grid gap-4 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">
                            <MapPin className="h-4 w-4" />
                            Recorrido aprobado
                          </p>
                          <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">
                            Secuencia de reparto
                          </h3>
                          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
                            Este trazado es el mismo aprobado por
                            administración. No utiliza la ubicación del
                            dispositivo ni recalcula desvíos.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm font-black">
                          <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(47,111,115,0.10)] px-3 py-2 text-[var(--erp-info)]">
                            <Ruler className="h-4 w-4" />
                            {distanceLabel(detail.distanceMeters)}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(214,155,45,0.14)] px-3 py-2 text-[var(--erp-brand-gold-deep)]">
                            <Clock3 className="h-4 w-4" />
                            {durationLabel(detail.durationSeconds)}
                          </span>
                        </div>
                      </div>
                      <DriverRouteMap
                        destinationLocation={
                          isLogisticsRoute
                            ? logisticsStop?.destination
                            : undefined
                        }
                        geometry={detail.geometry}
                        currentLocation={tracking.lastPublishedPosition}
                        originLocation={
                          isLogisticsRoute ? logisticsStop?.origin : undefined
                        }
                        orders={orders}
                        routeName={detail.name}
                      />
                    </Card>
                  ) : (
                    <StatusMessage tone="empty">
                      Esta ruta histórica no tiene un trazado disponible.
                      Consulta la secuencia textual de entregas.
                    </StatusMessage>
                  )}

                  {isLogisticsRoute && logisticsStop ? (
                    <Card className="grid gap-4 p-4 sm:p-5">
                      <div className="rounded-2xl bg-[var(--erp-info)] p-4 text-white">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">
                          <ClipboardList className="h-4 w-4" />
                          Carga del traslado
                        </p>
                        <h3 className="mt-1 text-xl font-black tracking-[-0.04em] text-white">
                          Productos programados
                        </h3>
                        <p className="mt-1 text-sm text-white/75">
                          El DRIVER confirma únicamente el transporte. La
                          recepción, lotes y movimientos de stock se controlan
                          en inventario.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {logisticsStop.items.map((item) => (
                          <div
                            className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:rounded-2xl sm:p-4"
                            key={item.id}
                          >
                            <div className="min-w-0">
                              <p className="break-words font-black">
                                {item.productName ?? shortId(item.productId)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                                Unidad: {item.unit}
                              </p>
                            </div>
                            <p className="max-w-full shrink-0 text-right font-black">
                              {logisticsQuantityLabel(
                                item.quantityKg,
                                item.quantityPieces,
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : orders.length === 0 ? (
                    <StatusMessage tone="empty">
                      Esta ruta no muestra pedidos asignados.
                    </StatusMessage>
                  ) : (
                    <div className="grid gap-4">
                      {orders.map((order) => (
                        <div className="grid gap-2" key={order.id}>
                          <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--erp-danger)] text-white">
                              {order.stopSequence ?? "—"}
                            </span>
                            <span>
                              {distanceLabel(order.legDistanceMeters)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {durationLabel(order.legDurationSeconds)}
                            </span>
                          </div>
                          <DeliveryOrderCard
                            evidence={detail.evidenceSummary ?? []}
                            onCaptureEvidence={setEvidenceOrder}
                            onCollect={setCollectionOrder}
                            onIncident={setIncidentOrder}
                            onSecondPassCollect={setSecondPassCollectionOrder}
                            onUpdateStatus={setStatusOrder}
                            order={order}
                            routeSettlementId={detail.routeSettlementId}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </PageFrame>
      {detail && statusOrder && (
        <UpdateDeliveryStatusDialog
          onClose={() => setStatusOrder(null)}
          order={statusOrder}
          routeId={detail.id}
        />
      )}
      {detail && evidenceOrder && (
        <DeliveryEvidenceCapture
          onClose={() => setEvidenceOrder(null)}
          order={evidenceOrder}
          routeId={detail.id}
        />
      )}
      {detail && collectionOrder && (
        <RouteCollectionDialog
          onClose={() => setCollectionOrder(null)}
          onCollected={setLastCollection}
          order={collectionOrder}
          routeId={detail.id}
        />
      )}
      {detail && secondPassCollectionOrder && (
        <RouteSecondPassCollectionDialog
          onClose={() => setSecondPassCollectionOrder(null)}
          onCollected={setLastCollection}
          order={secondPassCollectionOrder}
          routeId={detail.id}
        />
      )}
      {detail && incidentOrder && (
        <DeliveryIncidentDialog
          onClose={() => setIncidentOrder(null)}
          order={incidentOrder}
          routeId={detail.id}
        />
      )}
    </PageShell>
  );
}
