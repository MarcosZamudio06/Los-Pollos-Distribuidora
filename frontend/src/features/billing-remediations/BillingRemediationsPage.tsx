import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useAuth } from "../auth";
import { useBillingRemediations, useResolveBillingRemediation } from "./hooks";
import type {
  BillingRemediationFilters,
  BillingRemediationItem,
  BillingRemediationStatus,
} from "./types";

const field =
  "h-11 w-full rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--erp-brand-gold)] focus:ring-2 focus:ring-[rgba(214,155,45,.18)]";
const codeLabels: Record<string, string> = {
  MISSING_LEGAL_ENTITY_MAPPING: "Asignar entidad legal",
  AMBIGUOUS_SALE_DOCUMENT: "Resolver documentos ambiguos",
  UNALLOCATED_ITEM_AMOUNTS: "Distribuir importes legacy",
  INVALID_SALE_TOTAL: "Corregir totales inválidos",
};
const contextCopy: Record<string, { title: string; description: string }> = {
  MISSING_LEGAL_ENTITY_MAPPING: {
    title: "Entidad legal pendiente",
    description: "La venta no tiene un emisor legal asignado.",
  },
  AMBIGUOUS_SALE_DOCUMENT: {
    title: "Documentos duplicados",
    description: "Hay más de un documento candidato para la venta.",
  },
  UNALLOCATED_ITEM_AMOUNTS: {
    title: "Importes sin distribuir",
    description: "Las partidas no reflejan correctamente los importes de la venta.",
  },
  INVALID_SALE_TOTAL: {
    title: "Totales inconsistentes",
    description: "La cabecera y las partidas no conservan la misma ecuación.",
  },
};
const documentTypeLabels: Record<string, string> = {
  LARGE_NOTE: "Nota grande",
  SIMPLE_NOTE: "Nota sencilla",
};
const amountFields = [
  ["subtotal", "Subtotal"],
  ["discount", "Descuento"],
  ["tax", "Impuesto"],
  ["total", "Total"],
] as const;

type ContextMetric = { label: string; value: string };
type ContextSnapshot = Record<string, unknown>;

function asContextSnapshot(value: unknown): ContextSnapshot | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ContextSnapshot)
    : null;
}

function contextText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return "";
}

function contextMoney(value: unknown): string {
  const text = contextText(value);
  return text ? formatMoney(text) : "";
}

function contextKeyLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function contextDocumentType(value: unknown): string {
  const text = contextText(value);
  return text ? (documentTypeLabels[text] ?? text) : "";
}

function pushContextMetric(
  metrics: ContextMetric[],
  label: string,
  value: unknown,
  formatter: (value: unknown) => string = contextText,
) {
  const formatted = formatter(value);
  if (formatted) metrics.push({ label, value: formatted });
}

function scalarContextMetrics(
  details: ContextSnapshot,
): ContextMetric[] {
  return Object.entries(details).flatMap(([key, value]) => {
    if (typeof value === "object" || value === null) return [];
    const formatted = ["subtotal", "discount", "tax", "total"].includes(key)
      ? contextMoney(value)
      : contextText(value);
    return formatted
      ? [{ label: contextKeyLabel(key), value: formatted }]
      : [];
  });
}

function getContextMetrics(item: BillingRemediationItem): ContextMetric[] {
  const details = item.details;
  const metrics: ContextMetric[] = [];

  if (item.code === "MISSING_LEGAL_ENTITY_MAPPING") {
    pushContextMetric(
      metrics,
      "Ubicación operativa",
      details.operationalLocationId,
    );
    pushContextMetric(metrics, "Moneda", details.currencyCode);
  }
  if (item.code === "AMBIGUOUS_SALE_DOCUMENT") {
    pushContextMetric(
      metrics,
      "Tipo documental",
      item.sale?.documentType ?? details.documentType,
      contextDocumentType,
    );
    pushContextMetric(metrics, "Documentos encontrados", details.matchingDocuments);
  }
  if (item.code === "UNALLOCATED_ITEM_AMOUNTS") {
    if (item.sale) {
      pushContextMetric(
        metrics,
        "Partidas detectadas",
        `${item.sale.items.length} partidas`,
      );
    }
    pushContextMetric(
      metrics,
      "Descuento en venta",
      details.discount ?? item.sale?.discount,
      contextMoney,
    );
    pushContextMetric(
      metrics,
      "Impuesto en venta",
      details.tax ?? item.sale?.tax,
      contextMoney,
    );
  }
  if (item.code === "INVALID_SALE_TOTAL") {
    const hasComparison =
      asContextSnapshot(details.header) || asContextSnapshot(details.items);
    if (!hasComparison) {
      for (const [key, label] of amountFields) {
        pushContextMetric(
          metrics,
          label,
          details[key] ?? item.sale?.[key],
          contextMoney,
        );
      }
    }
  }

  return metrics.length > 0 ? metrics : scalarContextMetrics(details);
}

function getAmountComparison(item: BillingRemediationItem) {
  if (item.code !== "INVALID_SALE_TOTAL") return null;
  const header = asContextSnapshot(item.details.header);
  const items = asContextSnapshot(item.details.items);
  return header || items ? { header: header ?? {}, items: items ?? {} } : null;
}

function getCandidateDocuments(item: BillingRemediationItem) {
  if (item.code !== "AMBIGUOUS_SALE_DOCUMENT" || !item.sale) return [];
  return item.sale.documents.filter(
    (document) =>
      document.documentType === item.sale?.documentType &&
      document.status !== "CANCELLED",
  );
}

function sameMoney(left: unknown, right: unknown): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return (
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    Math.abs(leftNumber - rightNumber) < 0.005
  );
}

function RemediationContext({ item }: { item: BillingRemediationItem }) {
  const copy = contextCopy[item.code] ?? {
    title: "Detalle de inconsistencia",
    description: "Revisa la información registrada por el validador.",
  };
  const metrics = getContextMetrics(item);
  const comparison = getAmountComparison(item);
  const candidateDocuments = getCandidateDocuments(item);
  const details = asContextSnapshot(item.details) ?? {};
  const hasTechnicalDetails = Object.keys(details).length > 0;

  return (
    <div className="min-w-[15rem] max-w-[22rem]">
      <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/70 p-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--erp-brand-gold)]"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[.08em] text-[var(--erp-foreground)]">
              {copy.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--erp-muted-foreground)]">
              {copy.description}
            </p>
          </div>
        </div>
        {metrics.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--erp-border)] pt-3">
            {metrics.map((metric) => (
              <div className="min-w-0" key={metric.label}>
                <dt className="text-[10px] font-bold uppercase tracking-[.06em] text-[var(--erp-muted-foreground)]">
                  {metric.label}
                </dt>
                <dd className="mt-0.5 break-words text-xs font-black text-[var(--erp-foreground)]">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {comparison && (
          <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--erp-border)] bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 bg-[var(--erp-surface)] px-2.5 py-2 text-[10px] font-black uppercase tracking-[.06em] text-[var(--erp-muted-foreground)]">
              <span />
              <span>Venta</span>
              <span>Partidas</span>
            </div>
            {amountFields.map(([key, label]) => {
              const headerValue = comparison.header[key];
              const itemValue = comparison.items[key];
              const hasBothValues = headerValue != null && itemValue != null;
              const mismatch = hasBothValues && !sameMoney(headerValue, itemValue);
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-[color:var(--erp-border)] px-2.5 py-2 text-xs"
                  key={key}
                >
                  <span className="font-bold text-[var(--erp-muted-foreground)]">
                    {label}
                  </span>
                  <span
                    className={
                      mismatch
                        ? "font-black text-[var(--erp-danger)]"
                        : "font-bold text-[var(--erp-foreground)]"
                    }
                  >
                    {contextMoney(headerValue) || "—"}
                  </span>
                  <span
                    className={
                      mismatch
                        ? "font-black text-[var(--erp-danger)]"
                        : "font-bold text-[var(--erp-foreground)]"
                    }
                  >
                    {contextMoney(itemValue) || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {candidateDocuments.length > 0 && (
          <div className="mt-3 border-t border-[color:var(--erp-border)] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[.06em] text-[var(--erp-muted-foreground)]">
              Documentos candidatos
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidateDocuments.map((document) => {
                const hasRelations =
                  document._count.billingRequestDocuments > 0 ||
                  document._count.invoiceDocuments > 0;
                return (
                  <span
                    className={`inline-flex max-w-full items-center rounded-full px-2 py-1 text-[10px] font-black ${hasRelations ? "bg-amber-100 text-amber-900" : "bg-white text-[var(--erp-foreground)]"}`}
                    key={document.id}
                    title={
                      hasRelations
                        ? "Documento con relaciones contables"
                        : "Documento sin relaciones contables"
                    }
                  >
                    <span className="truncate">
                      {document.physicalFolio ?? "Sin folio"}
                    </span>
                    {hasRelations && <span className="ml-1">· vinculado</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {!metrics.length && !comparison && !candidateDocuments.length && (
          <p className="mt-3 border-t border-[color:var(--erp-border)] pt-3 text-xs text-[var(--erp-muted-foreground)]">
            Sin datos adicionales registrados.
          </p>
        )}
        {hasTechnicalDetails && (
          <details className="mt-3 border-t border-[color:var(--erp-border)] pt-2">
            <summary className="cursor-pointer list-none text-[11px] font-black text-[var(--erp-info)]">
              Ver datos técnicos
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--erp-charcoal)] p-2.5 font-mono text-[10px] leading-4 text-white/80">
              {JSON.stringify(details, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export function getRemediationErrorDetails(error: unknown): string[] {
  if (
    !(error instanceof ApiClientError) ||
    typeof error.payload !== "object" ||
    !error.payload ||
    !Array.isArray(error.payload.findings)
  )
    return [];
  return error.payload.findings
    .map((finding) => finding.message)
    .filter(Boolean);
}
function parseFilters(params: URLSearchParams): BillingRemediationFilters {
  return {
    page: Number(params.get("page") || 1),
    limit: 25,
    status: (params.get("status") || "OPEN") as BillingRemediationStatus,
    code: params.get("code") || "",
    search: params.get("search") || "",
  };
}

export function BillingRemediationsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const query = useBillingRemediations(filters);
  const command = useResolveBillingRemediation();
  const [selected, setSelected] = useState<BillingRemediationItem>();
  const [reason, setReason] = useState("");
  const [applyCorrection, setApplyCorrection] = useState(true);
  const [correction, setCorrection] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const canResolve = user?.role === "ADMIN";

  function update(next: Partial<BillingRemediationFilters>) {
    const merged = { ...filters, ...next, page: next.page ?? 1 };
    const nextParams = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value !== undefined && value !== "")
        nextParams.set(key, String(value));
    });
    setParams(nextParams);
  }
  function open(item: BillingRemediationItem) {
    setSelected(item);
    setReason("");
    setApplyCorrection(true);
    setIdempotencyKey(crypto.randomUUID());
    setCorrection(
      item.code === "INVALID_SALE_TOTAL" && item.sale
        ? {
            subtotal: item.sale.subtotal,
            discount: item.sale.discount,
            tax: item.sale.tax,
            total: item.sale.total,
          }
        : Object.fromEntries(
            (item.code === "UNALLOCATED_ITEM_AMOUNTS"
              ? (item.sale?.items ?? [])
              : []
            ).flatMap((line) => [
              ["subtotal:" + line.id, line.subtotal],
              ["discount:" + line.id, line.discount],
              ["tax:" + line.id, line.tax],
              ["total:" + line.id, line.total],
            ]),
          ),
    );
  }
  function buildCorrection() {
    if (!selected || !applyCorrection) return undefined;
    if (selected.code === "MISSING_LEGAL_ENTITY_MAPPING")
      return correction.legalEntityId
        ? { legalEntityId: correction.legalEntityId }
        : undefined;
    if (selected.code === "AMBIGUOUS_SALE_DOCUMENT")
      return correction.selectedSaleDocumentId
        ? { selectedSaleDocumentId: correction.selectedSaleDocumentId }
        : undefined;
    if (selected.code === "INVALID_SALE_TOTAL")
      return {
        subtotal: correction.subtotal,
        discount: correction.discount,
        tax: correction.tax,
        total: correction.total,
      };
    if (selected.code === "UNALLOCATED_ITEM_AMOUNTS")
      return {
        items: (selected.sale?.items ?? []).map((line) => ({
          saleItemId: line.id,
          expectedVersion: line.version,
          subtotal: correction["subtotal:" + line.id],
          discount: correction["discount:" + line.id],
          tax: correction["tax:" + line.id],
          total: correction["total:" + line.id],
        })),
      };
    return undefined;
  }
  async function resolve() {
    if (!selected?.sale || !reason.trim() || !idempotencyKey) return;
    await command.mutateAsync({
      id: selected.id,
      idempotencyKey,
      expectedRemediationVersion: selected.version,
      expectedSaleVersion: selected.sale.version,
      expectedDocumentVersions:
        selected.code === "AMBIGUOUS_SALE_DOCUMENT"
          ? selected.sale.documents
              .filter(
                (document) =>
                  document.status !== "CANCELLED" &&
                  document.documentType === selected.sale?.documentType,
              )
              .map((document) => ({
                saleDocumentId: document.id,
                expectedVersion: document.version,
              }))
          : [],
      reason: reason.trim(),
      correction: buildCorrection(),
    });
    setSelected(undefined);
  }

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1450px] gap-5">
        <header className="relative overflow-hidden rounded-[1.75rem] border border-[color:var(--erp-border)] bg-white p-6 text-[var(--erp-foreground)] shadow-[var(--erp-shadow-elevated)] sm:p-8">
          <div className="absolute inset-y-0 right-0 w-2 bg-[var(--erp-brand-gold)]" />
          <p className="text-xs font-black uppercase tracking-[.22em] text-[var(--erp-brand-gold-deep)]">
            Integridad de facturación
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-.05em] sm:text-4xl">
            Remediaciones contables
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--erp-muted-foreground)]">
            Corrige inconsistencias de origen. El sistema validará nuevamente
            los datos antes de registrar una resolución.
          </p>
        </header>
        <Card className="p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Buscar</span>
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--erp-muted-foreground)]" />
              <input
                className={`${field} pl-9`}
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Venta, código o nota"
                value={filters.search}
              />
            </label>
            <select
              aria-label="Estado de remediación"
              className={field}
              onChange={(event) =>
                update({
                  status: event.target.value as BillingRemediationStatus,
                })
              }
              value={filters.status}
            >
              <option value="OPEN">Abiertas</option>
              <option value="RESOLVED">Resueltas</option>
              <option value="ALL">Todas</option>
            </select>
            <select
              aria-label="Tipo de inconsistencia"
              className={field}
              onChange={(event) => update({ code: event.target.value })}
              value={filters.code}
            >
              <option value="">Todos los tipos</option>
              {Object.entries(codeLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-[color:var(--erp-border)] p-5">
            <h2 className="text-lg font-black">Bandeja de inconsistencias</h2>
            <p className="text-sm text-[var(--erp-muted-foreground)]">
              {query.data?.pagination.total ?? 0} registros encontrados
            </p>
          </div>
          {query.isLoading && (
            <div className="flex items-center justify-center gap-3 p-14">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Cargando remediaciones…
            </div>
          )}
          {query.error && (
            <div className="p-10 text-center">
              <p className="font-black text-[var(--erp-danger)]">
                No se pudieron cargar las remediaciones.
              </p>
              <Button
                className="mt-4"
                onClick={() => void query.refetch()}
                variant="outline"
              >
                Reintentar
              </Button>
            </div>
          )}
          {!query.isLoading && !query.error && !query.data?.items.length && (
            <div className="p-14 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-3 font-black">
                No hay inconsistencias con estos filtros
              </p>
            </div>
          )}
          {!!query.data?.items.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[.12em] text-[var(--erp-muted-foreground)]">
                  <tr>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Inconsistencia</th>
                    <th className="p-4">Venta</th>
                    <th className="p-4">Detectada</th>
                    <th className="p-4">Contexto</th>
                    <th className="p-4">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr
                      className="border-t border-[color:var(--erp-border)]"
                      key={item.id}
                    >
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${item.resolvedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                        >
                          {item.resolvedAt ? "Resuelta" : "Abierta"}
                        </span>
                      </td>
                      <td className="p-4">
                        <strong>{codeLabels[item.code] ?? item.code}</strong>
                        <p className="mt-1 font-mono text-xs text-[var(--erp-muted-foreground)]">
                          {item.code}
                        </p>
                      </td>
                      <td className="p-4">
                        <strong>
                          {item.sale?.saleNumber ?? item.entityId}
                        </strong>
                        <p className="text-xs">
                          {item.sale?.legalEntity?.legalName ??
                            "Sin entidad legal"}
                        </p>
                      </td>
                      <td className="p-4">
                        {new Intl.DateTimeFormat("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.createdAt))}
                      </td>
                      <td className="max-w-sm p-4 align-top">
                        <RemediationContext item={item} />
                      </td>
                      <td className="p-4">
                        {canResolve && !item.resolvedAt ? (
                          <Button onClick={() => open(item)}>
                            Resolver inconsistencia
                          </Button>
                        ) : (
                          <span className="text-xs text-[var(--erp-muted-foreground)]">
                            {item.resolutionNotes ?? "Solo lectura"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-[color:var(--erp-border)] p-4">
            <Button
              disabled={filters.page <= 1}
              onClick={() => update({ page: filters.page - 1 })}
              variant="outline"
            >
              Anterior
            </Button>
            <span className="text-sm font-bold">
              Página {query.data?.pagination.page ?? 1} de{" "}
              {Math.max(query.data?.pagination.totalPages ?? 1, 1)}
            </span>
            <Button
              disabled={
                filters.page >= (query.data?.pagination.totalPages ?? 1)
              }
              onClick={() => update({ page: filters.page + 1 })}
              variant="outline"
            >
              Siguiente
            </Button>
          </div>
        </Card>
      </div>
      <ConfirmationDialog
        confirmDisabled={!reason.trim()}
        confirmLabel="Validar y resolver"
        description="La operación corregirá los datos seleccionados y volverá a evaluar la inconsistencia dentro de la misma transacción. Si continúa presente, no se guardará ningún cambio."
        isLoading={command.isPending}
        onConfirm={resolve}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        open={Boolean(selected)}
        title="Resolver inconsistencia de datos"
      >
        {selected && (
          <div className="grid gap-4">
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                No es un cierre administrativo. La resolución depende de que la
                validación contable posterior sea satisfactoria.
              </p>
            </div>
            <label className="flex items-center gap-2 font-bold">
              <input
                checked={applyCorrection}
                onChange={(event) => setApplyCorrection(event.target.checked)}
                type="checkbox"
              />
              Aplicar corrección desde esta bandeja
            </label>
            {applyCorrection && (
              <CorrectionFields
                correction={correction}
                item={selected}
                legalEntities={query.data?.legalEntities ?? []}
                onChange={(key, value) =>
                  setCorrection((current) => ({ ...current, [key]: value }))
                }
              />
            )}
            <label className="grid gap-2 font-bold">
              Motivo de resolución
              <textarea
                autoFocus
                className={`${field} min-h-24 py-3`}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
            {command.error && <RemediationCommandError error={command.error} />}
          </div>
        )}
      </ConfirmationDialog>
    </main>
  );
}

function CorrectionFields({
  item,
  correction,
  legalEntities,
  onChange,
}: {
  item: BillingRemediationItem;
  correction: Record<string, string>;
  legalEntities: Array<{ id: string; legalName: string; taxId: string }>;
  onChange: (key: string, value: string) => void;
}) {
  if (item.code === "MISSING_LEGAL_ENTITY_MAPPING")
    return (
      <label className="grid gap-2 font-bold">
        Entidad legal
        <select
          className={field}
          onChange={(event) => onChange("legalEntityId", event.target.value)}
          value={correction.legalEntityId ?? ""}
        >
          <option value="">Selecciona una entidad</option>
          {legalEntities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.legalName} · {entity.taxId}
            </option>
          ))}
        </select>
      </label>
    );
  if (item.code === "AMBIGUOUS_SALE_DOCUMENT")
    return (
      <label className="grid gap-2 font-bold">
        Documento primario
        <select
          className={field}
          onChange={(event) =>
            onChange("selectedSaleDocumentId", event.target.value)
          }
          value={correction.selectedSaleDocumentId ?? ""}
        >
          <option value="">Selecciona el documento correcto</option>
          {item.sale?.documents
            .filter(
              (document) =>
                document.status !== "CANCELLED" &&
                document.documentType === item.sale?.documentType,
            )
            .map((document) => (
              <option key={document.id} value={document.id}>
                {document.physicalFolio ?? document.id}
                {document._count.billingRequestDocuments +
                document._count.invoiceDocuments
                  ? " · con relaciones contables"
                  : ""}
              </option>
            ))}
        </select>
      </label>
    );
  if (item.code === "INVALID_SALE_TOTAL")
    return <AmountFields correction={correction} onChange={onChange} />;
  if (item.code === "UNALLOCATED_ITEM_AMOUNTS")
    return (
      <div className="grid gap-3">
        {item.sale?.items.map((line) => (
          <fieldset
            className="rounded-xl border border-[color:var(--erp-border)] p-3"
            key={line.id}
          >
            <legend className="px-1 font-black">
              {line.productNameSnapshot}
            </legend>
            <AmountFields
              correction={Object.fromEntries(
                ["subtotal", "discount", "tax", "total"].map((key) => [
                  key,
                  correction[key + ":" + line.id],
                ]),
              )}
              onChange={(key, value) => onChange(key + ":" + line.id, value)}
            />
          </fieldset>
        ))}
      </div>
    );
  return (
    <p>Este código solo admite validar una corrección realizada previamente.</p>
  );
}
function AmountFields({
  correction,
  onChange,
}: {
  correction: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        ["subtotal", "Subtotal"],
        ["discount", "Descuento"],
        ["tax", "Impuesto"],
        ["total", "Total"],
      ].map(([key, label]) => (
        <label className="grid gap-1 text-xs font-bold" key={key}>
          {label}
          <input
            className={field}
            min="0"
            onChange={(event) => onChange(key, event.target.value)}
            step="0.01"
            type="number"
            value={correction[key] ?? ""}
          />
        </label>
      ))}
    </div>
  );
}

function RemediationCommandError({ error }: { error: Error }) {
  const details = getRemediationErrorDetails(error);
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
      role="alert"
    >
      <p className="font-black">{error.message}</p>
      {details.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
