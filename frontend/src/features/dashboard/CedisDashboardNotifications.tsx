import { Button } from "../../components/ui";
import {
  hasPermission,
  PERMISSIONS,
  useAuth,
  type AuthUser,
} from "../auth";
import {
  useInventoryLocations,
  useInventoryTransfers,
} from "../inventario/hooks/useProducts";
import { isPendingCedisReturnTransfer } from "../inventario/cedisReturnPredicates";
import type { InventoryLocation, InventoryTransfer } from "../inventario/types";
import { AlertRow, DataPanel } from "./dashboardComponents";

const CEDIS_DASHBOARD_REFRESH_INTERVAL_MS = 60_000;

function isInventoryCedisRole(user: AuthUser | null) {
  return Boolean(
    user && (user.role === "ADMIN" || user.role === "WAREHOUSE"),
  );
}

function RetryNotification({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      aria-live="assertive"
      className="flex flex-col gap-3 rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div>
        <p className="text-sm font-black text-[var(--erp-danger)]">
          No se pudieron cargar las devoluciones a CEDIS
        </p>
        <p className="mt-1 text-sm leading-5 text-[var(--erp-muted-foreground)]">
          Verifica la conexión y vuelve a intentarlo para consultar el estado
          actualizado.
        </p>
      </div>
      <Button onClick={onRetry} variant="secondary">
        Reintentar
      </Button>
    </div>
  );
}

function countPendingCedisReturns(
  transfers: InventoryTransfer[] | undefined,
  locations: InventoryLocation[] | undefined,
) {
  const locationsById = new Map(
    (locations ?? []).map((location) => [location.id, location]),
  );

  return (transfers ?? []).filter((transfer) =>
    isPendingCedisReturnTransfer(transfer, locationsById),
  ).length;
}

export function CedisDashboardNotifications() {
  const { user } = useAuth();
  const canReadBranchReturns = isInventoryCedisRole(user);
  const canOpenCedis =
    canReadBranchReturns && hasPermission(user, PERMISSIONS.cedisView);
  const queryOptions = {
    enabled: canReadBranchReturns,
    refetchInterval: canReadBranchReturns
      ? CEDIS_DASHBOARD_REFRESH_INTERVAL_MS
      : false,
  } as const;
  const locations = useInventoryLocations(queryOptions);
  const transfers = useInventoryTransfers(queryOptions);

  if (!canOpenCedis && !canReadBranchReturns) return null;

  const queryError = locations.error ?? transfers.error;
  const isLoading = locations.isLoading || transfers.isLoading;
  const pendingReturns = countPendingCedisReturns(
    transfers.data,
    locations.data,
  );

  function retryNotifications() {
    void Promise.all([locations.refetch(), transfers.refetch()]);
  }

  return (
    <DataPanel
      description="Accesos y devoluciones vinculados a la operación de CEDIS."
      eyebrow="Operación CEDIS"
      title="Notificaciones CEDIS"
    >
      {canOpenCedis && (
        <div aria-live="polite" role="status">
          <AlertRow
            action={{ label: "Abrir CEDIS", to: "/cedis" }}
            description="Puedes consultar las sucursales y jornadas de CEDIS desde el tablero operativo."
            severity="blue"
            title="Acceso directo a CEDIS"
          />
        </div>
      )}

      {canReadBranchReturns && isLoading ? (
        <div aria-live="polite" role="status">
          <AlertRow
            description="Estamos consultando los traspasos de sucursales hacia su CEDIS padre."
            severity="blue"
            title="Cargando devoluciones a CEDIS"
          />
        </div>
      ) : canReadBranchReturns && queryError ? (
        <RetryNotification onRetry={retryNotifications} />
      ) : canReadBranchReturns ? (
        <div aria-live="polite" role="status">
          <AlertRow
            action={
              pendingReturns > 0
                ? { label: "Revisar devoluciones", to: "/inventory" }
                : undefined
            }
            description={
              pendingReturns > 0
                ? "Traspasos de sucursales pendientes de recepción en CEDIS."
                : "No hay traspasos de sucursales pendientes de recepción en CEDIS."
            }
            severity={pendingReturns > 0 ? "amber" : "green"}
            title={
              pendingReturns > 0
                ? `${pendingReturns} devoluciones a CEDIS pendientes`
                : "Devoluciones a CEDIS al día"
            }
          />
        </div>
      ) : null}
    </DataPanel>
  );
}
