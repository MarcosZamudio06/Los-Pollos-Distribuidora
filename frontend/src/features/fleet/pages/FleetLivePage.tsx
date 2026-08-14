import { useEffect, useMemo, useRef, useState } from "react";
import { RadioTower, RefreshCw, Wifi, WifiOff, Workflow } from "lucide-react";
import { ApiClientError } from "../../../lib/api";
import { hasPermission, PERMISSIONS, useAuth } from "../../auth";
import {
  Card,
  Field,
  PageFrame,
  PageShell,
  RouteHero,
  SecondaryLink,
  SelectInput,
  StatusMessage,
  TextInput,
} from "../../rutas-reparto/components/RouteUi";
import { DeliveryZonesPanel, type DeliveryZoneDraft } from "../components/DeliveryZonesPanel";
import { FleetLiveMap } from "../components/FleetLiveMap";
import { closeZonePolygon, zonePointsFromGeometry } from "../deliveryZoneUtils";
import { filterFleetItems, getDeliveryProgress } from "../fleetLiveUtils";
import { fleetService } from "../fleetService";
import {
  useDeliveryZones,
  useFleetHeatmap,
  useFleetLive,
  useFleetOrigins,
} from "../hooks";
import type {
  FleetConnectionState,
  FleetHeatmapFilters,
  FleetLiveFilters,
} from "../types";

const initialFilters: FleetLiveFilters = {
  originLocationId: "",
  routeId: "",
  vehicleId: "",
  search: "",
};

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initialHeatmapFilters(): Pick<FleetHeatmapFilters, "metric" | "from" | "to"> {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    metric: "DELIVERIES",
    from: dateInputValue(from),
    to: dateInputValue(to),
  };
}

function connectionCopy(state: FleetConnectionState) {
  switch (state) {
    case "connected":
      return { label: "Tiempo real conectado", tone: "success" as const };
    case "reconnecting":
      return { label: "Reconectando tiempo real", tone: "info" as const };
    case "error":
      return { label: "Error de conexión en tiempo real", tone: "error" as const };
    case "disconnected":
      return { label: "Tiempo real desconectado", tone: "error" as const };
    default:
      return { label: "Conectando tiempo real", tone: "info" as const };
  }
}

function formatTime(value?: string | null) {
  if (!value) return "Sin lectura";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin lectura"
    : date.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

function formatSpeed(speedKph: number | null | undefined) {
  return speedKph == null ? null : `${speedKph.toFixed(1)} km/h`;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "No fue posible guardar la zona.";
}

function FleetConnectionBadge({ state }: { state: FleetConnectionState }) {
  const status = connectionCopy(state);
  const Icon = state === "connected" ? Wifi : WifiOff;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${
        status.tone === "success"
          ? "border-[rgba(63,123,65,0.28)] bg-[rgba(63,123,65,0.12)] text-[var(--erp-success)]"
          : status.tone === "error"
            ? "border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]"
            : "border-[rgba(47,111,115,0.24)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]"
      }`}
    >
      <Icon aria-hidden="true" size={14} />
      {status.label}
    </span>
  );
}

export function FleetLivePage() {
  const { accessToken, user } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [heatmapControls, setHeatmapControls] = useState(
    initialHeatmapFilters,
  );
  const [draft, setDraft] = useState<DeliveryZoneDraft | null>(null);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [highlightedVehicleId, setHighlightedVehicleId] = useState<string | null>(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const origins = useFleetOrigins();
  const live = useFleetLive(filters.originLocationId);
  const heatmapFilters = useMemo<FleetHeatmapFilters>(
    () => ({
      ...heatmapControls,
      originLocationId: filters.originLocationId,
      vehicleId: filters.vehicleId,
      routeId: filters.routeId,
    }),
    [filters.originLocationId, filters.routeId, filters.vehicleId, heatmapControls],
  );
  const heatmap = useFleetHeatmap(heatmapFilters, showAnalytics);
  const zonesQuery = useDeliveryZones(filters.originLocationId);
  const snapshotItems = useMemo(() => live.data?.items ?? [], [live.data?.items]);
  const zones = zonesQuery.data ?? [];
  const canManageZones = hasPermission(user, PERMISSIONS.fleetZonesManage);
  const canManageVehicles = hasPermission(user, PERMISSIONS.fleetManage);
  const filteredItems = useMemo(
    () => filterFleetItems(snapshotItems, filters),
    [filters, snapshotItems],
  );
  const activeSelectedVehicleId = filteredItems.some(
    (item) => item.vehicle.id === selectedVehicleId,
  )
    ? selectedVehicleId
    : null;
  const selectedItem = filteredItems.find(
    (item) => item.vehicle.id === activeSelectedVehicleId,
  );
  const activeSelectedZoneId = zones.some((zone) => zone.id === selectedZoneId)
    ? selectedZoneId
    : null;
  const timelineEvents = useMemo(
    () =>
      (live.geofenceEvents ?? []).filter((event) => {
        if (filters.routeId && event.routeId !== filters.routeId) return false;
        if (filters.vehicleId && event.vehicleId !== filters.vehicleId) return false;
        return true;
      }),
    [filters.routeId, filters.vehicleId, live.geofenceEvents],
  );
  const visibleIncidents = useMemo(
    () =>
      filteredItems
        .flatMap((item) =>
          (item.incidents ?? []).map((incident) => ({ incident, item })),
        )
        .sort(
          (left, right) =>
            Date.parse(right.incident.occurredAt) -
            Date.parse(left.incident.occurredAt),
        ),
    [filteredItems],
  );

  const unitsInRoute = snapshotItems.filter(
    (item) => item.route.status === "IN_PROGRESS",
  ).length;
  const activeUnits = snapshotItems.filter(
    (item) => item.position && !item.stale,
  ).length;
  const staleUnits = snapshotItems.filter((item) => item.stale).length;
  const hasIncidentCounts = snapshotItems.some(
    (item) =>
      item.incidentCountActive !== undefined ||
      item.route.incidentCountActive !== undefined,
  );
  const activeIncidentCount = hasIncidentCounts
    ? snapshotItems.reduce(
        (total, item) =>
          total +
          (item.incidentCountActive ?? item.route.incidentCountActive ?? 0),
        0,
      )
    : live.incidentCount;
  const connection = connectionCopy(live.connectionState);

  useEffect(() => {
    const event = timelineEvents[0];
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      if (!event) {
        setHighlightedVehicleId(null);
        setHighlightedZoneId(null);
        highlightTimerRef.current = null;
        return;
      }
      setHighlightedVehicleId(event.vehicleId);
      setHighlightedZoneId(event.zoneId);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedVehicleId(null);
        setHighlightedZoneId(null);
        highlightTimerRef.current = null;
      }, 5_000);
    }, 0);
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [timelineEvents]);

  const updateFilter = (key: keyof FleetLiveFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === "vehicleId" && value) setSelectedVehicleId(value);
    if (key === "originLocationId") {
      setSelectedZoneId(null);
      setDraft(null);
    }
  };

  const updateHeatmapControl = (
    key: "metric" | "from" | "to",
    value: string,
  ) => {
    setHeatmapControls((current) => ({
      ...current,
      [key]: value,
    } as typeof current));
  };

  const startCreateZone = () => {
    const firstOrigin =
      filters.originLocationId || origins.data?.[0]?.id || "";
    setZoneError(null);
    setDraft({
      name: "",
      originLocationId: firstOrigin,
      isActive: true,
      points: [],
    });
  };

  const startEditZone = (zone: (typeof zones)[number]) => {
    setZoneError(null);
    setSelectedZoneId(zone.id);
    setDraft({
      id: zone.id,
      name: zone.name,
      originLocationId: zone.originLocationId,
      isActive: zone.isActive,
      points: zonePointsFromGeometry(zone),
    });
  };

  const saveZone = async () => {
    if (!draft) return;
    const geometry = closeZonePolygon(draft.points);
    if (!geometry) {
      setZoneError("El polígono requiere al menos 3 vértices distintos y un anillo cerrado.");
      return;
    }
    setZoneSaving(true);
    setZoneError(null);
    try {
      if (draft.id) {
        await fleetService.updateDeliveryZone(
          draft.id,
          {
            name: draft.name.trim(),
            originLocationId: draft.originLocationId,
            geometry,
          },
          accessToken,
        );
        setSelectedZoneId(draft.id);
      } else {
        const created = await fleetService.createDeliveryZone(
          {
            name: draft.name.trim(),
            originLocationId: draft.originLocationId,
            geometry,
            isActive: draft.isActive,
          },
          accessToken,
        );
        setSelectedZoneId(created.id);
      }
      await zonesQuery.refetch();
      setDraft(null);
    } catch (error) {
      setZoneError(errorMessage(error));
    } finally {
      setZoneSaving(false);
    }
  };

  const toggleZone = async (zone: (typeof zones)[number]) => {
    setZoneError(null);
    try {
      await fleetService.updateDeliveryZone(
        zone.id,
        { isActive: !zone.isActive },
        accessToken,
      );
      await zonesQuery.refetch();
    } catch (error) {
      setZoneError(errorMessage(error));
    }
  };

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={
            <div className="grid gap-2 sm:flex sm:items-center">
              {canManageVehicles && (
                <SecondaryLink to="/fleet/vehicles">
                  Administrar unidades
                </SecondaryLink>
              )}
              <FleetConnectionBadge state={live.connectionState} />
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-xs font-bold text-white/75">
                <RadioTower aria-hidden="true" size={14} />
                Snapshot + deltas
              </span>
            </div>
          }
          eyebrow="Operación · Fleet control"
          subtitle="Monitoreo administrativo de rutas activas. La posición, la geometría y las geocercas provienen de datos persistidos; este mapa no recalcula recorridos ni eventos."
          title="Monitoreo de flota en vivo"
        />

        <section aria-label="Indicadores de flota" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Unidades en ruta", unitsInRoute, "IN_PROGRESS"],
            ["GPS activo", activeUnits, "Con lectura reciente"],
            ["GPS stale", staleUnits, "Requieren atención"],
            ["Incidencias activas", activeIncidentCount, "OPEN / IN_REVIEW"],
          ].map(([label, value, hint]) => (
            <Card className="p-4" key={String(label)}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black tracking-[-0.06em] text-[var(--erp-foreground)]">
                {value}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                {hint}
              </p>
            </Card>
          ))}
        </section>

        <Card className="p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1.4fr_auto] xl:items-end">
            <Field label="Origen / CEDIS">
              <SelectInput
                aria-label="Filtrar por origen"
                onChange={(event) => updateFilter("originLocationId", event.target.value)}
                value={filters.originLocationId}
              >
                <option value="">Todos los orígenes</option>
                {(origins.data ?? []).map((origin) => (
                  <option key={origin.id} value={origin.id}>
                    {origin.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Ruta">
              <SelectInput
                aria-label="Filtrar por ruta"
                onChange={(event) => updateFilter("routeId", event.target.value)}
                value={filters.routeId}
              >
                <option value="">Todas las rutas</option>
                {snapshotItems.map((item) => (
                  <option key={item.route.id} value={item.route.id}>
                    {item.route.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Vehículo">
              <SelectInput
                aria-label="Filtrar por vehículo"
                onChange={(event) => updateFilter("vehicleId", event.target.value)}
                value={filters.vehicleId}
              >
                <option value="">Todos los vehículos</option>
                {snapshotItems.map((item) => (
                  <option key={item.vehicle.id} value={item.vehicle.id}>
                    {item.vehicle.code} · {item.vehicle.displayName}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Buscar unidad, conductor o ruta">
              <TextInput
                aria-label="Buscar en flota"
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Código, placa, conductor..."
                value={filters.search}
              />
            </Field>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                aria-pressed={showZones}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${showZones ? "border-[var(--erp-info)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]" : "border-[color:var(--erp-border)] bg-white text-[var(--erp-foreground)]"}`}
                onClick={() => setShowZones((visible) => !visible)}
                type="button"
              >
                <Workflow aria-hidden="true" size={14} />
                Zonas de reparto
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 text-xs font-black text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)]"
                onClick={() => void live.refetch()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={14} />
                Recuperar snapshot
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--erp-muted-foreground)]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--erp-success)]" />
              GPS reciente
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--erp-brand-gold)]" />
              Sin posición o stale
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--erp-info)]" />
              Zona activa
            </span>
            <span className="ml-auto">Última actualización: {formatTime(live.data?.serverTime)}</span>
          </div>
        </Card>

        <Card
          className="border-white/10 bg-[var(--erp-charcoal)] p-4 text-white sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-brand-gold-soft)]">
                Analítica histórica
              </p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.05em] text-white">
                Heatmap persistido
              </h2>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-white/65">
                Esta capa resume entregas e incidencias históricas por celdas PostGIS; no representa el estado realtime ni se actualiza con cada posición.
              </p>
            </div>
            <button
              aria-pressed={showAnalytics}
              className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-xs font-black transition ${showAnalytics ? "border-[var(--erp-brand-gold-soft)] bg-[rgba(214,155,45,0.16)] text-white" : "border-white/20 bg-white/5 text-white/75 hover:bg-white/10"}`}
              data-testid="fleet-analytics-toggle"
              onClick={() => setShowAnalytics((visible) => !visible)}
              type="button"
            >
              Analítica {showAnalytics ? "activa" : "inactiva"}
            </button>
          </div>
          {showAnalytics && (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/70">
                <span>Métrica</span>
                <SelectInput
                  aria-label="Métrica de heatmap"
                  className="border-white/15 bg-white/10 text-white"
                  onChange={(event) =>
                    updateHeatmapControl("metric", event.target.value)
                  }
                  value={heatmapControls.metric}
                >
                  <option className="text-[var(--erp-foreground)]" value="DELIVERIES">
                    Entregas realizadas
                  </option>
                  <option className="text-[var(--erp-foreground)]" value="INCIDENTS">
                    Incidencias
                  </option>
                </SelectInput>
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/70">
                <span>Desde</span>
                <TextInput
                  aria-label="Inicio del periodo analizado"
                  className="border-white/15 bg-white/10 text-white"
                  onChange={(event) =>
                    updateHeatmapControl("from", event.target.value)
                  }
                  type="date"
                  value={heatmapControls.from}
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/70">
                <span>Hasta</span>
                <TextInput
                  aria-label="Fin del periodo analizado"
                  className="border-white/15 bg-white/10 text-white"
                  onChange={(event) =>
                    updateHeatmapControl("to", event.target.value)
                  }
                  type="date"
                  value={heatmapControls.to}
                />
              </label>
            </div>
          )}
          {showAnalytics && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/65">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--erp-info)]" />
                Menor concentración
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--erp-brand-red)]" />
                Mayor concentración
              </span>
              <span className="ml-auto">
                Periodo: {heatmapControls.from} → {heatmapControls.to}
              </span>
            </div>
          )}
        </Card>

        {live.isLoading && <StatusMessage>Consultando snapshot de flota...</StatusMessage>}
        {live.isError && (
          <StatusMessage tone="error">
            No fue posible recuperar el snapshot de flota. Revisa la conexión y vuelve a intentarlo.
          </StatusMessage>
        )}
        {zonesQuery.isError && (
          <StatusMessage tone="error">
            No fue posible recuperar las zonas de reparto. El mapa mantiene las rutas autorizadas.
          </StatusMessage>
        )}
        {live.data && !live.isLoading && snapshotItems.length === 0 && (
          <StatusMessage tone="empty">No hay rutas activas con este origen.</StatusMessage>
        )}
        {showAnalytics && heatmap.isLoading && (
          <StatusMessage>Calculando heatmap histórico persistido...</StatusMessage>
        )}
        {showAnalytics && heatmap.isError && (
          <StatusMessage tone="error">
            No fue posible recuperar la analítica histórica. Ajusta el periodo o vuelve a intentarlo.
          </StatusMessage>
        )}
        {showAnalytics && heatmap.data && !heatmap.isLoading && heatmap.data.features.length === 0 && (
          <StatusMessage tone="empty">
            No hay {heatmapControls.metric === "DELIVERIES" ? "entregas realizadas" : "incidencias"} en el periodo analizado.
          </StatusMessage>
        )}

        <section className="grid min-h-[38rem] gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <FleetLiveMap
            editorActive={Boolean(draft)}
            editorPoints={draft?.points}
            highlightedVehicleId={highlightedVehicleId}
            highlightedZoneId={highlightedZoneId}
            heatmap={heatmap.data}
            items={filteredItems}
            onMapPoint={(point) => {
              if (!draft) return;
              setDraft((current) =>
                current ? { ...current, points: [...current.points, point] } : current,
              );
            }}
            onSelectVehicle={setSelectedVehicleId}
            onSelectZone={setSelectedZoneId}
            selectedVehicleId={activeSelectedVehicleId}
            selectedZoneId={activeSelectedZoneId}
            showZones={showZones}
            showHeatmap={showAnalytics}
            zones={zones}
          />

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-[color:var(--erp-border)] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                Unidades visibles
              </p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">
                {filteredItems.length} en operación
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] p-5 text-sm font-semibold text-[var(--erp-muted-foreground)]">
                  No hay unidades que coincidan con los filtros.
                </p>
              ) : (
                <div className="grid gap-2">
                  {filteredItems.map((item) => {
                    const selected = item.vehicle.id === activeSelectedVehicleId;
                    const speed = formatSpeed(item.position?.speedKph);
                    const progress = getDeliveryProgress(item);
                    return (
                      <button
                        aria-pressed={selected}
                        data-testid="fleet-unit-button"
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-[var(--erp-brand-red)] bg-[rgba(182,42,34,0.07)] shadow-[0_8px_24px_rgba(182,42,34,0.12)]"
                            : "border-[color:var(--erp-border)] bg-[var(--erp-surface)] hover:border-[rgba(47,111,115,0.45)]"
                        }`}
                        key={item.vehicle.id}
                        onClick={() => setSelectedVehicleId(item.vehicle.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--erp-foreground)]">
                              {item.vehicle.code} · {item.vehicle.displayName}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-[var(--erp-muted-foreground)]">
                              {item.driver.name} · {item.route.name}
                            </p>
                          </div>
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full ${
                              item.position && !item.stale
                                ? "bg-[var(--erp-success)]"
                                : "bg-[var(--erp-brand-gold)]"
                            }`}
                            title={item.position && !item.stale ? "GPS reciente" : "Sin posición o GPS stale"}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <span className="font-semibold text-[var(--erp-muted-foreground)]">
                            {speed ?? "Velocidad no disponible"}
                          </span>
                          <span className="text-right font-semibold text-[var(--erp-muted-foreground)]">
                            {formatTime(item.position?.recordedAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[0.68rem] font-black uppercase tracking-[0.12em]">
                          <span className="rounded-full bg-[rgba(47,111,115,0.10)] px-2 py-1 text-[var(--erp-info)]">
                            {progress.delivered}/{progress.total} pedidos
                          </span>
                          {item.stale && (
                            <span className="rounded-full bg-[rgba(214,155,45,0.14)] px-2 py-1 text-[var(--erp-brand-gold-deep)]">
                              GPS stale
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-[color:var(--erp-border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                  Timeline geocercas
                </p>
                <span className="rounded-full bg-[rgba(47,111,115,0.10)] px-2 py-1 text-xs font-black text-[var(--erp-info)]">
                  {timelineEvents.length}
                </span>
              </div>
              <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto">
                {timelineEvents.length === 0 ? (
                  <p className="text-xs font-semibold leading-5 text-[var(--erp-muted-foreground)]">
                    Aún no hay entradas o salidas recibidas en esta sesión.
                  </p>
                ) : (
                  timelineEvents.map((event) => (
                    <button
                      className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 text-left transition hover:border-[var(--erp-info)]"
                      key={event.eventId}
                      onClick={() => {
                        setSelectedVehicleId(event.vehicleId);
                        setSelectedZoneId(event.zoneId);
                      }}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2 text-xs font-black">
                        <span className={event.type === "ENTER" ? "text-[var(--erp-success)]" : "text-[var(--erp-danger)]"}>
                          {event.type === "ENTER" ? "Entrada" : "Salida"}
                        </span>
                        <span className="text-[var(--erp-muted-foreground)]">{formatTime(event.occurredAt)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-bold text-[var(--erp-foreground)]">
                        {event.zoneName} · {event.vehicleCode}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-5 border-t border-[color:var(--erp-border)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                    Incidencias trazables
                  </p>
                  <span className="rounded-full bg-[rgba(182,42,34,0.10)] px-2 py-1 text-xs font-black text-[var(--erp-brand-red)]">
                    {visibleIncidents.length}
                  </span>
                </div>
                <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
                  {visibleIncidents.length === 0 ? (
                    <p className="text-xs font-semibold leading-5 text-[var(--erp-muted-foreground)]">
                      No hay incidencias activas para los filtros actuales.
                    </p>
                  ) : (
                    visibleIncidents.map(({ incident, item }) => (
                      <button
                        className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 text-left transition hover:border-[var(--erp-brand-red)]"
                        key={incident.incidentId}
                        onClick={() => {
                          setSelectedVehicleId(item.vehicle.id);
                        }}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-black">
                          <span className="text-[var(--erp-brand-red)]">
                            Pedido {incident.deliveryOrderId}
                          </span>
                          <span className="text-[var(--erp-muted-foreground)]">
                            {formatTime(incident.occurredAt)}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs font-bold text-[var(--erp-foreground)]">
                          {item.vehicle.code} · {item.driver.name}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[var(--erp-muted-foreground)]">
                          {incident.reason}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-2 text-[0.68rem] font-black uppercase tracking-[0.1em]">
                          <span className="rounded-full bg-[rgba(182,42,34,0.10)] px-2 py-1 text-[var(--erp-brand-red)]">
                            {incident.status}
                          </span>
                          <span className="rounded-full bg-[rgba(47,111,115,0.10)] px-2 py-1 text-[var(--erp-info)]">
                            {incident.position
                              ? "GPS disponible"
                              : incident.stop
                                ? "Ubicación de parada"
                                : "GPS no disponible"}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <DeliveryZonesPanel
          canManage={canManageZones}
          draft={draft}
          error={zoneError}
          onCancelDraft={() => {
            setDraft(null);
            setZoneError(null);
          }}
          onClearPoints={() =>
            setDraft((current) => (current ? { ...current, points: [] } : current))
          }
          onDraftChange={(patch) =>
            setDraft((current) => (current ? { ...current, ...patch } : current))
          }
          onSave={() => void saveZone()}
          onSelectZone={setSelectedZoneId}
          onStartCreate={startCreateZone}
          onStartEdit={startEditZone}
          onToggleActive={(zone) => void toggleZone(zone)}
          origins={origins.data ?? []}
          saving={zoneSaving}
          selectedZoneId={activeSelectedZoneId}
          zones={zones}
        />

        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
            Unidad seleccionada
          </p>
          {selectedItem ? (
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-lg font-black text-[var(--erp-foreground)]">
                  {selectedItem.vehicle.code} · {selectedItem.vehicle.displayName}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--erp-muted-foreground)]">
                  {selectedItem.driver.name} · {selectedItem.vehicle.plateNumber ?? "Sin placa"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">Ruta</p>
                <p className="mt-1 text-sm font-bold text-[var(--erp-foreground)]">{selectedItem.route.name}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">{selectedItem.nextStop?.deliveryAddress ?? "Sin próxima parada"}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">Lectura</p>
                <p className="mt-1 text-sm font-bold text-[var(--erp-foreground)]">{formatSpeed(selectedItem.position?.speedKph) ?? "Velocidad no disponible"}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">{formatTime(selectedItem.position?.recordedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">Estado</p>
                <p className="mt-1 text-sm font-bold text-[var(--erp-foreground)]">{selectedItem.stale ? "GPS stale" : selectedItem.position ? "GPS reciente" : "Sin posición"}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">La ausencia de GPS no se interpreta como 0 km/h.</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[var(--erp-muted-foreground)]">
              Selecciona una unidad en la lista o en el mapa para ver su detalle operativo.
            </p>
          )}
        </Card>

        {connection.tone === "error" && (
          <StatusMessage tone="error">
            El snapshot REST permanece disponible como recuperación; los cambios nuevos se mostrarán al restablecer Socket.IO.
          </StatusMessage>
        )}
      </PageFrame>
    </PageShell>
  );
}
