import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  PackageCheck,
  Store,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney } from "../../lib/money";
import { Badge } from "../../components/ui";
import {
  branchDetailHref,
  cashState,
  cedisCycleStatusLabels,
  cedisCycleStatusTones,
  formatCoordinates,
  formatPhysicalQuantity,
  salesDifference,
} from "./cedisPresentation";
import type { CedisDashboardCard } from "./types";

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3">
      <dt className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-2 text-sm font-black tabular-nums text-[var(--erp-foreground)]">
        {value}
      </dd>
    </div>
  );
}

export function CedisBranchCard({
  businessDate,
  cedisLocationId,
  item,
}: {
  businessDate: string;
  cedisLocationId: string;
  item: CedisDashboardCard;
}) {
  const { branch, cycle, financial, physical } = item;
  const cash = cashState(item);
  const difference = salesDifference(item);
  const coordinates = formatCoordinates(branch.latitude, branch.longitude);
  const href = branchDetailHref(item, { businessDate, cedisLocationId });
  const cycleLabel = cycle
    ? cedisCycleStatusLabels[cycle.status]
    : "Sin jornada";

  return (
    <Link
      aria-label={`Abrir detalle de ${branch.name}${branch.code ? `, código ${branch.code}` : ""}`}
      className="group block rounded-[1.4rem] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
      to={href}
    >
      <article className="relative h-full overflow-hidden rounded-[1.4rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[var(--erp-shadow)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--erp-brand-gold)] group-hover:shadow-[var(--erp-shadow-elevated)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--erp-brand-red),var(--erp-brand-gold))]" />
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[rgba(47,111,115,0.12)] text-[var(--erp-info)]">
              <Store aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black tracking-[-0.05em]">
                {branch.name}
              </h2>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                {branch.code ? `Código ${branch.code}` : "Sin código"}
              </p>
            </div>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="mt-1 shrink-0 text-[var(--erp-muted-foreground)] transition group-hover:translate-x-1 group-hover:text-[var(--erp-brand-red)]"
          />
        </header>

        <div className="mt-5 space-y-2 text-sm text-[var(--erp-muted-foreground)]">
          <p className="flex items-start gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{branch.address || "Dirección no registrada"}</span>
          </p>
          {coordinates && (
            <p className="pl-6 text-xs tabular-nums">
              Coordenadas: {coordinates}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge tone={cycle ? cedisCycleStatusTones[cycle.status] : "slate"}>
            Estado del día: {cycleLabel}
          </Badge>
          <Badge tone={cash.tone}>
            <Banknote
              aria-hidden="true"
              className="mr-1.5 inline h-3.5 w-3.5"
            />
            Caja: {cash.label}
          </Badge>
          <Badge tone={item.warningCount > 0 ? "red" : "green"}>
            <AlertTriangle
              aria-hidden="true"
              className="mr-1.5 inline h-3.5 w-3.5"
            />
            {item.warningCount === 0
              ? "0 advertencias"
              : `${item.warningCount} advertencia${item.warningCount === 1 ? "" : "s"}`}
          </Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Metric
            icon={PackageCheck}
            label="Cantidad entregada"
            value={
              physical
                ? formatPhysicalQuantity(
                    physical.deliveredKg,
                    physical.deliveredPieces,
                  )
                : "—"
            }
          />
          <Metric
            icon={Undo2}
            label="Cantidad devuelta"
            value={
              physical
                ? formatPhysicalQuantity(
                    physical.returnedKg,
                    physical.returnedPieces,
                  )
                : "—"
            }
          />
          <Metric
            icon={CircleDollarSign}
            label="Venta esperada"
            value={financial ? formatMoney(financial.expectedSales) : "—"}
          />
          <Metric
            icon={CircleDollarSign}
            label="Venta real"
            value={financial ? formatMoney(financial.actualSales) : "—"}
          />
          <Metric
            icon={CircleDollarSign}
            label="Diferencia"
            value={difference ? formatMoney(difference) : "—"}
          />
          <Metric icon={Banknote} label="Estado de caja" value={cash.label} />
        </dl>
      </article>
    </Link>
  );
}
