import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Package,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog } from "../../components/shared/confirmation-dialog";
import { getOperationalDate } from "../../lib/operationalDate";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { useCedisReturns, useCompleteCedisReturn } from "./hooks";
import type { CedisBranchReturn, CedisBranchReturnStatus } from "./types";

type CedisReturnsReviewViewProps = {
  canReceiveReturns: boolean;
};

const statusLabels: Record<CedisBranchReturnStatus, string> = {
  PENDING: "Pendiente",
  COMPLETED: "Confirmada",
  CANCELLED: "Cancelada",
};

function statusTone(status: CedisBranchReturnStatus) {
  if (status === "COMPLETED") return "green" as const;
  if (status === "CANCELLED") return "red" as const;
  return "amber" as const;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatQuantity(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function itemQuantityLabel(item: CedisBranchReturn["items"][number]) {
  const quantities = [];
  if (item.quantityKg > 0)
    quantities.push(`${formatQuantity(item.quantityKg)} kg`);
  if (item.quantityPieces > 0)
    quantities.push(`${formatQuantity(item.quantityPieces, 0)} pzas.`);
  return quantities.join(" · ") || "Sin cantidad";
}

function itemsSummary(returnItem: CedisBranchReturn) {
  const [firstItem, ...remainingItems] = returnItem.items;
  if (!firstItem) return "Sin productos";
  const extraItems = remainingItems.length
    ? ` + ${remainingItems.length} más`
    : "";
  return `${firstItem.productName} · ${itemQuantityLabel(firstItem)}${extraItems}`;
}

function ReturnItemsDetail({ returnItem }: { returnItem: CedisBranchReturn }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--erp-brand-red)]">
            Mercancía devuelta
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--erp-foreground)]">
            Revisa las cantidades antes de confirmar la recepción.
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--erp-muted-foreground)]">
          {returnItem.items.length} producto(s)
        </span>
      </div>
      <div
        aria-label="Productos devueltos"
        className="grid divide-y divide-[var(--erp-border)] overflow-hidden rounded-xl border border-[var(--erp-border)] bg-white"
        role="list"
      >
        {returnItem.items.map((item) => (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3"
            key={item.transferItemId}
            role="listitem"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--erp-foreground)]">
                {item.productName}
              </p>
              <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                {item.unit === "KG_AND_PIECE"
                  ? "Kilogramos y piezas"
                  : item.unit === "KG"
                    ? "Kilogramos"
                    : item.unit === "PIECE"
                      ? "Piezas"
                      : item.unit}
              </p>
            </div>
            <span className="shrink-0 text-right text-sm font-bold text-[var(--erp-foreground)]">
              {itemQuantityLabel(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReturnSummary({ returnItem }: { returnItem: CedisBranchReturn }) {
  return (
    <div className="grid gap-1">
      <strong className="font-semibold text-[var(--erp-foreground)]">
        {returnItem.transferNumber}
      </strong>
      <span className="text-xs text-[var(--erp-muted-foreground)]">
        {returnItem.items.length} producto(s) · {itemsSummary(returnItem)}
      </span>
    </div>
  );
}

export function CedisReturnsReviewView({
  canReceiveReturns,
}: CedisReturnsReviewViewProps) {
  const [businessDate, setBusinessDate] = useState(getOperationalDate());
  const [status, setStatus] = useState<CedisBranchReturnStatus | "ALL">("ALL");
  const [returnToConfirm, setReturnToConfirm] =
    useState<CedisBranchReturn | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const returns = useCedisReturns({
    businessDate,
    status,
    page: 1,
    limit: 100,
  });
  const completeReturn = useCompleteCedisReturn();
  const items = returns.data?.items ?? [];
  const pendingCount = items.filter((item) => item.status === "PENDING").length;
  const completedCount = items.filter(
    (item) => item.status === "COMPLETED",
  ).length;

  async function confirmReturn() {
    if (!returnToConfirm) return;
    setActionError(null);
    try {
      await completeReturn.mutateAsync({ transferId: returnToConfirm.id });
      toast.success(
        "Recepción confirmada. El inventario del CEDIS fue actualizado.",
      );
      setReturnToConfirm(null);
    } catch (error) {
      setActionError(errorMessage(error, "No se pudo confirmar la recepción."));
      throw error;
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <header className="rounded-2xl border border-[var(--erp-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgba(157,45,36,0.10)] text-[var(--erp-brand-red)]">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--erp-brand-red)]">
                Recepción en CEDIS
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[var(--erp-foreground)]">
                Devoluciones a CEDIS
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
                Consulta las devoluciones hechas por las sucursales y confirma
                únicamente la mercancía recibida físicamente en la matriz.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-[rgba(63,123,65,0.22)] bg-[rgba(63,123,65,0.08)] px-4 py-3 text-sm font-semibold text-[var(--erp-success)]">
            La confirmación actualiza el inventario de la matriz.
          </div>
        </div>
      </header>

      <Card className="grid gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Recepciones registradas</CardTitle>
            <CardDescription className="mt-1">
              Filtra por fecha operativa y estado para revisar la trazabilidad
              de cada devolución.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
              Fecha operativa
              <span className="relative">
                <CalendarDays
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--erp-muted-foreground)]"
                />
                <input
                  aria-label="Fecha operativa"
                  className="h-10 rounded-xl border border-[var(--erp-border)] bg-white pl-9 pr-3 text-sm text-[var(--erp-foreground)] outline-none focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]"
                  type="date"
                  value={businessDate}
                  onChange={(event) => setBusinessDate(event.target.value)}
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
              Estado
              <select
                aria-label="Estado de devolución"
                className="h-10 rounded-xl border border-[var(--erp-border)] bg-white px-3 text-sm text-[var(--erp-foreground)] outline-none focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as CedisBranchReturnStatus | "ALL",
                  )
                }
              >
                <option value="ALL">Todas</option>
                <option value="PENDING">Pendientes</option>
                <option value="COMPLETED">Confirmadas</option>
                <option value="CANCELLED">Canceladas</option>
              </select>
            </label>
            <Button
              aria-label="Actualizar devoluciones"
              disabled={returns.isFetching}
              onClick={() => void returns.refetch()}
              variant="secondary"
            >
              <RefreshCw
                className={
                  returns.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              Pendientes
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--erp-danger)]">
              {pendingCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              Confirmadas
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--erp-success)]">
              {completedCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              Registros visibles
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--erp-info)]">
              {items.length}
            </p>
          </div>
        </div>
      </Card>

      {returns.isLoading ? (
        <Card
          className="p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]"
          role="status"
        >
          Cargando devoluciones de la matriz…
        </Card>
      ) : returns.error ? (
        <Card className="border-[rgba(157,45,36,0.25)] p-5" role="alert">
          <p className="font-semibold text-[var(--erp-danger)]">
            No se pudieron cargar las devoluciones de CEDIS.
          </p>
          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
            {errorMessage(
              returns.error,
              "Verifica la sesión y vuelve a intentar.",
            )}
          </p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="mx-auto h-10 w-10 text-[var(--erp-muted-foreground)]" />
          <CardTitle className="mt-4">
            No hay devoluciones para esta fecha
          </CardTitle>
          <CardDescription className="mt-2">
            Cuando una sucursal registre mercancía no vendida, aparecerá aquí
            para su recepción en CEDIS.
          </CardDescription>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Estado</Th>
                  <Th>Devolución</Th>
                  <Th>Sucursal</Th>
                  <Th>Solicitada</Th>
                  <Th className="text-right">Acción</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((returnItem) => (
                  <tr key={returnItem.id}>
                    <Td>
                      <Badge tone={statusTone(returnItem.status)}>
                        {statusLabels[returnItem.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <ReturnSummary returnItem={returnItem} />
                    </Td>
                    <Td>
                      <div className="grid gap-1">
                        <strong>{returnItem.cycle.branch.name}</strong>
                        <span className="text-xs text-[var(--erp-muted-foreground)]">
                          Destino: {returnItem.cycle.distributionCenter.name}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-xs text-[var(--erp-muted-foreground)]">
                      {formatDateTime(returnItem.requestedAt)}
                    </Td>
                    <Td className="text-right">
                      {returnItem.status === "PENDING" && canReceiveReturns ? (
                        <Button
                          onClick={() => {
                            setActionError(null);
                            setReturnToConfirm(returnItem);
                          }}
                          size="sm"
                        >
                          <CheckCircle2
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Confirmar recepción
                        </Button>
                      ) : returnItem.status === "PENDING" ? (
                        <span className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
                          Sin permiso de recepción
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--erp-muted-foreground)]">
                          {returnItem.status === "COMPLETED"
                            ? formatDateTime(returnItem.confirmedAt)
                            : "Sin acción"}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      <ConfirmationDialog
        open={Boolean(returnToConfirm)}
        title="Confirmar recepción en CEDIS"
        description="Confirma que la mercancía regresó físicamente a la matriz. El inventario del CEDIS aumentará con estas cantidades y quedará registrado el movimiento de entrada."
        confirmLabel="Confirmar recepción"
        isLoading={completeReturn.isPending}
        onConfirm={confirmReturn}
        onOpenChange={(open) => {
          if (!open) {
            setActionError(null);
            setReturnToConfirm(null);
          }
        }}
      >
        {returnToConfirm && (
          <div className="grid gap-2">
            <p>
              <strong>Folio:</strong> {returnToConfirm.transferNumber}
            </p>
            <p>
              <strong>Sucursal:</strong> {returnToConfirm.cycle.branch.name}
            </p>
            <p>
              <strong>Productos:</strong> {itemsSummary(returnToConfirm)}
            </p>
            <ReturnItemsDetail returnItem={returnToConfirm} />
            {actionError && (
              <p
                className="font-semibold text-[var(--erp-danger)]"
                role="alert"
              >
                {actionError}
              </p>
            )}
          </div>
        )}
      </ConfirmationDialog>
    </section>
  );
}
