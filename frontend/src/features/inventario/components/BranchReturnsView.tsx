import { useRef, useState } from "react";
import { toast } from "sonner";
import { AsyncState } from "./AsyncState";
import {
  useConfirmInventoryTransfer,
  useInventoryLocations,
  useInventoryTransfers,
} from "../hooks/useProducts";
import { hasPermission, PERMISSIONS, useAuth } from "../../auth";
import type {
  InventoryLocation,
  InventoryTransfer,
  InventoryTransferLine,
} from "../types";

type BranchReturnsViewProps = {
  canManage: boolean;
};

type BranchReturn = InventoryTransfer & {
  origin: InventoryLocation;
  destination: InventoryLocation;
};

const confirmableStatuses = new Set([
  "DRAFT",
  "PENDING",
  "REQUESTED",
  "IN_TRANSIT",
]);

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CANCELLED: "Cancelada",
    CONFIRMED: "Confirmada",
    DRAFT: "Pendiente",
    IN_TRANSIT: "En tránsito",
    PENDING: "Pendiente",
    REQUESTED: "Solicitada",
  };
  return labels[status] ?? status;
}

function quantityLabel(item: InventoryTransferLine) {
  const quantities: string[] = [];
  if ((item.quantityKg ?? 0) > 0) quantities.push(`${item.quantityKg} kg`);
  if ((item.quantityPieces ?? 0) > 0)
    quantities.push(`${item.quantityPieces} piezas`);
  return quantities.length > 0 ? quantities.join(" · ") : "Sin cantidad";
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo confirmar la devolución.";
}

function findBranchReturns(
  transfers: InventoryTransfer[] | undefined,
  locations: InventoryLocation[] | undefined,
): BranchReturn[] {
  const locationById = new Map(
    (locations ?? []).map((location) => [location.id, location]),
  );

  return (transfers ?? []).flatMap((transfer) => {
    const origin = locationById.get(transfer.originLocationId ?? "");
    const destination = locationById.get(transfer.destinationLocationId ?? "");

    if (
      !origin ||
      !destination ||
      origin.type !== "BRANCH" ||
      destination.type !== "DISTRIBUTION_CENTER" ||
      origin.parentId !== destination.id
    ) {
      return [];
    }

    return [{ ...transfer, origin, destination }];
  });
}

function ReturnItems({ items }: { items?: InventoryTransferLine[] }) {
  if (!items?.length) {
    return (
      <p className="text-sm text-[var(--erp-muted-foreground)]">
        Sin detalle de artículos.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--erp-border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--erp-surface-muted)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
          <tr>
            <th className="px-3 py-2">Producto</th>
            <th className="px-3 py-2">Unidad</th>
            <th className="px-3 py-2">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              className="border-t border-[var(--erp-border)]"
              key={`${item.productId}-${index}`}
            >
              <td className="px-3 py-2 font-semibold text-[var(--erp-foreground)]">
                {item.productName ?? item.productId}
              </td>
              <td className="px-3 py-2 text-[var(--erp-muted-foreground)]">
                {item.unit}
              </td>
              <td className="px-3 py-2 font-semibold tabular-nums">
                {quantityLabel(item)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BranchReturnsView({ canManage }: BranchReturnsViewProps) {
  const { user } = useAuth();
  const locations = useInventoryLocations();
  const transfers = useInventoryTransfers();
  const confirmTransfer = useConfirmInventoryTransfer();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const branchReturns = findBranchReturns(transfers.data, locations.data);
  const queryError = locations.error ?? transfers.error;
  const canConfirmReturns =
    canManage &&
    (user?.role === "ADMIN" ||
      (user?.role === "WAREHOUSE" &&
        hasPermission(user, PERMISSIONS.cedisReceiveReturns)));

  function getIdempotencyKey(transferId: string) {
    const existingKey = idempotencyKeys.current.get(transferId);
    if (existingKey) return existingKey;

    const key = createIdempotencyKey();
    idempotencyKeys.current.set(transferId, key);
    return key;
  }

  async function handleConfirm(transferId: string) {
    if (confirmTransfer.isPending) return;

    setActionError(null);
    setConfirmingId(transferId);
    try {
      await confirmTransfer.mutateAsync({
        id: transferId,
        idempotencyKey: getIdempotencyKey(transferId),
      });
      idempotencyKeys.current.delete(transferId);
      toast.success("Devolución a CEDIS confirmada.");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <header className="rounded-2xl bg-[var(--erp-brand-red)] p-5 text-white shadow-[0_14px_32px_rgba(157,45,36,0.16)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
          Recepción operativa
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-white">
          Devoluciones a CEDIS
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
          Confirma únicamente devoluciones vinculadas al ciclo CEDIS de una
          sucursal. La confirmación actualiza el inventario de la operación.
        </p>
      </header>

      {actionError && (
        <p
          className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <AsyncState
        empty={!branchReturns.length}
        emptyMessage="No hay devoluciones a CEDIS registradas. La devolución se registra desde el detalle de la sucursal en CEDIS y se confirma aquí."
        error={queryError}
        isLoading={!queryError && (locations.isLoading || transfers.isLoading)}
      >
        <div className="grid gap-4">
          {branchReturns.map((transfer) => {
            const canConfirm =
              canConfirmReturns && confirmableStatuses.has(transfer.status);
            const isConfirming =
              confirmingId === transfer.id && confirmTransfer.isPending;

            return (
              <article
                className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4"
                key={transfer.id}
              >
                <div className="flex flex-col gap-3 border-b border-[var(--erp-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                      Folio
                    </p>
                    <h3 className="mt-1 font-mono text-base font-bold text-[var(--erp-foreground)]">
                      {transfer.transferNumber ?? transfer.id}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                      {statusLabel(transfer.status)}
                    </span>
                    {canConfirm && (
                      <button
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--erp-success)] bg-[var(--erp-success)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(63,123,65,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={confirmTransfer.isPending}
                        onClick={() => void handleConfirm(transfer.id)}
                        type="button"
                      >
                        {isConfirming ? "Confirmando..." : "Confirmar devolución"}
                      </button>
                    )}
                    {!canConfirmReturns && canManage && (
                      <span
                        className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]"
                        role="status"
                      >
                        Solo lectura: autorización de recepción requerida.
                      </span>
                    )}
                  </div>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                      Sucursal
                    </dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-foreground)]">
                      {transfer.origin.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                      CEDIS
                    </dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-foreground)]">
                      {transfer.destination.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                      Artículos
                    </dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-foreground)]">
                      {transfer.itemsCount ?? transfer.items?.length ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                      Solicitud
                    </dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-foreground)]">
                      {transfer.requestedAt
                        ? new Date(transfer.requestedAt).toLocaleString("es-MX")
                        : "Sin fecha"}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-[var(--erp-foreground)]">
                    Productos y cantidades
                  </h4>
                  <ReturnItems items={transfer.items} />
                </div>
              </article>
            );
          })}
        </div>
      </AsyncState>
    </section>
  );
}
