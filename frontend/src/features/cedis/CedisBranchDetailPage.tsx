import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Store,
  Undo2,
  WalletCards,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageContainer } from "../../components/layout/PageContainer";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Input,
} from "../../components/ui";
import { formatMoney } from "../../lib/money";
import { getOperationalDate } from "../../lib/operationalDate";
import { useAuth } from "../auth";
import { hasPermission, PERMISSIONS } from "../auth/permissions";
import { useProducts } from "../inventario/hooks/useProducts";
import {
  useCedisBranchHistory,
  useCedisCycleSummary,
  useCancelCedisCycle,
  useCloseCedisCycle,
  useCreateCedisReturn,
  useCreateCedisSupply,
  useOpenCedisCycle,
  useOperationalLocation,
  useRefreshCedisCycle,
  useReopenCedisCycle,
} from "./hooks";
import {
  cashState,
  cedisCycleStatusLabels,
  cedisCycleStatusTones,
  formatCoordinates,
  formatPhysicalQuantity,
} from "./cedisPresentation";
import { CedisTransferCommandPanel } from "./CedisTransferCommandPanel";
import type {
  CedisBranchHistoryResponse,
  CedisCashMovementSummary,
  CedisCycleCommand,
  CedisCycleItem,
  CedisCycleSummary,
  CedisDashboardCard,
  CedisDashboardLocation,
  CedisMutationInput,
} from "./types";

const HISTORY_LIMIT = 31;

type TransferMode = "SUPPLY" | "RETURN";
type ActionType = "OPEN" | "CLOSE" | "REOPEN" | "CANCEL";
type ActionRequest = {
  type: ActionType;
  idempotencyKey: string;
  payload:
    | {
        distributionCenterLocationId: string;
        branchLocationId: string;
        businessDate: string;
        notes?: string;
      }
    | { expectedVersion: number }
    | { expectedVersion: number; reason: string };
};

function firstDayOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function lastDayOfMonth(date: string) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
  }).format(date);
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function quantity(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function balanceQuantity(quantityKg: number, quantityPieces: number): string {
  const values: string[] = [];
  if (quantityKg !== 0) values.push(`${quantity(quantityKg)} kg`);
  if (quantityPieces !== 0) values.push(`${quantity(quantityPieces)} piezas`);
  return values.length > 0 ? values.join(" · ") : "0";
}

function money(value: string | number | null | undefined) {
  return value === null || value === undefined ? "—" : formatMoney(value);
}

function locationFromValue(
  value: CedisDashboardLocation | undefined,
  fallback: {
    id: string;
    name: string;
    code?: string | null;
    address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  },
): CedisDashboardLocation {
  return (
    value ?? {
      id: fallback.id,
      name: fallback.name,
      code: fallback.code ?? null,
      address: fallback.address ?? null,
      latitude: fallback.latitude ?? null,
      longitude: fallback.longitude ?? null,
    }
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "payload" in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.message === "string") return record.message;
      if (typeof record.code === "string") {
        return `La operación fue rechazada (${record.code}).`;
      }
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function apiErrorCode(error: unknown) {
  if (error && typeof error === "object" && "payload" in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.code === "string") return record.code;
      if (typeof record.error === "string") return record.error;
    }
  }
  return null;
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const toneClass = {
    neutral: "border-[color:var(--erp-border)] bg-[var(--erp-surface)]",
    positive: "border-emerald-200 bg-emerald-50/60",
    warning: "border-amber-200 bg-amber-50/70",
    negative: "border-red-200 bg-red-50/70",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-2 text-lg font-black tabular-nums">{value}</dd>
      {detail && (
        <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
          {detail}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] p-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-lg font-black tracking-[-0.03em]">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function LoadingState() {
  return (
    <div
      aria-label="Cargando detalle de sucursal"
      className="grid gap-5"
      role="status"
    >
      <div className="h-48 animate-pulse rounded-[2rem] bg-[var(--erp-surface-muted)]" />
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-2xl bg-[var(--erp-surface-muted)]" />
        <div className="h-96 animate-pulse rounded-2xl bg-[var(--erp-surface-muted)]" />
      </div>
    </div>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-[rgba(157,45,36,0.25)] p-6" role="alert">
      <Badge tone="red">Error de consulta</Badge>
      <CardTitle className="mt-3">No se pudo cargar el detalle</CardTitle>
      <CardDescription className="mt-2">
        Vuelve a intentarlo para consultar la sucursal y su historial.
      </CardDescription>
      <Button className="mt-5" onClick={onRetry} variant="secondary">
        <RefreshCw aria-hidden="true" className="h-4 w-4" /> Reintentar
      </Button>
    </Card>
  );
}

function HistoryList({
  businessDate,
  history,
  onSelect,
  onPageChange,
}: {
  businessDate: string;
  history: CedisBranchHistoryResponse | undefined;
  onSelect: (date: string, cycleId?: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Bitácora"
        title="Historial diario"
        description="Selecciona una fecha para consultar su conciliación y operaciones."
        action={<Badge tone="blue">{history?.total ?? 0} jornadas</Badge>}
      />
      <div className="p-3">
        {history?.items.length ? (
          <div className="space-y-1" role="list">
            {history.items.map((item) => {
              const date = item.cycle?.businessDate;
              const selected = date === businessDate;
              return (
                <button
                  aria-current={selected ? "date" : undefined}
                  className={`relative w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)] ${selected ? "border-[var(--erp-brand-red)] bg-[rgba(182,42,34,0.07)]" : "border-transparent hover:border-[color:var(--erp-border)] hover:bg-[var(--erp-surface)]"}`}
                  key={
                    item.cycle?.id ??
                    `${item.branch.id}-${date ?? item.lastActivityAt}`
                  }
                  onClick={() => date && onSelect(date, item.cycle?.id)}
                  role="listitem"
                  type="button"
                >
                  {selected && (
                    <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--erp-brand-red)]" />
                  )}
                  <span className="flex items-center justify-between gap-3 pl-1">
                    <span>
                      <strong className="block text-sm">
                        {date ? dateLabel(date) : "Sin fecha"}
                      </strong>
                      <span className="mt-1 block text-xs text-[var(--erp-muted-foreground)]">
                        {item.financial
                          ? `${money(item.financial.actualSales)} ventas reales`
                          : "Sin operación registrada"}
                      </span>
                    </span>
                    <StatusBadge cycle={item.cycle} />
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2 pl-1 text-[0.68rem] text-[var(--erp-muted-foreground)]">
                    <span>
                      {item.warningCount
                        ? `${item.warningCount} advertencia(s)`
                        : "Sin advertencias"}
                    </span>
                    {item.cash && (
                      <span className="tabular-nums">
                        Caja {money(item.cash.difference)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[color:var(--erp-border)] p-6 text-center text-sm text-[var(--erp-muted-foreground)]">
            No hay ciclos registrados en este mes. Puedes abrir el ciclo de la
            fecha seleccionada si tienes permiso.
          </div>
        )}
      </div>
      {history && history.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[color:var(--erp-border)] px-5 py-3 text-sm">
          <span className="text-[var(--erp-muted-foreground)]">
            Página {history.page} de {history.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={history.page <= 1}
              onClick={() => onPageChange(history.page - 1)}
              size="sm"
              variant="ghost"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              disabled={history.page >= history.totalPages}
              onClick={() => onPageChange(history.page + 1)}
              size="sm"
              variant="ghost"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ cycle }: { cycle: CedisDashboardCard["cycle"] }) {
  return cycle ? (
    <Badge tone={cedisCycleStatusTones[cycle.status]}>
      {cedisCycleStatusLabels[cycle.status]}
    </Badge>
  ) : (
    <Badge tone="slate">Sin ciclo</Badge>
  );
}

function Header({
  branch,
  cedis,
  selectedDate,
  cycle,
  onDateChange,
}: {
  branch: CedisDashboardLocation;
  cedis: CedisDashboardLocation;
  selectedDate: string;
  cycle: CedisCycleSummary | null;
  onDateChange: (value: string) => void;
}) {
  const coordinates = formatCoordinates(branch.latitude, branch.longitude);
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-[var(--erp-shadow-elevated)] sm:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(214,155,45,0.18),transparent_34%),linear-gradient(135deg,transparent,rgba(182,42,34,0.08))]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[rgba(47,111,115,0.12)] text-[var(--erp-info)]">
            <Store aria-hidden="true" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-deep)]">
              Detalle de sucursal
            </p>
            <h1 className="mt-2 truncate text-3xl font-black tracking-[-0.06em] sm:text-4xl">
              {branch.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-[var(--erp-muted-foreground)]">
              <span>{branch.code ?? "Sin código"}</span>
              <span aria-hidden="true">·</span>
              <span>{dateLabel(selectedDate)}</span>
            </p>
          </div>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2 lg:min-w-[30rem]">
          <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
            Fecha operativa
            <Input
              aria-label="Fecha operativa"
              max={getOperationalDate()}
              onChange={(event) => onDateChange(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              CEDIS origen
            </p>
            <p className="mt-1 font-bold">{cedis.name}</p>
            <p className="text-xs text-[var(--erp-muted-foreground)]">
              {cedis.code ?? "Sin código"}
            </p>
          </div>
        </div>
      </div>
      <div className="relative mt-6 grid gap-3 border-t border-[color:var(--erp-border)] pt-4 text-sm text-[var(--erp-muted-foreground)] sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex items-start gap-2">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {branch.address ?? "Dirección no registrada"}
        </p>
        <p>
          {coordinates
            ? `Coordenadas: ${coordinates}`
            : "Coordenadas no registradas"}
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          {cycle ? `Versión ${cycle.version}` : "Sin ciclo para esta fecha"}
        </p>
        <p className="flex items-center gap-2">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {cycle
            ? `Datos ${dateTimeLabel(cycle.dataAsOf)}`
            : "Selecciona otra fecha"}
        </p>
      </div>
    </header>
  );
}

function SummaryGrid({
  card,
  summary,
  canViewCosts,
}: {
  card: CedisDashboardCard | undefined;
  summary: CedisCycleSummary | undefined;
  canViewCosts: boolean;
}) {
  const physical = summary ? summary.totals : card?.physical;
  const financial = summary ? summary.totals : card?.financial;
  const cash = summary
    ? {
        expected: summary.totals.expectedCash,
        counted: summary.totals.cashCounted,
        difference: summary.totals.cashDifference,
      }
    : card?.cash;
  const difference = financial
    ? Number(financial.actualSales) - Number(financial.expectedSales)
    : null;
  const cashStateValue = cash ? ({ cash } as CedisDashboardCard) : card;
  const cashTone = cashStateValue ? cashState(cashStateValue).tone : "neutral";
  const cashLabel = cashStateValue
    ? cashState(cashStateValue).label
    : "Sin caja";
  const toneForDifference =
    difference === null
      ? "neutral"
      : difference === 0
        ? "positive"
        : difference < 0
          ? "negative"
          : "warning";

  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Jornada seleccionada"
        title="Resumen operativo"
        description="Comparación entre lo esperado por el ciclo y lo registrado por la sucursal."
        action={
          summary ? (
            <StatusBadge
              cycle={{
                id: summary.id,
                businessDate: summary.businessDate,
                status: summary.status,
                version: summary.version,
              }}
            />
          ) : (
            <Badge tone="slate">Sin jornada</Badge>
          )
        }
      />
      <dl className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          label="Entregado"
          value={
            physical
              ? formatPhysicalQuantity(
                  physical.deliveredKg,
                  physical.deliveredPieces,
                )
              : "—"
          }
          detail="Suministro confirmado"
        />
        <SummaryMetric
          label="Devuelto"
          value={
            physical
              ? formatPhysicalQuantity(
                  physical.returnedKg,
                  physical.returnedPieces,
                )
              : "—"
          }
          detail="Devoluciones confirmadas"
        />
        <SummaryMetric
          label="Vendido esperado"
          value={
            physical
              ? formatPhysicalQuantity(
                  physical.expectedSoldKg,
                  physical.expectedSoldPieces,
                )
              : "—"
          }
          detail="Entregado menos devuelto"
        />
        <SummaryMetric
          label="Vendido real"
          value={
            physical
              ? formatPhysicalQuantity(
                  physical.actualSoldKg,
                  physical.actualSoldPieces,
                )
              : "—"
          }
          detail="Ventas confirmadas"
        />
        <SummaryMetric
          label="Monto esperado"
          value={financial ? money(financial.expectedSales) : "—"}
        />
        <SummaryMetric
          label="Ventas reales"
          value={financial ? money(financial.actualSales) : "—"}
          tone={toneForDifference}
          detail={
            difference === null ? undefined : `Diferencia ${money(difference)}`
          }
        />
        <SummaryMetric
          label="Ventas a crédito"
          value={
            financial?.creditSales !== undefined
              ? money(financial.creditSales)
              : "—"
          }
          detail="Incluidas en ventas reales"
          tone="warning"
        />
        {canViewCosts && (
          <SummaryMetric
            label="Utilidad bruta esperada"
            value={
              financial && "expectedProfit" in financial
                ? money(financial.expectedProfit)
                : "—"
            }
          />
        )}
        {canViewCosts && (
          <SummaryMetric
            label="Utilidad bruta real"
            value={
              financial && "actualProfit" in financial
                ? money(financial.actualProfit)
                : "—"
            }
            tone={
              financial && "actualProfit" in financial ? "positive" : "neutral"
            }
          />
        )}
        <SummaryMetric
          label="Efectivo contado"
          value={cash ? money(cash.counted) : "—"}
          detail={cashLabel}
          tone={
            cashTone === "green"
              ? "positive"
              : cashTone === "red"
                ? "negative"
                : cashTone === "amber"
                  ? "warning"
                  : "neutral"
          }
        />
        <SummaryMetric
          label="Diferencia de caja"
          value={cash ? money(cash.difference) : "—"}
          tone={
            cash?.difference === null || cash?.difference === undefined
              ? "warning"
              : Number(cash?.difference ?? 0) === 0
                ? "positive"
                : "negative"
          }
        />
      </dl>
      {!canViewCosts && (
        <p className="border-t border-[color:var(--erp-border)] px-5 py-3 text-xs text-[var(--erp-muted-foreground)]">
          La utilidad y los costos requieren permiso de consulta financiera.
        </p>
      )}
    </Card>
  );
}

function ProductBreakdown({
  items,
  canViewCosts,
}: {
  items: CedisCycleItem[];
  canViewCosts: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Conciliación física y monetaria"
        title="Desglose por producto"
        description="Los valores son snapshots de conciliación; esta pantalla no permite editar precios, costos ni cantidades históricas."
      />
      <div className="overflow-x-auto">
        {items.length ? (
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-black">Producto</th>
                <th className="px-4 py-3 font-black" colSpan={4}>
                  Flujo físico
                </th>
                <th className="px-4 py-3 font-black" colSpan={2}>
                  Ventas
                </th>
                {canViewCosts && (
                  <th className="px-4 py-3 font-black" colSpan={2}>
                    Utilidad bruta
                  </th>
                )}
              </tr>
              <tr className="border-t border-[color:var(--erp-border)]">
                <th className="px-4 py-2 font-bold">SKU / unidad</th>
                <th className="px-4 py-2 font-bold">Entregado</th>
                <th className="px-4 py-2 font-bold">Devuelto</th>
                <th className="px-4 py-2 font-bold">Vendido esperado</th>
                <th className="px-4 py-2 font-bold">Vendido real</th>
                <th className="px-4 py-2 font-bold">Esperada</th>
                <th className="px-4 py-2 font-bold">Real</th>
                {canViewCosts && (
                  <>
                    <th className="px-4 py-2 font-bold">Esperada</th>
                    <th className="px-4 py-2 font-bold">Real</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  className="border-t border-[color:var(--erp-border)]"
                  key={item.id}
                >
                  <td className="px-4 py-3">
                    <strong className="block">{item.name}</strong>
                    <span className="text-xs text-[var(--erp-muted-foreground)]">
                      {item.sku ?? "Sin SKU"} · {item.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {formatPhysicalQuantity(
                      item.deliveredKg,
                      item.deliveredPieces,
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {formatPhysicalQuantity(
                      item.returnedKg,
                      item.returnedPieces,
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {formatPhysicalQuantity(
                      item.expectedSoldKg,
                      item.expectedSoldPieces,
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {formatPhysicalQuantity(
                      item.actualSoldKg,
                      item.actualSoldPieces,
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(item.expectedSales)}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {money(item.actualSales)}
                  </td>
                  {canViewCosts && (
                    <>
                      <td className="px-4 py-3 tabular-nums">
                        {money(item.expectedProfit)}
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {money(item.actualProfit)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-[var(--erp-muted-foreground)]">
            No hay snapshots de producto para esta jornada.
          </div>
        )}
      </div>
    </Card>
  );
}

const transferStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  REQUESTED: "Solicitado",
  IN_TRANSIT: "En tránsito",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
};
const paymentMethodLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  VOUCHER: "Voucher",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  DEPOSIT: "Depósito",
  OTHER: "Otro",
};
const movementTypeLabels: Record<string, string> = {
  CASH_IN: "Entrada de efectivo",
  CASH_OUT: "Salida de efectivo",
  EXPENSE: "Gasto",
  ADJUSTMENT: "Ajuste",
};

function Transfers({ summary }: { summary: CedisCycleSummary }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Trazabilidad de inventario"
        title="Suministros y devoluciones"
        description="Cada operación conserva su folio y estado de transferencia; confirmar o cancelar el traspaso ocurre en el flujo de inventario."
      />
      <div className="overflow-x-auto">
        {summary.transfers.length ? (
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-black">Tipo / folio</th>
                <th className="px-4 py-3 font-black">Estado</th>
                <th className="px-4 py-3 font-black">Partidas</th>
                <th className="px-4 py-3 font-black">Solicitado</th>
                <th className="px-4 py-3 font-black">Confirmado</th>
                <th className="px-4 py-3 font-black">Recepción</th>
              </tr>
            </thead>
            <tbody>
              {summary.transfers.map((link) => (
                <tr
                  className="border-t border-[color:var(--erp-border)]"
                  key={link.id}
                >
                  <td className="px-4 py-3">
                    <strong className="block">
                      {link.role === "SUPPLY" ? "Suministro" : "Devolución"}
                    </strong>
                    <span className="font-mono text-xs text-[var(--erp-muted-foreground)]">
                      {link.transfer.transferNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        link.transfer.status === "CONFIRMED"
                          ? "green"
                          : link.transfer.status === "CANCELLED"
                            ? "red"
                            : "amber"
                      }
                    >
                      {transferStatusLabels[link.transfer.status] ??
                        link.transfer.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {link.transfer.items.map((item) => (
                      <span className="block" key={item.id}>
                        {item.productName} ·{" "}
                        {item.quantityKg
                          ? `${quantity(item.quantityKg)} kg`
                          : `${quantity(item.quantityPieces)} piezas`}
                        {item.balance && (
                          <span className="mt-1 block text-xs text-[var(--erp-muted-foreground)]">
                            Físico en origen{" "}
                            {balanceQuantity(
                              item.balance.quantityKg,
                              item.balance.quantityPieces,
                            )}{" "}
                            · Comprometido{" "}
                            {balanceQuantity(
                              item.balance.reservedQuantityKg,
                              item.balance.reservedQuantityPieces,
                            )}{" "}
                            · Disponible{" "}
                            {balanceQuantity(
                              item.balance.availableQuantityKg,
                              item.balance.availableQuantityPieces,
                            )}
                          </span>
                        )}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {dateTimeLabel(link.transfer.requestedAt ?? link.linkedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {dateTimeLabel(link.transfer.confirmedAt)}
                  </td>
                  <td className="max-w-64 px-4 py-3 text-xs">
                    {link.role !== "SUPPLY" ? (
                      <span className="text-[var(--erp-muted-foreground)]">
                        No aplica
                      </span>
                    ) : link.transfer.receipt ? (
                      <div className="grid gap-1">
                        <Badge tone="green">
                          Recibido por {link.transfer.receipt.receivedBy.name}
                        </Badge>
                        <span>
                          {dateTimeLabel(link.transfer.receipt.receivedAt)}
                        </span>
                        {link.transfer.receipt.items.some(
                          (item) =>
                            Number(item.differenceKg) !== 0 ||
                            item.differencePieces !== 0,
                        ) && (
                          <span className="font-bold text-[var(--erp-danger)]">
                            Con diferencias
                          </span>
                        )}
                        {link.transfer.receipt.notes && (
                          <span className="line-clamp-2 text-[var(--erp-muted-foreground)]">
                            {link.transfer.receipt.notes}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge tone="amber">Pendiente de recepción</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-[var(--erp-muted-foreground)]">
            Todavía no hay suministros ni devoluciones vinculados.
          </div>
        )}
      </div>
    </Card>
  );
}

function CashSummary({
  dailyClose,
  cashMovementSummary,
}: {
  dailyClose: CedisCycleSummary["dailyClose"];
  cashMovementSummary: CedisCashMovementSummary | null;
}) {
  if (!dailyClose && !cashMovementSummary)
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-sm text-[var(--erp-muted-foreground)]">
          <WalletCards className="h-5 w-5" /> No hay un resumen de caja
          relacionado para esta jornada.
        </div>
      </Card>
    );
  const totals = dailyClose?.totals;
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Control monetario"
        title="Resumen de caja"
        description="Pagos, movimientos y turnos consolidados por el cierre diario relacionado."
        action={
          cashMovementSummary && (
            <Badge
              tone={
                cashMovementSummary.shifts.openShiftCount ? "amber" : "green"
              }
            >
              {cashMovementSummary.shifts.openShiftCount
                ? `${cashMovementSummary.shifts.openShiftCount} turno(s) abierto(s)`
                : "Turnos cerrados"}
            </Badge>
          )
        }
      />
      <dl className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {totals && (
          <>
            <SummaryMetric
              label="Ventas brutas"
              value={money(totals.grossSales)}
            />
            <SummaryMetric
              label="Ventas a crédito"
              value={money(totals.creditSales)}
              detail="Incluidas en ventas brutas"
              tone="warning"
            />
            <SummaryMetric label="Efectivo" value={money(totals.cash)} />
            <SummaryMetric
              label="Tarjeta / voucher"
              value={money(totals.cardVoucher)}
            />
            <SummaryMetric
              label="Transferencias"
              value={money(totals.transfer)}
            />
            <SummaryMetric label="Gastos" value={money(totals.expenses)} />
            <SummaryMetric
              label="Efectivo neto esperado"
              value={money(totals.netCashExpected)}
            />
            <SummaryMetric
              label="Efectivo contado"
              value={money(totals.cashCounted)}
            />
            <SummaryMetric
              label="Diferencia"
              value={money(totals.cashDifference)}
              tone={
                totals.cashDifference === null
                  ? "warning"
                  : Number(totals.cashDifference) === 0
                    ? "positive"
                    : "negative"
              }
            />
          </>
        )}
      </dl>
      {cashMovementSummary && (
        <div className="grid gap-5 border-t border-[color:var(--erp-border)] p-5 lg:grid-cols-2">
          <div>
            <h3 className="font-bold">Movimientos de caja</h3>
            <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
              {cashMovementSummary.movementCount} movimiento(s) · Entradas{" "}
              {money(cashMovementSummary.cashInTotal)} · Salidas{" "}
              {money(cashMovementSummary.cashOutTotal)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3">Concepto</th>
                    <th className="py-2 pr-3">Canal</th>
                    <th className="py-2 pr-3">Cantidad</th>
                    <th className="py-2">Impacto</th>
                  </tr>
                </thead>
                <tbody>
                  {cashMovementSummary.movementsByTypeAndChannel.map(
                    (movement) => (
                      <tr
                        className="border-t border-[color:var(--erp-border)]"
                        key={`${movement.type}-${movement.movementChannel}-${movement.isOpening}`}
                      >
                        <td className="py-2 pr-3">
                          {movementTypeLabels[movement.type] ?? movement.type}
                          {movement.isOpening ? " · Apertura" : ""}
                        </td>
                        <td className="py-2 pr-3">
                          {movement.movementChannel}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {movement.count}
                        </td>
                        <td className="py-2 font-bold tabular-nums">
                          {money(movement.cashImpact)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="font-bold">Pagos por método</h3>
            <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
              Turnos activos: {cashMovementSummary.shifts.activeShiftCount} ·
              Fondo inicial {money(cashMovementSummary.shifts.openingCash)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3">Método</th>
                    <th className="py-2 pr-3">Pagos</th>
                    <th className="py-2">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {cashMovementSummary.paymentsByMethod.map((payment) => (
                    <tr
                      className="border-t border-[color:var(--erp-border)]"
                      key={payment.paymentMethod}
                    >
                      <td className="py-2 pr-3">
                        {paymentMethodLabels[payment.paymentMethod] ??
                          payment.paymentMethod}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {payment.count}
                      </td>
                      <td className="py-2 font-bold tabular-nums">
                        {money(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Warnings({
  summary,
  card,
}: {
  summary: CedisCycleSummary | undefined;
  card: CedisDashboardCard | undefined;
}) {
  const pendingTransfers =
    summary?.transfers.filter((link) =>
      ["DRAFT", "REQUESTED", "IN_TRANSIT"].includes(link.transfer.status),
    ).length ?? 0;
  const differences = summary?.dailyClose?.unresolvedDifferences ?? [];
  const warnings = [
    ...(pendingTransfers
      ? [`${pendingTransfers} transferencia(s) todavía no están confirmadas.`]
      : []),
    ...(differences.length
      ? differences.map(
          (difference) =>
            `${difference.scope}: ${difference.differenceType === "SHORTAGE" ? "faltante" : "sobrante"} de ${quantity(Math.abs(Number(difference.differenceValue)))} ${difference.unit}`,
        )
      : []),
    ...(!summary?.dailyClose && summary
      ? ["No hay cierre diario relacionado para esta fecha."]
      : []),
  ];
  if ((card?.warningCount ?? 0) > warnings.length) {
    warnings.push(
      `La jornada conserva ${card?.warningCount ?? 0} hallazgo(s) operativo(s); consulta el detalle relacionado.`,
    );
  }
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Control"
        title="Advertencias y diferencias"
        description="Las diferencias permanecen visibles; esta pantalla no las compensa ni las oculta."
        action={
          <Badge
            tone={
              warnings.length || (card?.warningCount ?? 0) ? "red" : "green"
            }
          >
            {warnings.length || card?.warningCount || 0} hallazgo(s)
          </Badge>
        }
      />
      <div className="p-5">
        {warnings.length ? (
          <ul className="space-y-3">
            {warnings.map((warning, index) => (
              <li
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm"
                key={`${warning}-${index}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-warning)]" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5" /> No hay diferencias pendientes
            visibles para esta jornada.
          </div>
        )}
      </div>
    </Card>
  );
}

function RelatedDailyClose({
  branchId,
  dailyClose,
}: {
  branchId: string;
  dailyClose: CedisCycleSummary["dailyClose"];
}) {
  if (!dailyClose) return null;
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    REVIEWED: "Revisado",
    CLOSED: "Cerrado",
    CANCELLED: "Cancelado",
  };
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        eyebrow="Documento relacionado"
        title="Cierre diario"
        description="El cierre diario conserva el detalle completo de turnos, ventas, inventario, caja y auditoría."
        action={
          <Badge
            tone={
              dailyClose.status === "CLOSED"
                ? "green"
                : dailyClose.status === "CANCELLED"
                  ? "red"
                  : "amber"
            }
          >
            {labels[dailyClose.status] ?? dailyClose.status}
          </Badge>
        }
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Ventas"
          value={money(dailyClose.totals.grossSales)}
        />
        <SummaryMetric
          label="Ventas a crédito"
          value={money(dailyClose.totals.creditSales)}
          detail="Incluidas en ventas"
          tone="warning"
        />
        <SummaryMetric
          label="Gastos"
          value={money(dailyClose.totals.expenses)}
        />
        <SummaryMetric
          label="Efectivo esperado"
          value={money(dailyClose.totals.netCashExpected)}
        />
        <SummaryMetric
          label="Diferencia"
          value={money(dailyClose.totals.cashDifference)}
          tone={
            dailyClose.totals.cashDifference === null
              ? "warning"
              : Number(dailyClose.totals.cashDifference) === 0
                ? "positive"
                : "negative"
          }
        />
      </div>
      <div className="border-t border-[color:var(--erp-border)] p-5">
        <Link
          className="inline-flex items-center gap-2 text-sm font-bold text-[var(--erp-info)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
          to={`/daily-close?closeId=${encodeURIComponent(dailyClose.id)}&locationId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(dailyClose.businessDate)}`}
        >
          Ver cierre diario completo <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-xs text-[var(--erp-muted-foreground)]">
          Versión {dailyClose.version} · Actualizado{" "}
          {dateTimeLabel(dailyClose.updatedAt)}
        </p>
      </div>
    </Card>
  );
}

function ActionConfirmation({
  action,
  branch,
  cedis,
  date,
  error,
  isPending,
  reason,
  request,
  onCancel,
  onChangeReason,
  onConfirm,
}: {
  action: ActionType;
  branch: CedisDashboardLocation;
  cedis: CedisDashboardLocation;
  date: string;
  error: string | null;
  isPending: boolean;
  reason: string;
  request: ActionRequest | null;
  onCancel: () => void;
  onChangeReason: (value: string) => void;
  onConfirm: () => void;
}) {
  const title =
    action === "OPEN"
      ? "Abrir ciclo"
      : action === "CLOSE"
        ? "Cerrar ciclo"
        : "Reabrir ciclo";
  return (
    <Card
      aria-labelledby="cedis-action-confirm-title"
      className="border-[var(--erp-brand-gold)] p-5"
      role="dialog"
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
        Confirmación administrativa
      </p>
      <h2 className="mt-2 text-xl font-black" id="cedis-action-confirm-title">
        {title}
      </h2>
      <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
        {action === "OPEN"
          ? "Se creará un ciclo operativo para la fecha seleccionada."
          : action === "CLOSE"
            ? "Se conservará un snapshot inmutable de la conciliación."
            : "La reapertura conserva snapshots anteriores y no revierte inventario, ventas ni caja."}
      </p>
      {action === "OPEN" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--erp-surface)] p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              Origen
            </p>
            <p className="mt-1 font-bold">{cedis.name}</p>
          </div>
          <div className="rounded-xl bg-[var(--erp-surface)] p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              Sucursal
            </p>
            <p className="mt-1 font-bold">{branch.name}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--erp-surface)] p-3 text-sm">
          <span className="font-bold">Sucursal:</span> {branch.name} ·{" "}
          <span className="font-bold">Fecha:</span> {dateLabel(date)}
        </div>
      )}
      {action === "REOPEN" && (
        <label className="mt-4 grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
          Motivo de reapertura
          <Input
            disabled={Boolean(request)}
            onChange={(event) => onChangeReason(event.target.value)}
            placeholder="Corrección administrativa"
            value={reason}
          />
        </label>
      )}
      {error && (
        <p
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button disabled={isPending} onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={isPending || (action === "REOPEN" && !reason.trim())}
          onClick={onConfirm}
        >
          {isPending
            ? "Procesando…"
            : request
              ? "Reintentar comando"
              : `Confirmar ${title.toLowerCase()}`}
        </Button>
      </div>
    </Card>
  );
}

function CancelActionConfirmation({
  branch,
  date,
  error,
  isPending,
  reason,
  request,
  onCancel,
  onChangeReason,
  onConfirm,
}: {
  branch: CedisDashboardLocation;
  date: string;
  error: string | null;
  isPending: boolean;
  reason: string;
  request: ActionRequest | null;
  onCancel: () => void;
  onChangeReason: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Card
      aria-labelledby="cedis-cancel-confirm-title"
      className="border-[var(--erp-danger)] p-5"
      role="dialog"
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">
        Confirmación administrativa
      </p>
      <h2 className="mt-2 text-xl font-black" id="cedis-cancel-confirm-title">
        Cancelar ciclo
      </h2>
      <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
        La cancelación no revierte inventario y conserva el historial del ciclo.
      </p>
      <div className="mt-4 rounded-xl bg-[var(--erp-surface)] p-3 text-sm">
        <span className="font-bold">Sucursal:</span> {branch.name} ·{" "}
        <span className="font-bold">Fecha:</span> {dateLabel(date)}
      </div>
      <label className="mt-4 grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
        Motivo de cancelación
        <Input
          disabled={Boolean(request)}
          onChange={(event) => onChangeReason(event.target.value)}
          placeholder="Cancelación administrativa"
          value={reason}
        />
      </label>
      {error && (
        <p
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button disabled={isPending} onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={isPending || !reason.trim()}
          onClick={onConfirm}
          variant="destructive"
        >
          {isPending
            ? "Procesando…"
            : request
              ? "Reintentar comando"
              : "Confirmar cancelación"}
        </Button>
      </div>
    </Card>
  );
}

export function CedisBranchDetailPage() {
  const { branchId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const businessDate = searchParams.get("date") ?? getOperationalDate();
  const cycleIdFromUrl = searchParams.get("cycle") ?? undefined;
  const page = parsePage(searchParams.get("page"));
  const branchQuery = useOperationalLocation(branchId);
  const parentQuery = useOperationalLocation(
    branchQuery.data?.parentId ?? undefined,
  );
  const historyQuery = useCedisBranchHistory(branchId, {
    dateFrom: firstDayOfMonth(businessDate),
    dateTo: lastDayOfMonth(businessDate),
    limit: HISTORY_LIMIT,
    page,
  });
  const selectedCard =
    historyQuery.data?.items.find(
      (item) => item.cycle?.id === cycleIdFromUrl,
    ) ??
    historyQuery.data?.items.find(
      (item) => item.cycle?.businessDate === businessDate,
    );
  const cycleId = cycleIdFromUrl ?? selectedCard?.cycle?.id;
  const summaryQuery = useCedisCycleSummary(cycleId);
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const transferSourceLocationId =
    transferMode === "RETURN"
      ? (branchQuery.data?.id ?? branchId)
      : parentQuery.data?.id;
  const productsQuery = useProducts({
    isActive: "true",
    locationId: transferSourceLocationId,
  });
  const createSupply = useCreateCedisSupply(cycleId ?? "disabled");
  const createReturn = useCreateCedisReturn(cycleId ?? "disabled");
  const refreshCycle = useRefreshCedisCycle(cycleId ?? "disabled");
  const openCycle = useOpenCedisCycle();
  const closeCycle = useCloseCedisCycle(cycleId ?? "disabled");
  const reopenCycle = useReopenCedisCycle(cycleId ?? "disabled");
  const cancelCycle = useCancelCedisCycle(cycleId ?? "disabled");
  const [action, setAction] = useState<ActionType | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshRequest, setRefreshRequest] = useState<CedisMutationInput<{
    expectedVersion: number;
  }> | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const branch = locationFromValue(
    summaryQuery.data?.branch ?? selectedCard?.branch,
    {
      id: branchId ?? "branch",
      name: branchQuery.data?.name ?? "Sucursal",
      code: branchQuery.data?.code,
      address: branchQuery.data?.address,
      latitude: branchQuery.data?.latitude,
      longitude: branchQuery.data?.longitude,
    },
  );
  const cedis = locationFromValue(summaryQuery.data?.distributionCenter, {
    id: searchParams.get("cedis") ?? parentQuery.data?.id ?? "cedis",
    name: parentQuery.data?.name ?? "CEDIS asignado",
    code: parentQuery.data?.code,
    address: parentQuery.data?.address,
    latitude: parentQuery.data?.latitude,
    longitude: parentQuery.data?.longitude,
  });
  const summary = summaryQuery.data;
  const cycleCard =
    selectedCard ??
    (summary
      ? ({
          branch: summary.branch,
          cycle: {
            id: summary.id,
            businessDate: summary.businessDate,
            status: summary.status,
            version: summary.version,
          },
          physical: {
            deliveredKg: summary.totals.deliveredKg,
            deliveredPieces: summary.totals.deliveredPieces,
            returnedKg: summary.totals.returnedKg,
            returnedPieces: summary.totals.returnedPieces,
            expectedSoldKg: summary.totals.expectedSoldKg,
            expectedSoldPieces: summary.totals.expectedSoldPieces,
            actualSoldKg: summary.totals.actualSoldKg,
            actualSoldPieces: summary.totals.actualSoldPieces,
          },
          financial: {
            expectedSales: summary.totals.expectedSales,
            actualSales: summary.totals.actualSales,
          },
          cash: {
            expected: summary.totals.expectedCash,
            counted: summary.totals.cashCounted,
            difference: summary.totals.cashDifference,
          },
          warningCount: summary.warningCount,
          lastActivityAt: summary.lastActivityAt,
        } satisfies CedisDashboardCard)
      : undefined);
  const canDispatch = hasPermission(user, PERMISSIONS.cedisDispatch);
  const canReceiveReturns = hasPermission(
    user,
    PERMISSIONS.cedisReceiveReturns,
  );
  const canReconcile = hasPermission(user, PERMISSIONS.cedisReconcile);
  const canClose = hasPermission(user, PERMISSIONS.cedisClose);
  const canViewCosts = hasPermission(user, PERMISSIONS.cedisViewCosts);
  const status = summary?.status ?? selectedCard?.cycle?.status ?? null;
  const transferBlockedReason = !status
    ? "No hay un ciclo abierto para esta fecha."
    : status === "CLOSED"
      ? "El ciclo está cerrado y no admite transferencias."
      : status === "CANCELLED"
        ? "El ciclo está cancelado y no admite transferencias."
        : null;
  const refreshBlockedReason = !status
    ? "No hay un ciclo para actualizar."
    : status === "CLOSED"
      ? "El ciclo está cerrado; no se puede recalcular."
      : status === "CANCELLED"
        ? "El ciclo está cancelado; no se puede recalcular."
        : null;
  const closeBlockedReason = !status
    ? "No hay un ciclo para cerrar."
    : status !== "READY_FOR_REVIEW"
      ? "El ciclo debe estar listo para revisión antes de cerrarse."
      : null;
  const reopenBlockedReason =
    status !== "CLOSED" ? "Solo un ciclo cerrado puede reabrirse." : null;
  const cancelBlockedReason = !status
    ? "No hay un ciclo para cancelar."
    : status === "CLOSED"
      ? "El ciclo cerrado no puede cancelarse."
      : status === "CANCELLED"
        ? "El ciclo ya está cancelado."
        : summary?.dailyClose && summary.dailyClose.status !== "CANCELLED"
          ? "Cancela primero el cierre diario relacionado."
          : summary?.transfers.some(
                (link) => link.transfer.status !== "CANCELLED",
              )
            ? "Cancela primero todas las transferencias vinculadas."
            : null;
  const activeActionPending =
    openCycle.isPending ||
    closeCycle.isPending ||
    reopenCycle.isPending ||
    cancelCycle.isPending;
  const pendingTransfer = createSupply.isPending || createReturn.isPending;
  const hasDataError = branchQuery.error || historyQuery.error;

  function updateDate(value: string) {
    if (!value) return;
    setRefreshRequest(null);
    setRefreshError(null);
    const next = new URLSearchParams(searchParams);
    next.set("date", value);
    next.delete("cycle");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function selectHistoryDate(value: string, selectedCycleId?: string) {
    setRefreshRequest(null);
    setRefreshError(null);
    const next = new URLSearchParams(searchParams);
    next.set("date", value);
    if (selectedCycleId) next.set("cycle", selectedCycleId);
    else next.delete("cycle");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function changeHistoryPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  }

  function closeTransferPanel() {
    setTransferMode(null);
  }

  async function submitTransfer(
    payload: CedisCycleCommand,
    idempotencyKey: string,
  ) {
    if (!cycleId) return;
    const input: CedisMutationInput<CedisCycleCommand> = {
      payload,
      idempotencyKey,
    };
    try {
      if (transferMode === "SUPPLY") await createSupply.mutateAsync(input);
      else await createReturn.mutateAsync(input);
      toast.success(
        transferMode === "SUPPLY"
          ? "Suministro registrado."
          : "Devolución registrada.",
      );
    } catch (error) {
      const code = apiErrorCode(error);
      if (
        code === "INSUFFICIENT_STOCK" ||
        code === "INVENTORY_CONCURRENCY_CONFLICT" ||
        code === "INVENTORY_RESERVATION_INTEGRITY_ERROR"
      ) {
        await Promise.allSettled([
          productsQuery.refetch(),
          summaryQuery.refetch(),
        ]);
      }
      throw error;
    }
  }

  function beginAction(nextAction: ActionType) {
    setAction(nextAction);
    setActionReason("");
    setActionRequest(null);
    setActionError(null);
    setTransferMode(null);
  }

  function cancelAction() {
    setAction(null);
    setActionRequest(null);
    setActionReason("");
    setActionError(null);
  }

  async function confirmAction() {
    if (!action) return;
    if ((action === "REOPEN" || action === "CANCEL") && !actionReason.trim()) {
      setActionError(
        action === "CANCEL"
          ? "Captura el motivo de cancelación."
          : "Captura el motivo de reapertura.",
      );
      return;
    }
    if (!cycleId && action !== "OPEN") return;
    const request: ActionRequest = actionRequest ?? {
      type: action,
      idempotencyKey: createIdempotencyKey(),
      payload:
        action === "OPEN"
          ? {
              distributionCenterLocationId: cedis.id,
              branchLocationId: branch.id,
              businessDate,
            }
          : action === "CLOSE"
            ? {
                expectedVersion:
                  summary?.version ?? selectedCard?.cycle?.version ?? 0,
              }
            : {
                expectedVersion:
                  summary?.version ?? selectedCard?.cycle?.version ?? 0,
                reason: actionReason.trim(),
              },
    };
    setActionRequest(request);
    setActionError(null);
    try {
      if (request.type === "OPEN") {
        const result = await openCycle.mutateAsync({
          payload: request.payload as Extract<
            ActionRequest["payload"],
            { distributionCenterLocationId: string }
          >,
          idempotencyKey: request.idempotencyKey,
        });
        const createdId =
          result &&
          typeof result === "object" &&
          "id" in result &&
          typeof result.id === "string"
            ? result.id
            : undefined;
        const next = new URLSearchParams(searchParams);
        next.set("date", businessDate);
        if (createdId) next.set("cycle", createdId);
        setSearchParams(next, { replace: true });
        toast.success("Ciclo abierto.");
      } else if (request.type === "CLOSE") {
        await closeCycle.mutateAsync({
          payload: request.payload as { expectedVersion: number },
          idempotencyKey: request.idempotencyKey,
        });
        toast.success("Ciclo cerrado.");
      } else if (request.type === "REOPEN") {
        await reopenCycle.mutateAsync({
          payload: request.payload as {
            expectedVersion: number;
            reason: string;
          },
          idempotencyKey: request.idempotencyKey,
        });
        toast.success("Ciclo reabierto.");
      } else {
        await cancelCycle.mutateAsync({
          payload: request.payload as {
            expectedVersion: number;
            reason: string;
          },
          idempotencyKey: request.idempotencyKey,
        });
        toast.success("Ciclo cancelado.");
      }
      cancelAction();
    } catch (error) {
      setActionError(
        apiErrorMessage(error, "No fue posible ejecutar el comando."),
      );
    }
  }

  async function executeRefresh() {
    if (!summary || refreshCycle.isPending) return;
    const request = refreshRequest ?? {
      payload: { expectedVersion: summary.version },
      idempotencyKey: createIdempotencyKey(),
    };
    setRefreshRequest(request);
    setRefreshError(null);
    try {
      await refreshCycle.mutateAsync(request);
      setRefreshRequest(null);
      toast.success("Conciliación actualizada.");
    } catch (error) {
      setRefreshError(
        apiErrorMessage(error, "No fue posible actualizar la conciliación."),
      );
    }
  }

  async function refresh() {
    await Promise.all([
      branchQuery.refetch(),
      historyQuery.refetch(),
      summaryQuery.refetch(),
    ]);
  }

  if (branchQuery.isLoading || historyQuery.isLoading)
    return (
      <PageContainer>
        <section className="mx-auto max-w-[96rem]">
          <LoadingState />
        </section>
      </PageContainer>
    );
  if (hasDataError)
    return (
      <PageContainer>
        <section className="mx-auto max-w-[96rem]">
          <DetailError onRetry={() => void refresh()} />
        </section>
      </PageContainer>
    );

  return (
    <PageContainer>
      <section className="mx-auto flex max-w-[96rem] flex-col gap-5">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--erp-info)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
          to={`/cedis${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Volver a CEDIS /
          Sucursales
        </Link>
        <Header
          branch={branch}
          cedis={cedis}
          cycle={summary ?? null}
          onDateChange={updateDate}
          selectedDate={businessDate}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--erp-border)] bg-white/80 p-4">
          <div>
            <p className="text-sm font-bold">Revisión y confirmación</p>
            <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
              Inspecciona advertencias, diferencias y conciliación; después
              confirma la jornada cuando la evidencia esté lista.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-4 text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
              to={`/cedis/incoming?date=${encodeURIComponent(businessDate)}&status=PENDING`}
            >
              <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
              Revisar recepciones
            </Link>
            {!cycleId && canDispatch && (
              <Button
                disabled={Boolean(status)}
                onClick={() => beginAction("OPEN")}
              >
                <PackageCheck className="h-4 w-4" /> Abrir ciclo
              </Button>
            )}
            {cycleId && canDispatch && (
              <Button
                disabled={Boolean(transferBlockedReason) || pendingTransfer}
                onClick={() => setTransferMode("SUPPLY")}
                title={transferBlockedReason ?? undefined}
                variant="secondary"
              >
                <ArrowRight className="h-4 w-4" /> Enviar producto
              </Button>
            )}
            {cycleId && canReceiveReturns && (
              <Button
                disabled={Boolean(transferBlockedReason) || pendingTransfer}
                onClick={() => setTransferMode("RETURN")}
                title={transferBlockedReason ?? undefined}
                variant="secondary"
              >
                <Undo2 className="h-4 w-4" /> Registrar devolución
              </Button>
            )}
            {cycleId && canReconcile && (
              <Button
                aria-label={
                  status === "OPEN"
                    ? "Actualizar conciliación y marcar listo para revisión"
                    : "Actualizar conciliación"
                }
                disabled={
                  Boolean(refreshBlockedReason) || refreshCycle.isPending
                }
                onClick={() => void executeRefresh()}
                title={refreshBlockedReason ?? undefined}
                variant="outline"
              >
                <ClipboardCheck className="h-4 w-4" />
                {refreshError
                  ? "Reintentar conciliación"
                  : "Actualizar conciliación"}
              </Button>
            )}
            {cycleId && canClose && (
              <Button
                disabled={Boolean(closeBlockedReason) || activeActionPending}
                onClick={() => beginAction("CLOSE")}
                title={closeBlockedReason ?? undefined}
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmar jornada
              </Button>
            )}
            {cycleId && canClose && (
              <Button
                disabled={Boolean(reopenBlockedReason) || activeActionPending}
                onClick={() => beginAction("REOPEN")}
                title={reopenBlockedReason ?? undefined}
                variant="secondary"
              >
                <RotateCcw className="h-4 w-4" /> Reabrir
              </Button>
            )}
            {cycleId && canClose && (
              <Button
                disabled={Boolean(cancelBlockedReason) || activeActionPending}
                onClick={() => beginAction("CANCEL")}
                title={cancelBlockedReason ?? undefined}
                variant="destructive"
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
        {refreshError && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--erp-danger)]"
            role="alert"
          >
            {refreshError} La misma clave se conservará al reintentar.
          </p>
        )}
        {(transferBlockedReason && (canDispatch || canReceiveReturns)) ||
        (closeBlockedReason && canClose) ||
        (reopenBlockedReason && canClose) ||
        (cancelBlockedReason && canClose) ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
            <span className="font-bold">Acciones bloqueadas:</span>
            {transferBlockedReason && (canDispatch || canReceiveReturns) && (
              <span>Transferencias: {transferBlockedReason}</span>
            )}
            {closeBlockedReason && canClose && (
              <span>Cierre: {closeBlockedReason}</span>
            )}
            {reopenBlockedReason && canClose && (
              <span>Reapertura: {reopenBlockedReason}</span>
            )}
            {cancelBlockedReason && canClose && (
              <span>Cancelación: {cancelBlockedReason}</span>
            )}
          </div>
        ) : null}
        {transferMode && summary && (
          <CedisTransferCommandPanel
            branch={branch}
            cedis={cedis}
            expectedVersion={summary.version}
            mode={transferMode}
            onClose={closeTransferPanel}
            onSubmit={submitTransfer}
            products={productsQuery.data ?? []}
            productsError={productsQuery.error}
            productsLoading={productsQuery.isLoading}
            cycleItems={summary.items}
            expectedSales={summary.totals.expectedSales}
          />
        )}
        {action === "CANCEL" ? (
          <CancelActionConfirmation
            branch={branch}
            date={businessDate}
            error={actionError}
            isPending={activeActionPending}
            onCancel={cancelAction}
            onChangeReason={setActionReason}
            onConfirm={() => void confirmAction()}
            reason={actionReason}
            request={actionRequest}
          />
        ) : (
          action && (
            <ActionConfirmation
              action={action}
              branch={branch}
              cedis={cedis}
              date={businessDate}
              error={actionError}
              isPending={activeActionPending}
              onCancel={cancelAction}
              onChangeReason={setActionReason}
              onConfirm={() => void confirmAction()}
              reason={actionReason}
              request={actionRequest}
            />
          )
        )}
        {summaryQuery.isError && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[var(--erp-danger)]"
            role="alert"
          >
            No se pudo cargar el detalle de la jornada. El historial permanece
            disponible.{" "}
            <Button
              className="ml-3"
              onClick={() => void summaryQuery.refetch()}
              size="sm"
              variant="secondary"
            >
              Reintentar detalle
            </Button>
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <HistoryList
            businessDate={businessDate}
            history={historyQuery.data}
            onPageChange={changeHistoryPage}
            onSelect={selectHistoryDate}
          />
          <div className="min-w-0 space-y-5">
            <SummaryGrid
              card={cycleCard}
              summary={summary}
              canViewCosts={canViewCosts}
            />
            {summary ? (
              <>
                <ProductBreakdown
                  canViewCosts={canViewCosts}
                  items={summary.items}
                />
                <Transfers summary={summary} />
                <CashSummary
                  cashMovementSummary={summary.cashMovementSummary}
                  dailyClose={summary.dailyClose}
                />
                <Warnings card={cycleCard} summary={summary} />
                <RelatedDailyClose
                  branchId={branch.id}
                  dailyClose={summary.dailyClose}
                />
              </>
            ) : (
              <Card className="p-8 text-center">
                <CircleDollarSign className="mx-auto h-8 w-8 text-[var(--erp-muted-foreground)]" />
                <h2 className="mt-3 font-black">Sin jornada para esta fecha</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--erp-muted-foreground)]">
                  Selecciona otra fecha o abre un ciclo para comenzar a
                  registrar suministros y devoluciones.
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
