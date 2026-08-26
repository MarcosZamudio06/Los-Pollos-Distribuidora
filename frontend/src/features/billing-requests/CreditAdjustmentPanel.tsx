import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  FileMinus2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Input, Select } from "@/components/ui";
import {
  useApproveCreditAdjustment,
  useCreateCreditAdjustment,
  useIssueCreditAdjustment,
  useSatCatalog,
} from "./hooks";
import { paymentFormOptions, satCatalogOptions } from "./cfdiReview";
import type {
  BillingRequestNativeInvoice,
  CreditAdjustment,
  CreditAdjustmentSourceType,
} from "./types";

const fieldClass =
  "grid gap-1.5 text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]";

const sourceOptions: ReadonlyArray<{
  value: CreditAdjustmentSourceType;
  label: string;
}> = [
  { value: "APPROVED_RETURN", label: "Devolución aprobada" },
  { value: "BONUS", label: "Bonificación" },
  { value: "POST_SALE_DISCOUNT", label: "Descuento posterior" },
  { value: "COMMERCIAL_ADJUSTMENT", label: "Ajuste comercial" },
];

const statusLabels: Record<string, string> = {
  DRAFT: "Pendiente de autorización",
  APPROVED: "Autorizada",
  ISSUING: "Emitiendo CFDI E",
  UNKNOWN: "Timbrado indeterminado",
  ISSUED: "CFDI E emitido",
  ISSUE_ERROR: "Error de emisión",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

function stableError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  switch (code) {
    case "CREDIT_ADJUSTMENT_OVER_CREDIT":
      return "El importe supera el saldo acreditable de la factura.";
    case "CREDIT_ADJUSTMENT_INVOICE_NOT_ELIGIBLE":
      return "La factura ya no está activa y timbrada para recibir créditos.";
    case "CREDIT_ADJUSTMENT_SOURCE_REFERENCE_REQUIRED":
      return "La devolución aprobada requiere su referencia comercial.";
    case "VERSION_CONFLICT":
      return "La operación cambió; vuelve a cargar el detalle antes de continuar.";
    default:
      return code || "No se pudo completar la operación de nota de crédito.";
  }
}

export function CreditAdjustmentPanel({
  invoice,
  role,
}: {
  invoice: BillingRequestNativeInvoice;
  role?: string | null;
}) {
  const concepts = useMemo(() => invoice.concepts ?? [], [invoice.concepts]);
  const [sourceType, setSourceType] =
    useState<CreditAdjustmentSourceType>("BONUS");
  const [sourceReference, setSourceReference] = useState("");
  const [internalReason, setInternalReason] = useState("");
  const [paymentFormCode, setPaymentFormCode] = useState("03");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(concepts.map((concept) => [concept.id, true])),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      concepts.map((concept) => [concept.id, String(concept.total)]),
    ),
  );
  const [adjustment, setAdjustment] = useState<CreditAdjustment | null>(null);
  const [issuedUuid, setIssuedUuid] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [createKey] = useState(() => crypto.randomUUID());
  const [issueKey] = useState(() => crypto.randomUUID());
  const create = useCreateCreditAdjustment();
  const approve = useApproveCreditAdjustment();
  const issue = useIssueCreditAdjustment();
  const paymentForms = useSatCatalog(
    "c_FormaPago",
    role === "ADMIN" || role === "BILLING",
  );

  if (role !== "ADMIN" && role !== "BILLING") return null;

  const controlledPaymentForms = satCatalogOptions(
    paymentForms.data,
    paymentFormOptions,
  );
  const selectedLines = concepts
    .filter((concept) => selected[concept.id])
    .map((concept) => ({
      invoiceConceptId: concept.id,
      creditTotal: amounts[concept.id]?.trim() ?? "",
    }))
    .filter(
      (line) =>
        line.creditTotal !== "" &&
        Number.isFinite(Number(line.creditTotal)) &&
        Number(line.creditTotal) > 0,
    );
  const requiresSourceReference = sourceType === "APPROVED_RETURN";
  const busy = create.isPending || approve.isPending || issue.isPending;
  const canCreate =
    !adjustment &&
    !busy &&
    internalReason.trim().length >= 3 &&
    paymentFormCode !== "" &&
    selectedLines.length > 0 &&
    (!requiresSourceReference || sourceReference.trim().length > 0);

  async function createAdjustment() {
    if (!canCreate) return;
    setLocalError(null);
    try {
      const result = await create.mutateAsync({
        idempotencyKey: createKey,
        input: {
          sourceType,
          ...(sourceReference.trim()
            ? { sourceReference: sourceReference.trim() }
            : {}),
          internalReason: internalReason.trim(),
          paymentFormCode,
          applications: [{ invoiceId: invoice.id, lines: selectedLines }],
        },
      });
      setAdjustment(result);
    } catch (error) {
      setLocalError(stableError(error));
    }
  }

  async function approveAdjustment() {
    if (!adjustment || adjustment.status !== "DRAFT" || busy) return;
    setLocalError(null);
    try {
      const result = await approve.mutateAsync({
        id: adjustment.id,
        expectedVersion: adjustment.version,
      });
      setAdjustment(result);
    } catch (error) {
      setLocalError(stableError(error));
    }
  }

  async function issueCreditNote() {
    if (!adjustment || adjustment.status !== "APPROVED" || busy) return;
    setLocalError(null);
    try {
      const result = await issue.mutateAsync({
        id: adjustment.id,
        expectedVersion: adjustment.version,
        idempotencyKey: issueKey,
      });
      setAdjustment((current) =>
        current
          ? {
              ...current,
              status: result.adjustmentStatus as CreditAdjustment["status"],
            }
          : current,
      );
      setIssuedUuid(result.uuid ?? null);
    } catch (error) {
      setLocalError(stableError(error));
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--erp-border)]">
      <header className="flex flex-wrap items-start justify-between gap-3 bg-[var(--erp-charcoal)] p-4 text-white">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-white">
            <FileMinus2 className="h-5 w-5 text-[var(--erp-brand-gold-soft)]" />
            Nota de crédito CFDI E
          </h3>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-white/75">
            Crea una operación comercial explícita, autorízala y después emite
            el egreso fiscal relacionado con esta factura.
          </p>
        </div>
        <Badge tone={adjustment?.status === "ISSUED" ? "green" : "amber"}>
          {adjustment
            ? (statusLabels[adjustment.status] ?? adjustment.status)
            : "Sin operación"}
        </Badge>
      </header>

      <div className="grid gap-4 p-4">
        <div className="flex items-start gap-2 rounded-xl border border-[rgba(214,155,45,0.35)] bg-[rgba(214,155,45,0.10)] p-3 text-xs font-semibold text-[var(--erp-brand-gold-deep)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No modifica inventario y nunca se crea automáticamente desde una
            incidencia, devolución física o movimiento de almacén.
          </p>
        </div>

        {!adjustment && (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className={fieldClass}>
                Origen comercial
                <Select
                  aria-label="Origen comercial del crédito"
                  disabled={busy}
                  onChange={(event) =>
                    setSourceType(
                      event.target.value as CreditAdjustmentSourceType,
                    )
                  }
                  value={sourceType}
                >
                  {sourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              {requiresSourceReference && (
                <label className={fieldClass}>
                  Referencia de devolución aprobada
                  <Input
                    aria-label="Referencia de devolución aprobada"
                    disabled={busy}
                    onChange={(event) => setSourceReference(event.target.value)}
                    value={sourceReference}
                  />
                </label>
              )}
              <label className={fieldClass}>
                Motivo interno
                <Input
                  aria-label="Motivo interno del crédito"
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => setInternalReason(event.target.value)}
                  placeholder="Explica la autorización comercial"
                  value={internalReason}
                />
              </label>
              <label className={fieldClass}>
                Forma de pago
                <Select
                  aria-label="Forma de pago de la nota de crédito"
                  disabled={busy}
                  onChange={(event) => setPaymentFormCode(event.target.value)}
                  value={paymentFormCode}
                >
                  {controlledPaymentForms.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[color:var(--erp-border)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--erp-charcoal)] text-xs uppercase tracking-[.1em] text-white">
                  <tr>
                    <th className="p-3 text-white">Acreditar</th>
                    <th className="p-3 text-white">Concepto original</th>
                    <th className="p-3 text-white">Clave SAT</th>
                    <th className="p-3 text-right text-white">Facturado</th>
                    <th className="p-3 text-right text-white">
                      Importe a acreditar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {concepts.map((concept) => (
                    <tr
                      className="border-t border-[color:var(--erp-border)]"
                      key={concept.id}
                    >
                      <td className="p-3">
                        <input
                          aria-label={`Seleccionar ${concept.description}`}
                          checked={Boolean(selected[concept.id])}
                          disabled={busy}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [concept.id]: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="p-3 font-bold">{concept.description}</td>
                      <td className="p-3 font-mono text-xs">
                        {concept.productServiceCode} · {concept.unitCode}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {String(concept.total)}
                      </td>
                      <td className="p-3">
                        <Input
                          aria-label={`Importe a acreditar de ${concept.description}`}
                          disabled={!selected[concept.id] || busy}
                          inputMode="decimal"
                          min="0.01"
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [concept.id]: event.target.value,
                            }))
                          }
                          step="0.01"
                          type="number"
                          value={amounts[concept.id] ?? ""}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {adjustment && (
          <div className="grid gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]">
                Estado
              </p>
              <p className="font-bold">
                {statusLabels[adjustment.status] ?? adjustment.status}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]">
                Total reservado
              </p>
              <p className="font-mono font-bold">{adjustment.total}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]">
                Relación fiscal
              </p>
              <p className="font-mono font-bold">
                {adjustment.relationshipTypeCode}
              </p>
            </div>
          </div>
        )}

        {adjustment?.status === "UNKNOWN" && (
          <div className="flex items-start gap-2 rounded-xl border border-[rgba(214,155,45,0.35)] bg-[rgba(214,155,45,0.10)] p-3 text-sm text-[var(--erp-brand-gold-deep)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              El PAC pudo haber emitido el CFDI E. El saldo continúa reservado y
              esta pantalla no permite un segundo timbrado.
            </p>
          </div>
        )}

        {adjustment?.status === "ISSUED" && (
          <div className="flex items-start gap-2 rounded-xl border border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.06)] p-3 text-sm text-[var(--erp-success)]">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-bold">
              CFDI E emitido{issuedUuid ? ` · ${issuedUuid}` : ""}
            </p>
          </div>
        )}

        {(localError || create.error || approve.error || issue.error) && (
          <p
            className="text-sm font-semibold text-[var(--erp-danger)]"
            role="alert"
          >
            {localError ??
              stableError(create.error ?? approve.error ?? issue.error)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {!adjustment && (
            <Button
              aria-busy={create.isPending}
              disabled={!canCreate}
              onClick={createAdjustment}
            >
              {create.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              Crear operación de crédito
            </Button>
          )}
          {adjustment?.status === "DRAFT" && (
            <Button
              aria-busy={approve.isPending}
              disabled={busy}
              onClick={approveAdjustment}
            >
              {approve.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              Autorizar crédito
            </Button>
          )}
          {adjustment?.status === "APPROVED" && (
            <Button
              aria-busy={issue.isPending}
              disabled={busy}
              onClick={issueCreditNote}
            >
              {issue.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              Emitir CFDI E
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
