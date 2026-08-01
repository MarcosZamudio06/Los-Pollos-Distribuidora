import { CheckCircle2, FileCheck2, Scale, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import { formatMoney as money } from "../../lib/money";
import type { DailyClose } from "./types";

function kilograms(value: string | number) {
  return `${Number(value).toFixed(3)} kg`;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
        {label}
      </p>
      <strong className="mt-2 block text-lg tabular-nums">{value}</strong>
    </div>
  );
}

export function DailyCloseSignoffSummary({
  canClose,
  close,
  onClose,
  openShiftCount,
}: {
  canClose: boolean;
  close: DailyClose;
  onClose: () => void;
  openShiftCount: number;
}) {
  const unresolved = (close.differences ?? []).filter(
    (difference) =>
      Number(difference.differenceValue) !== 0 &&
      difference.status !== "AUTHORIZED",
  );
  const billableNotes = (close.sales ?? []).filter(
    (sale) =>
      sale.requiresAdministrativeInvoice ||
      (sale.billingRequests?.length ?? 0) > 0,
  ).length;
  const saleCount = (close.sales ?? []).length;

  return (
    <div className="space-y-4">
      <article className="overflow-hidden rounded-2xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] p-5 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/75">
              Paso 06 · firma de control
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              Todo listo para firmar y cerrar
            </h3>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              La confirmación conservará los totales, diferencias, versión y
              responsables en un snapshot auditable.
            </p>
          </div>
          <FileCheck2 className="hidden h-14 w-14 text-[var(--erp-brand-gold)] sm:block" />
        </div>
      </article>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Kilos del día"
          value={`${kilograms(close.totalSoldKg)} vendidos`}
        />
        <SummaryTile
          label="Báscula"
          value={`${kilograms(close.scaleReportedKg)} registrados`}
        />
        <SummaryTile
          label="Inventario"
          value={`${kilograms(close.totalRemainingKg)} teóricos`}
        />
        <SummaryTile label="Gastos" value={money(close.expenseTotal)} />
        <SummaryTile
          label="Ventas"
          value={`${saleCount} · ${money(close.grossSalesTotal)}`}
        />
        <SummaryTile label="Notas facturables" value={String(billableNotes)} />
        <SummaryTile
          label="Efectivo esperado"
          value={money(close.netCashExpected)}
        />
        <SummaryTile
          label="Diferencias sin resolver"
          value={String(unresolved.length)}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5">
          <h4 className="flex items-center gap-2 font-bold">
            <Scale size={18} /> Conciliación de producto
          </h4>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--erp-muted-foreground)]">Recibidos</dt>
              <dd className="font-bold">{kilograms(close.totalInputKg)}</dd>
            </div>
            <div>
              <dt className="text-[var(--erp-muted-foreground)]">Vendidos</dt>
              <dd className="font-bold">{kilograms(close.totalSoldKg)}</dd>
            </div>
            <div>
              <dt className="text-[var(--erp-muted-foreground)]">Sobrantes</dt>
              <dd className="font-bold">{kilograms(close.totalSurplusKg)}</dd>
            </div>
            <div>
              <dt className="text-[var(--erp-muted-foreground)]">Faltantes</dt>
              <dd className="font-bold">{kilograms(close.totalShortageKg)}</dd>
            </div>
          </dl>
        </article>
        <article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5">
          <h4 className="flex items-center gap-2 font-bold">
            <ShieldAlert size={18} /> Control antes del cierre
          </h4>
          {unresolved.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={17} /> No hay diferencias pendientes de
              resolver.
            </p>
          ) : (
            <p className="mt-4 text-sm text-amber-800">
              Hay {unresolved.length} diferencia(s) sin resolver. El
              administrador debe revisarlas antes de confirmar.
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--erp-muted-foreground)]">
            Versión a firmar:{" "}
            <strong className="text-[var(--erp-foreground)]">
              {close.version}
            </strong>{" "}
            · Última validación:{" "}
            {close.lastValidatedAt
              ? new Date(close.lastValidatedAt).toLocaleString("es-MX")
              : "Pendiente"}
          </p>
        </article>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--erp-muted-foreground)]">
          {openShiftCount > 0
            ? "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada."
            : "La firma requiere una revisión válida y permisos administrativos."}
        </p>
        <Button disabled={!canClose || openShiftCount > 0} onClick={onClose}>
          <CheckCircle2 size={16} /> Firmar y cerrar
        </Button>
      </div>
    </div>
  );
}
