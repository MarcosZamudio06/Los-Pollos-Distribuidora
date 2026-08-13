import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, PackageX, RefreshCw, RotateCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmationDialog } from "../../components/shared/confirmation-dialog";
import { PageContainer } from "../../components/layout/PageContainer";
import { Badge, Button, Card, CardDescription, CardTitle, Input } from "../../components/ui";
import { getOperationalDate } from "../../lib/operationalDate";
import { useAuth } from "../auth";
import { useProducts } from "../inventario/hooks/useProducts";
import { CedisTransferCommandPanel } from "./CedisTransferCommandPanel";
import { useCedisBranchHistory, useCedisCycleSummary, useCedisReturns, useCompleteCedisReturn, useCreateCedisReturn, useOperationalLocation } from "./hooks";
import type { CedisBranchReturn, CedisReturnsFilters } from "./types";

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin registrar";
}
function quantity(item: CedisBranchReturn["items"][number]) {
  if (item.unit === "PIECE") return `${item.quantityPieces} piezas`;
  if (item.unit === "KG") return `${item.quantityKg.toFixed(3)} kg`;
  return `${item.quantityKg.toFixed(3)} kg · ${item.quantityPieces} piezas`;
}
function statusTone(status: CedisBranchReturn["status"]) { return status === "COMPLETED" ? "green" : status === "CANCELLED" ? "red" : "amber" as const; }
function statusLabel(status: CedisBranchReturn["status"]) { return status === "COMPLETED" ? "Recibida" : status === "CANCELLED" ? "Cancelada" : "Pendiente"; }

function ReturnCard({ item, reviewer, onComplete }: { item: CedisBranchReturn; reviewer: boolean; onComplete: () => void }) {
  return <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-brand-gold-deep)]">{item.transferNumber}</p><CardTitle className="mt-2">{item.cycle.branch.name} → {item.cycle.distributionCenter.name}</CardTitle><CardDescription className="mt-1">Ciclo {item.cycle.businessDate} · v{item.cycle.version}</CardDescription></div>
      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
    </div>
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">Solicitó</dt><dd className="mt-1 font-semibold">{item.requestedBy.name}</dd></div><div><dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">Solicitada</dt><dd className="mt-1 font-semibold">{dateTime(item.requestedAt)}</dd></div><div><dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">Recibida</dt><dd className="mt-1 font-semibold">{dateTime(item.confirmedAt)}</dd></div></dl>
    {item.notes && <p className="mt-4 rounded-xl bg-[var(--erp-surface-muted)] p-3 text-sm text-[var(--erp-muted-foreground)]">{item.notes}</p>}
    <ul className="mt-4 divide-y divide-[color:var(--erp-border)] border-y border-[color:var(--erp-border)]" aria-label={`Productos de ${item.transferNumber}`}>{item.items.map((product) => <li className="flex items-center justify-between gap-3 py-3 text-sm" key={product.transferItemId}><span className="font-semibold">{product.productName}</span><span className="font-black tabular-nums">{quantity(product)}</span></li>)}</ul>
    {reviewer && item.status === "PENDING" && <Button className="mt-5" onClick={onComplete}><ClipboardCheck className="h-4 w-4" />Marcar devolución como recibida</Button>}
  </Card>;
}

export function CedisBranchReturnsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [completeTarget, setCompleteTarget] = useState<CedisBranchReturn>();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const businessDate = searchParams.get("date") ?? getOperationalDate();
  const requestedStatus = searchParams.get("status");
  const location = useOperationalLocation(user?.operationalLocationId);
  const workerMode = Boolean(
    user?.role !== "ADMIN" &&
      location.data?.type === "BRANCH" &&
      (user?.role === "SELLER" || user?.role === "WAREHOUSE"),
  );
  const reviewerMode = Boolean(
    user?.role === "ADMIN" ||
      (user?.role === "WAREHOUSE" &&
        location.data?.type === "DISTRIBUTION_CENTER"),
  );
  const status = workerMode ? "ALL" : requestedStatus === "COMPLETED" || requestedStatus === "ALL" ? requestedStatus : "PENDING";
  const filters = useMemo<CedisReturnsFilters>(() => ({ businessDate, status, page: 1, limit: 25 }), [businessDate, status]);
  const returns = useCedisReturns(filters);
  const history = useCedisBranchHistory(workerMode ? user?.operationalLocationId : undefined, { dateFrom: businessDate, dateTo: businessDate, page: 1, limit: 1 });
  const cycleId = workerMode ? history.data?.items[0]?.cycle?.id : undefined;
  const summary = useCedisCycleSummary(cycleId);
  const products = useProducts({ isActive: "true", locationId: workerMode ? user?.operationalLocationId : undefined }, { enabled: Boolean(workerMode && cycleId && user?.operationalLocationId) });
  const createReturn = useCreateCedisReturn(cycleId ?? "disabled");
  const completeReturn = useCompleteCedisReturn();
  const workerCycle = summary.data;

  function update(name: "date" | "status", value: string) { const next = new URLSearchParams(searchParams); next.set(name, value); setSearchParams(next, { replace: true }); }
  async function complete() { if (!completeTarget) return; await completeReturn.mutateAsync({ transferId: completeTarget.id }); toast.success("Devolución marcada como recibida."); setCompleteTarget(undefined); }

  if (location.isLoading) return <PageContainer><div role="status">Cargando ubicación operativa…</div></PageContainer>;
  if (location.error || (!location.data && user?.role !== "ADMIN")) return <PageContainer><Card className="p-8 text-center"><CardTitle>No se pudo identificar la ubicación operativa</CardTitle><CardDescription className="mt-2">Reintenta o solicita la asignación de una ubicación autorizada.</CardDescription></Card></PageContainer>;

  const heading = workerMode ? "Solicitar devolución a CEDIS" : reviewerMode ? "Devoluciones pendientes" : "Devoluciones a CEDIS";
  return <PageContainer><section className="mx-auto flex max-w-[96rem] flex-col gap-6">
    <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-[var(--erp-shadow-elevated)] sm:p-8"><div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(47,111,115,0.16),transparent_38%),linear-gradient(135deg,transparent,rgba(214,155,45,0.1))]" /><div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-brand-gold-deep)]"><RotateCcw className="h-4 w-4" />{workerMode ? "Operación de sucursal" : "Bandeja CEDIS"}</p><h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">{heading}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--erp-muted-foreground)]">{workerMode ? "Registra productos no vendidos del ciclo actual. CEDIS confirmará la recepción antes de mover existencias." : "Revisa la devolución, su folio y productos. La confirmación aplica la transferencia atómica hacia CEDIS."}</p></div><div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4"><p className="text-2xl font-black">{returns.data?.total ?? 0}</p><p className="text-xs font-bold text-[var(--erp-muted-foreground)]">Devoluciones en la vista</p></div></div></header>
    <Card className="p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Fecha operativa<Input onChange={(event) => update("date", event.target.value)} type="date" value={businessDate} /></label>{reviewerMode && <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Estado<select className="min-h-10 rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-semibold" onChange={(event) => update("status", event.target.value)} value={status}><option value="PENDING">Pendientes</option><option value="COMPLETED">Recibidas</option><option value="ALL">Todas</option></select></label>}</div></Card>
    {workerMode && (history.isLoading || summary.isLoading) ? <Card className="p-8 text-center" role="status">Cargando ciclo operativo…</Card> : workerMode && !workerCycle ? <Card className="p-8 text-center"><PackageX className="mx-auto h-10 w-10 text-[var(--erp-muted-foreground)]" /><CardTitle className="mt-4">No hay ciclo operativo para esta fecha</CardTitle><CardDescription className="mt-2">La devolución estará disponible cuando CEDIS abra el ciclo de la sucursal.</CardDescription></Card> : workerMode && workerCycle ? <>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Productos no vendidos del ciclo</CardTitle>
          <CardDescription className="mt-1">Selecciona los productos que regresarán a CEDIS. La solicitud quedará pendiente hasta que CEDIS la reciba.</CardDescription>
        </div>
        <Button onClick={() => setIsCommandOpen(true)}>
          <RotateCcw className="h-4 w-4" />
          Solicitar devolución
        </Button>
      </Card>
      {isCommandOpen && <CedisTransferCommandPanel branch={workerCycle.branch} cedis={workerCycle.distributionCenter} contextKey={`${cycleId}:${workerCycle.version}:${businessDate}`} expectedVersion={workerCycle.version} mode="RETURN" onClose={() => setIsCommandOpen(false)} onSubmit={async (payload, idempotencyKey) => { await createReturn.mutateAsync({ payload, idempotencyKey }); toast.success("Devolución solicitada a CEDIS."); }} products={products.data ?? []} productsError={products.error} productsLoading={products.isLoading} sourceLocationId={user?.operationalLocationId} cycleItems={workerCycle.items} expectedSales={workerCycle.totals.expectedSales} />}
    </> : null}
    {returns.isLoading ? <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]" role="status">Cargando devoluciones…</div> : returns.error ? <Card className="p-8 text-center"><p className="font-bold text-[var(--erp-danger)]">No se pudo cargar la cola de devoluciones.</p><Button className="mt-4" onClick={() => void returns.refetch()} variant="secondary"><RefreshCw className="h-4 w-4" />Reintentar</Button></Card> : returns.data?.items.length === 0 ? <Card className="p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[var(--erp-success)]" /><CardTitle className="mt-4">No hay devoluciones</CardTitle><CardDescription className="mt-2">No hay registros que coincidan con los filtros actuales.</CardDescription></Card> : <div className="grid gap-5 lg:grid-cols-2">{returns.data?.items.map((item) => <ReturnCard item={item} key={item.id} onComplete={() => setCompleteTarget(item)} reviewer={reviewerMode} />)}</div>}
    <ConfirmationDialog open={Boolean(completeTarget)} title="Marcar devolución como recibida" description="Esta acción confirma la transferencia y registra las salidas y entradas de inventario. Verifica los productos físicos antes de continuar." confirmLabel="Confirmar recepción" isLoading={completeReturn.isPending} onConfirm={complete} onOpenChange={(open) => { if (!open) setCompleteTarget(undefined); }}>{completeTarget && <p><strong>{completeTarget.transferNumber}</strong> · {completeTarget.cycle.branch.name} → {completeTarget.cycle.distributionCenter.name}</p>}</ConfirmationDialog>
  </section></PageContainer>;
}
