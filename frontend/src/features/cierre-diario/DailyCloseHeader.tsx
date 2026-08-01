import {
  CalendarDays,
  Clock3,
  GitBranch,
  Monitor,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { DailyClose } from "./types";

const statusLabel: Record<DailyClose["status"], string> = {
  DRAFT: "Borrador",
  REVIEWED: "Revisado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

function date(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

function time(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function HeaderValue({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-l border-[var(--erp-border)] pl-4 first:border-l-0 first:pl-0">
      <dt className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
        <Icon size={13} /> {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-bold text-[var(--erp-foreground)]">
        {value}
      </dd>
    </div>
  );
}

export function DailyCloseHeader({ close }: { close: DailyClose }) {
  const shifts = close.cashShifts ?? [];
  const terminalCount = new Set(shifts.map((shift) => shift.terminalId)).size;
  const openShiftCount = shifts.filter(
    (shift) => shift.status === "OPEN",
  ).length;
  return (
    <header className="relative z-0 overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[color:var(--erp-surface-elevated)]/95 p-4 shadow-md backdrop-blur-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[var(--erp-brand-red)]">
            Control de jornada
          </p>
          <h2 className="mt-1 truncate text-xl font-black tracking-tight">
            {close.operationalLocation.name} · {date(close.businessDate)}
          </h2>
          <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
            Consolidado diario de sucursal ·{" "}
            {close.operationalLocation.code ?? "Sin código de sucursal"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderValue
            icon={GitBranch}
            label="Sucursal"
            value={close.operationalLocation.name}
          />
          <HeaderValue
            icon={CalendarDays}
            label="Fecha operativa"
            value={date(close.businessDate)}
          />
          <HeaderValue
            icon={Monitor}
            label="Terminales"
            value={String(terminalCount)}
          />
          <HeaderValue
            icon={UsersRound}
            label="Turnos"
            value={`${shifts.length} · ${openShiftCount} abiertos`}
          />
          <HeaderValue
            icon={GitBranch}
            label="Estado cierre"
            value={statusLabel[close.status]}
          />
          <HeaderValue
            icon={Clock3}
            label="Última actualización"
            value={time(close.dataAsOf)}
          />
        </dl>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--erp-border)] pt-3 text-xs text-[var(--erp-muted-foreground)]">
        <span role={openShiftCount > 0 ? "alert" : undefined}>
          {openShiftCount > 0
            ? "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada."
            : "Todos los turnos están cerrados o no hay turnos registrados."}
        </span>
        <strong className="font-bold text-[var(--erp-foreground)]">
          Versión {close.version}
        </strong>
      </div>
    </header>
  );
}
