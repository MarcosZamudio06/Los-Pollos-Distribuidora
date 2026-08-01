import { useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { formatMoney as money } from "../../lib/money";
import type { DailyCloseDifference } from "./types";

function value(
  value: string | number | null,
  unit: DailyCloseDifference["unit"],
) {
  if (value === null) return "Pendiente";
  if (unit === "MXN") return money(value);
  return `${Number(value).toFixed(unit === "KG" ? 3 : 0)} ${unit === "KG" ? "kg" : "piezas"}`;
}

const scopeLabel: Record<DailyCloseDifference["scope"], string> = {
  CASH: "Caja",
  SCALE: "Báscula",
  INVENTORY: "Inventario",
  SALES: "Ventas",
  EXPENSES: "Gastos",
  BILLING: "Notas facturables",
};

const statusLabel: Record<DailyCloseDifference["status"], string> = {
  PENDING_JUSTIFICATION: "Pendiente de justificar",
  PENDING_AUTHORIZATION: "Pendiente de autorización",
  AUTHORIZED: "Autorizada",
};

export function DailyCloseDifferenceList({
  canAuthorize,
  canEdit,
  differences,
  onAuthorize,
  onJustify,
}: {
  canAuthorize: boolean;
  canEdit: boolean;
  differences: DailyCloseDifference[];
  onAuthorize: (differenceId: string) => Promise<void>;
  onJustify: (
    differenceId: string,
    reason: string,
    evidence: string,
  ) => Promise<void>;
}) {
  if (differences.length === 0)
    return (
      <article className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5 text-emerald-950">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={20} />
          <div>
            <h3 className="font-bold">No hay diferencias pendientes</h3>
            <p className="mt-1 text-sm">
              Los importes y kilos registrados concilian con lo esperado.
            </p>
          </div>
        </div>
      </article>
    );

  return (
    <div className="space-y-3">
      {differences
        .filter((difference) => Number(difference.differenceValue) !== 0)
        .map((difference) => (
          <DailyCloseDifferenceCard
            canAuthorize={canAuthorize}
            canEdit={canEdit}
            difference={difference}
            key={difference.id}
            onAuthorize={onAuthorize}
            onJustify={onJustify}
          />
        ))}
    </div>
  );
}

function DailyCloseDifferenceCard({
  canAuthorize,
  canEdit,
  difference,
  onAuthorize,
  onJustify,
}: {
  canAuthorize: boolean;
  canEdit: boolean;
  difference: DailyCloseDifference;
  onAuthorize: (differenceId: string) => Promise<void>;
  onJustify: (
    differenceId: string,
    reason: string,
    evidence: string,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState(difference.reason ?? "");
  const [evidence, setEvidence] = useState(difference.evidence ?? "");
  const [saving, setSaving] = useState(false);
  const isSurplus = difference.differenceType === "SURPLUS";
  const isAuthorized = difference.status === "AUTHORIZED";
  const submit = async () => {
    if (!reason.trim() || !evidence.trim() || saving) return;
    setSaving(true);
    try {
      await onJustify(difference.id, reason.trim(), evidence.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className={`rounded-2xl border p-5 ${isAuthorized ? "border-emerald-300 bg-emerald-50/60" : isSurplus ? "border-amber-300 bg-amber-50/70" : "border-[var(--erp-brand-red)] bg-[rgba(157,45,36,0.05)]"}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em]">
              {scopeLabel[difference.scope]}
            </span>
            <span className="text-xs font-bold text-[var(--erp-muted-foreground)]">
              {statusLabel[difference.status]}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-black">
            {difference.product?.name ??
              (difference.scope === "CASH"
                ? "Conciliación de efectivo"
                : difference.scope === "SCALE"
                  ? "Conciliación de báscula"
                  : "Diferencia operativa")}
          </h3>
          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
            {isSurplus ? "Sobrante" : "Faltante"} · {difference.code}
          </p>
        </div>
        <strong className="text-xl tabular-nums">
          {value(difference.differenceValue, difference.unit)}
        </strong>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--erp-muted-foreground)]">
            Esperado
          </dt>
          <dd className="mt-1 font-bold tabular-nums">
            {value(difference.expectedValue, difference.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--erp-muted-foreground)]">
            Registrado
          </dt>
          <dd className="mt-1 font-bold tabular-nums">
            {value(difference.recordedValue, difference.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--erp-muted-foreground)]">
            Tipo
          </dt>
          <dd className="mt-1 font-bold">
            {isSurplus ? "Sobrante" : "Faltante"}
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-2 rounded-xl border border-black/10 bg-white/50 p-3 text-sm sm:grid-cols-2">
        <p>
          <strong>Motivo:</strong> {difference.reason || "Pendiente"}
        </p>
        <p>
          <strong>Evidencia:</strong> {difference.evidence || "Pendiente"}
        </p>
        <p>
          <strong>Usuario que justificó:</strong>{" "}
          {difference.justifiedBy?.name || "Pendiente"}
        </p>
        <p>
          <strong>Administrador que autorizó:</strong>{" "}
          {difference.authorizedBy?.name || "Pendiente"}
        </p>
      </div>
      {canEdit && !isAuthorized && (
        <div className="mt-4 grid gap-2 border-t border-black/10 pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Motivo de la diferencia"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo de la diferencia"
              value={reason}
            />
            <Input
              aria-label="Evidencia de la diferencia"
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="Evidencia: folio, nota o referencia"
              value={evidence}
            />
          </div>
          <Button
            disabled={!reason.trim() || !evidence.trim() || saving}
            onClick={() => void submit()}
            size="sm"
          >
            <FileText size={15} />{" "}
            {difference.status === "PENDING_AUTHORIZATION"
              ? "Actualizar justificación"
              : "Guardar justificación"}
          </Button>
        </div>
      )}
      {canAuthorize && difference.status === "PENDING_AUTHORIZATION" && (
        <div className="mt-4 border-t border-black/10 pt-4">
          <Button
            onClick={() => void onAuthorize(difference.id)}
            size="sm"
            variant="secondary"
          >
            <ShieldCheck size={15} /> Autorizar diferencia
          </Button>
        </div>
      )}
    </article>
  );
}
