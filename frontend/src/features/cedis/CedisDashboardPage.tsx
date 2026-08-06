import { useDeferredValue, useMemo } from "react";
import { RefreshCw, Warehouse } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "../../components/layout/PageContainer";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
} from "../../components/ui";
import {
  EmptyState,
  FreshnessBar,
  LoadingState,
} from "../dashboard/dashboardComponents";
import { useAuth } from "../auth";
import { getOperationalDate } from "../../lib/operationalDate";
import { CedisBranchCard } from "./CedisBranchCard";
import { CedisFilters, type CedisFilterValues } from "./CedisFilters";
import {
  useCedisDashboard,
  useCedisLocations,
  useOperationalLocation,
} from "./hooks";
import type { CedisCycleStatus, CedisLocation } from "./types";

const cedisCycleStatuses = new Set<CedisCycleStatus>([
  "OPEN",
  "READY_FOR_REVIEW",
  "CLOSED",
  "CANCELLED",
]);

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function freshnessSeconds(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function getCedisLocationForSeller(location?: CedisLocation) {
  if (!location?.parentId) return [];
  return [
    {
      id: location.parentId,
      name: "CEDIS asignado",
      code: null,
      type: "DISTRIBUTION_CENTER",
      isActive: true,
    } satisfies CedisLocation,
  ];
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-[rgba(157,45,36,0.25)] p-6" role="alert">
      <Badge tone="red">Error de consulta</Badge>
      <CardTitle className="mt-3">No se pudo cargar el tablero CEDIS</CardTitle>
      <CardDescription className="mt-2">
        Verifica la conexión y vuelve a intentar la consulta de sucursales.
      </CardDescription>
      <Button className="mt-5" onClick={onRetry} variant="secondary">
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Reintentar
      </Button>
    </Card>
  );
}

function CedisLoadingState() {
  return (
    <div aria-label="Cargando datos CEDIS" role="status">
      <LoadingState cards={6} />
    </div>
  );
}

export function CedisDashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSeller = user?.role === "SELLER";
  const cedisLocationsQuery = useCedisLocations(!isSeller);
  const assignedLocationQuery = useOperationalLocation(
    isSeller ? user?.operationalLocationId : undefined,
    isSeller,
  );
  const searchInput = searchParams.get("q") ?? "";
  const deferredSearch = useDeferredValue(searchInput);
  const operationalDate = getOperationalDate();

  const cedisLocations = useMemo(
    () =>
      isSeller
        ? getCedisLocationForSeller(assignedLocationQuery.data)
        : (cedisLocationsQuery.data ?? []),
    [assignedLocationQuery.data, cedisLocationsQuery.data, isSeller],
  );
  const defaultCedisId =
    cedisLocations[0]?.id ??
    (!isSeller ? (user?.operationalLocationId ?? "") : "");
  const cedisLocationId = isSeller
    ? (assignedLocationQuery.data?.parentId ?? "")
    : searchParams.get("cedis") || defaultCedisId;
  const businessDate = searchParams.get("date") || operationalDate;
  const rawStatus = searchParams.get("status");
  const status = cedisCycleStatuses.has(rawStatus as CedisCycleStatus)
    ? (rawStatus as CedisCycleStatus)
    : undefined;
  const selectedCedis = cedisLocations.find(
    (location) => location.id === cedisLocationId,
  );
  const filters = useMemo<CedisFilterValues>(
    () => ({
      businessDate,
      cedisLocationId,
      search: searchInput,
      status,
    }),
    [businessDate, cedisLocationId, searchInput, status],
  );
  const dashboardFilters = useMemo(
    () =>
      cedisLocationId
        ? {
            businessDate,
            cedisLocationId,
            search: deferredSearch.trim() || undefined,
            status,
          }
        : null,
    [businessDate, cedisLocationId, deferredSearch, status],
  );
  const dashboardQuery = useCedisDashboard(dashboardFilters);
  const catalogLoading = isSeller
    ? assignedLocationQuery.isLoading
    : cedisLocationsQuery.isLoading;
  const catalogError = isSeller
    ? assignedLocationQuery.error
    : cedisLocationsQuery.error;

  function updateFilters(next: CedisFilterValues) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("date", next.businessDate || operationalDate);
    if (next.cedisLocationId) nextParams.set("cedis", next.cedisLocationId);
    else nextParams.delete("cedis");
    if (next.status) nextParams.set("status", next.status);
    else nextParams.delete("status");
    if (next.search.trim()) nextParams.set("q", next.search);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  }

  function clearFilters() {
    updateFilters({
      businessDate: operationalDate,
      cedisLocationId: defaultCedisId,
      search: "",
      status: undefined,
    });
  }

  const refreshCatalog = () => {
    void (isSeller
      ? assignedLocationQuery.refetch()
      : cedisLocationsQuery.refetch());
  };

  return (
    <PageContainer>
      <section className="mx-auto flex max-w-[96rem] flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-[var(--erp-shadow-elevated)] sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(214,155,45,0.18),transparent_34%),linear-gradient(135deg,transparent,rgba(182,42,34,0.08))]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-brand-gold-deep)]">
                <Warehouse aria-hidden="true" className="h-4 w-4" />
                Control CEDIS
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] sm:text-5xl">
                CEDIS / Sucursales
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--erp-muted-foreground)]">
                Supervisa entregas, devoluciones, ventas y caja por sucursal sin
                perder la trazabilidad de la jornada operativa.
              </p>
            </div>
            <div className="relative rounded-[1.35rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 p-4 backdrop-blur sm:min-w-64">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]">
                CEDIS consultado
              </p>
              <p className="mt-2 text-lg font-black">
                {selectedCedis?.name ?? "Sin CEDIS seleccionado"}
              </p>
              <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
                {selectedCedis?.code ?? "Selecciona un CEDIS autorizado"}
              </p>
            </div>
          </div>
        </header>

        <CedisFilters
          cedisLocations={cedisLocations}
          cedisLocationsError={catalogError}
          cedisLocationsLoading={catalogLoading}
          filters={filters}
          onChange={updateFilters}
          onClear={clearFilters}
        />

        {catalogError ? (
          <ErrorState onRetry={refreshCatalog} />
        ) : catalogLoading ? (
          <CedisLoadingState />
        ) : !cedisLocationId ? (
          <EmptyState
            description="No hay un CEDIS autorizado para tu usuario. Revisa la ubicación operativa asignada."
            title="Selecciona un CEDIS para comenzar"
          />
        ) : dashboardQuery.isLoading ? (
          <CedisLoadingState />
        ) : dashboardQuery.error ? (
          <ErrorState onRetry={() => void dashboardQuery.refetch()} />
        ) : dashboardQuery.data ? (
          <>
            <FreshnessBar
              dataAsOf={formatDateTime(dashboardQuery.data.dataAsOf)}
              freshnessSeconds={freshnessSeconds(
                dashboardQuery.data.generatedAt,
              )}
              generatedAt={formatDateTime(dashboardQuery.data.generatedAt)}
              isStale={freshnessSeconds(dashboardQuery.data.generatedAt) > 60}
            />
            {dashboardQuery.isFetching && (
              <p
                aria-live="polite"
                className="text-right text-xs font-bold text-[var(--erp-muted-foreground)]"
              >
                Actualizando datos…
              </p>
            )}
            {dashboardQuery.data.items.length === 0 ? (
              <EmptyState
                description="Prueba otra fecha, estado o búsqueda. El CEDIS no tiene sucursales que coincidan con los filtros actuales."
                title="No hay sucursales para estos filtros"
              />
            ) : (
              <div
                aria-label="Sucursales del CEDIS"
                className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
                role="list"
              >
                {dashboardQuery.data.items.map((item) => (
                  <div key={item.branch.id} role="listitem">
                    <CedisBranchCard
                      businessDate={businessDate}
                      cedisLocationId={cedisLocationId}
                      item={item}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
    </PageContainer>
  );
}
