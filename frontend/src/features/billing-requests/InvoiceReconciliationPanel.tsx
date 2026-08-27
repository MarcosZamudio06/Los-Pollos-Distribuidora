import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileCheck2,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@/components/ui";
import {
  useCancellationStatus,
  useCancelInvoice,
  useFiscalArtifactDownload,
  useIssueBillingCfdi,
  useSatCatalog,
} from "./hooks";
import {
  cfdiFiscalStatusLabel,
  cfdiFiscalStatusTone,
  cfdiUseOptions,
  exportCodeOptions,
  fieldLabel,
  fiscalValue,
  formatCfdiDate,
  getCfdiIssueErrorDetails,
  normalizeCfdiFiscalStatus,
  paymentFormOptions,
  satCatalogOptions,
} from "./cfdiReview";
import type {
  BillingRequestDetail,
  BillingRequestNativeInvoice,
  CancelInvoiceInput,
  FiscalCancellationMotive,
  IssueCfdiInput,
} from "./types";
import { CreditAdjustmentPanel } from "./CreditAdjustmentPanel";

const fieldClass =
  "grid gap-1.5 text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]";
const valueClass =
  "rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--erp-foreground)]";

const cancellationLabels: Record<string, string> = {
  NOT_APPLICABLE: "No aplica",
  NOT_REQUESTED: "No solicitada",
  PENDING: "En proceso",
  ACCEPTED: "Cancelada",
  REJECTED: "Rechazada",
  UNKNOWN: "Indeterminada",
};

const cancellationMotiveOptions: ReadonlyArray<{
  value: FiscalCancellationMotive;
  label: string;
}> = [
  { value: "01", label: "01 · Comprobante emitido con errores con relación" },
  { value: "02", label: "02 · Comprobante emitido con errores sin relación" },
  { value: "03", label: "03 · No se llevó a cabo la operación" },
  {
    value: "04",
    label: "04 · Operación nominativa relacionada en factura global",
  },
];

function ReadOnlyField({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className={fieldClass}>
      <span>{label}</span>
      <div className={valueClass}>{fiscalValue(value as string | null)}</div>
    </div>
  );
}

function cancellationErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  switch (code) {
    case "CANCELLATION_IN_PROGRESS":
      return "La cancelación ya está pendiente de confirmación fiscal.";
    case "CANCELLATION_REPLACEMENT_REQUIRED":
      return "El motivo 01 requiere una factura sustituta válida.";
    case "VERSION_CONFLICT":
      return "La factura cambió; actualiza el estado antes de solicitar la cancelación.";
    default:
      return code || "No se pudo solicitar la cancelación fiscal.";
  }
}

function ProfileWarning({ request }: { request: BillingRequestDetail }) {
  const profile = request.cfdiReview?.profile;
  if (!profile || profile.complete) return null;
  const missing = [
    ...profile.issuerMissingFields,
    ...profile.receiverMissingFields,
  ].map(fieldLabel);
  const conceptCount = profile.conceptIssues.length;
  return (
    <div
      className="grid gap-2 rounded-2xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-4 text-sm text-[var(--erp-danger)]"
      role="status"
    >
      <div className="flex items-center gap-2 font-black">
        <AlertTriangle className="h-4 w-4" />
        Perfil fiscal incompleto para emisión
      </div>
      {missing.length > 0 && <p>Faltan: {missing.join(", ")}.</p>}
      {conceptCount > 0 && (
        <p>
          {conceptCount} concepto(s) requieren configuración SAT antes de
          timbrar.
        </p>
      )}
      <p className="text-xs font-semibold">
        El backend volverá a validar catálogos, importes y saldo al emitir.
      </p>
    </div>
  );
}

function StatusNotice({
  status,
  invoice,
  issueError,
}: {
  status: ReturnType<typeof normalizeCfdiFiscalStatus>;
  invoice?: BillingRequestNativeInvoice | null;
  issueError?: unknown;
}) {
  if (status === "STAMPING") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[rgba(47,111,115,0.28)] bg-[rgba(47,111,115,0.08)] p-4 text-sm text-[var(--erp-info)]">
        <LoaderCircle className="mt-0.5 h-5 w-5 animate-spin" />
        <div>
          <p className="font-black">Timbrando CFDI</p>
          <p>
            La operación está reservada. No cierres la pantalla ni envíes otra
            solicitud.
          </p>
        </div>
      </div>
    );
  }
  if (status === "STAMP_UNKNOWN") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[rgba(214,155,45,0.35)] bg-[rgba(214,155,45,0.12)] p-4 text-sm text-[var(--erp-brand-gold-deep)]">
        <Info className="mt-0.5 h-5 w-5" />
        <div>
          <p className="font-black">Timbrado indeterminado · STAMP_UNKNOWN</p>
          <p>
            El PAC pudo haber timbrado. No se volverá a timbrar automáticamente;
            consulta el estado fiscal para reconciliar la operación.
          </p>
          {invoice?.lastFiscalErrorCode && (
            <p className="mt-1 text-xs font-bold">
              Referencia técnica: {invoice.lastFiscalErrorCode}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (status === "STAMP_ERROR" || issueError) {
    const details = issueError
      ? getCfdiIssueErrorDetails(issueError)
      : [
          invoice?.lastFiscalErrorCode
            ? `Código: ${invoice.lastFiscalErrorCode}`
            : "La operación fiscal terminó con error terminal.",
        ];
    return (
      <div
        className="grid gap-1 rounded-2xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-4 text-sm text-[var(--erp-danger)]"
        role="alert"
      >
        <p className="font-black">
          {issueError && status === "READY"
            ? "Validación fiscal"
            : "Error de timbrado"}
        </p>
        {details.map((detail) => (
          <p key={detail}>{detail}</p>
        ))}
      </div>
    );
  }
  return null;
}

function ArtifactButton({
  invoiceId,
  type,
  available,
  onDownload,
  pending,
}: {
  invoiceId: string;
  type: "XML" | "PDF";
  available: boolean;
  onDownload: (type: "XML" | "PDF") => void;
  pending: boolean;
}) {
  if (!available) {
    return (
      <span className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
        {type === "XML" ? "XML" : "PDF"} pendiente de almacenamiento
      </span>
    );
  }
  return (
    <Button
      aria-label={`Descargar ${type}`}
      disabled={pending || !invoiceId}
      onClick={() => onDownload(type)}
      size="sm"
      variant="outline"
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Descargar {type}
    </Button>
  );
}

export function InvoiceReconciliationPanel({
  request,
  role,
}: {
  request: BillingRequestDetail;
  role?: string | null;
}) {
  const [cfdiUse, setCfdiUse] = useState(
    () =>
      request.nativeInvoice?.fiscalUseCode ??
      request.cfdiReview?.receiver?.fiscalUseCode ??
      request.customer?.fiscalUseCode ??
      "",
  );
  const [paymentMethod, setPaymentMethod] = useState<
    IssueCfdiInput["paymentMethod"]
  >(() => (request.nativeInvoice?.paymentMethodCode === "PPD" ? "PPD" : "PUE"));
  const [paymentForm, setPaymentForm] = useState(
    () => request.nativeInvoice?.paymentFormCode ?? "03",
  );
  const [exportCode, setExportCode] = useState(
    () => request.nativeInvoice?.exportCode ?? "01",
  );
  const [tipoCambio, setTipoCambio] = useState("");
  const [artifactType, setArtifactType] = useState<"XML" | "PDF" | null>(null);
  const [cancellationMotive, setCancellationMotive] =
    useState<FiscalCancellationMotive>(() => {
      const value = request.nativeInvoice?.cancellationMotiveCode;
      return value === "01" ||
        value === "02" ||
        value === "03" ||
        value === "04"
        ? value
        : "02";
    });
  const [internalReason, setInternalReason] = useState("");
  const [replacementInvoiceId, setReplacementInvoiceId] = useState("");
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );
  const [cancellationStatusEnabled, setCancellationStatusEnabled] =
    useState(false);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  const issue = useIssueBillingCfdi(request.id);
  const artifact = useFiscalArtifactDownload();
  const invoiceId = request.nativeInvoice?.id ?? "";
  const cancel = useCancelInvoice(invoiceId);
  const cancellationStatus = useCancellationStatus(
    invoiceId,
    cancellationStatusEnabled,
  );
  const cfdiUseCatalog = useSatCatalog(
    "c_UsoCFDI",
    role === "ADMIN" || role === "BILLING",
  );
  const paymentFormCatalog = useSatCatalog(
    "c_FormaPago",
    role === "ADMIN" || role === "BILLING",
  );

  if ((role !== "ADMIN" && role !== "BILLING") || request.status !== "APPROVED")
    return null;

  const review = request.cfdiReview;
  const controlledCfdiUseOptions = satCatalogOptions(
    cfdiUseCatalog.data,
    cfdiUseOptions,
  );
  const controlledPaymentFormOptions = satCatalogOptions(
    paymentFormCatalog.data,
    paymentFormOptions,
  );
  const nativeInvoice = request.nativeInvoice;
  const remoteCancellation = cancellationStatus.data;
  const cancellationState =
    remoteCancellation?.state ??
    (nativeInvoice?.cancellationStatus === "PENDING"
      ? "PENDING"
      : nativeInvoice?.cancellationStatus === "ACCEPTED"
        ? "CANCELLED"
        : nativeInvoice?.cancellationStatus === "REJECTED"
          ? "REJECTED"
          : nativeInvoice?.cancellationStatus === "UNKNOWN"
            ? "ERROR"
            : "NOT_REQUESTED");
  const cancellationMotiveFromServer =
    remoteCancellation?.cancellationMotiveCode ??
    nativeInvoice?.cancellationMotiveCode ??
    null;
  const replacementUuid =
    remoteCancellation?.replacementUuid ??
    nativeInvoice?.replacementUuid ??
    null;
  const status = normalizeCfdiFiscalStatus(
    nativeInvoice?.fiscalStatus ?? issue.data?.fiscalStatus,
  );
  const paymentConfigurationReady =
    (paymentMethod === "PUE" && paymentForm !== "99") ||
    (paymentMethod === "PPD" && paymentForm === "99");
  const requiresExchangeRate = Boolean(
    review?.currencyCode && review.currencyCode !== "MXN",
  );
  const canIssue =
    !nativeInvoice &&
    status === "READY" &&
    Boolean(review?.profile.complete && cfdiUse) &&
    paymentConfigurationReady &&
    (!requiresExchangeRate || Number(tipoCambio) > 0);
  const canCancel = Boolean(
    nativeInvoice &&
    nativeInvoice.fiscalStatus === "STAMPED" &&
    nativeInvoice.status !== "CANCELLED" &&
    nativeInvoice.version &&
    cancellationState !== "PENDING" &&
    cancellationState !== "CANCELLED" &&
    !cancel.isPending,
  );
  const artifacts = nativeInvoice?.fiscalArtifacts ?? [];
  const hasArtifact = (type: "XML" | "PDF") =>
    artifacts.some((item) => item.type === type && item.status === "AVAILABLE");

  async function submit() {
    if (!canIssue || issue.isPending) return;
    const input: IssueCfdiInput = {
      expectedVersion: request.version,
      cfdiUse,
      paymentMethod,
      paymentForm,
      exportCode,
      ...(tipoCambio.trim() ? { tipoCambio: tipoCambio.trim() } : {}),
    };
    try {
      await issue.mutateAsync({ input, idempotencyKey });
    } catch {
      // The mutation exposes the stable backend error and refreshes the
      // request; a client retry must never create a new idempotency key.
    }
  }

  async function download(type: "XML" | "PDF") {
    if (!nativeInvoice || artifact.isPending) return;
    setArtifactType(type);
    try {
      const result = await artifact.mutateAsync({
        invoiceId: nativeInvoice.id,
        type,
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      // The download mutation keeps the scoped storage error visible below.
    } finally {
      setArtifactType(null);
    }
  }

  async function submitCancellation() {
    if (!canCancel || !nativeInvoice?.version || cancel.isPending) return;
    const reason = internalReason.trim();
    if (!reason) {
      setCancellationError("El motivo interno es obligatorio.");
      return;
    }
    if (cancellationMotive === "01" && !replacementInvoiceId.trim()) {
      setCancellationError(
        "El motivo 01 requiere una factura sustituta válida.",
      );
      return;
    }
    setCancellationError(null);
    const input: CancelInvoiceInput = {
      expectedVersion: nativeInvoice.version,
      cancellationMotiveCode: cancellationMotive,
      internalReason: reason,
      ...(cancellationMotive === "01" && replacementInvoiceId.trim()
        ? { replacementInvoiceId: replacementInvoiceId.trim() }
        : {}),
    };
    try {
      await cancel.mutateAsync({
        input,
        idempotencyKey: crypto.randomUUID(),
      });
      setCancellationStatusEnabled(true);
      void cancellationStatus.refetch();
    } catch (error) {
      setCancellationError(cancellationErrorMessage(error));
    }
  }

  function refreshCancellationStatus() {
    setCancellationStatusEnabled(true);
    void cancellationStatus.refetch();
  }

  return (
    <Card className="overflow-hidden border-[color:var(--erp-brand-gold)]">
      <CardHeader className="bg-[var(--erp-charcoal)] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileCheck2 className="h-5 w-5 text-[var(--erp-brand-gold-soft)]" />
              Revisión fiscal CFDI 4.0
            </CardTitle>
            <CardDescription className="text-white/70">
              Revisa los datos server-owned y confirma las decisiones fiscales
              permitidas antes de emitir el CFDI de Ingreso.
            </CardDescription>
          </div>
          <Badge tone={cfdiFiscalStatusTone(status)}>
            {cfdiFiscalStatusLabel(status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 p-5">
        {!review && (
          <div className="rounded-2xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-semibold text-[var(--erp-danger)]">
            No se recibió la revisión fiscal autoritativa. Actualiza la
            solicitud antes de emitir.
          </div>
        )}
        {review && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="grid gap-3 rounded-2xl border border-[color:var(--erp-border)] p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                  <ShieldCheck className="h-4 w-4" /> Emisor fiscal
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadOnlyField
                    label="Razón social"
                    value={review.issuer?.legalName}
                  />
                  <ReadOnlyField label="RFC" value={review.issuer?.taxId} />
                  <ReadOnlyField
                    label="Régimen fiscal"
                    value={review.issuer?.fiscalRegime}
                  />
                  <ReadOnlyField
                    label="CP / lugar de expedición"
                    value={review.issuer?.fiscalPostalCode}
                  />
                  <ReadOnlyField
                    label="Serie"
                    value={review.issuer?.defaultSeries}
                  />
                  <ReadOnlyField
                    label="Estado del emisor"
                    value={
                      review.issuer?.cfdiEnabled && review.issuer?.isActive
                        ? "Activo para CFDI"
                        : "No disponible para CFDI"
                    }
                  />
                </div>
              </section>
              <section className="grid gap-3 rounded-2xl border border-[color:var(--erp-border)] p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                  <ShieldCheck className="h-4 w-4" /> Receptor fiscal
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadOnlyField
                    label="Razón social"
                    value={review.receiver?.fiscalName}
                  />
                  <ReadOnlyField label="RFC" value={review.receiver?.taxId} />
                  <ReadOnlyField
                    label="Régimen fiscal"
                    value={review.receiver?.fiscalRegime}
                  />
                  <ReadOnlyField
                    label="CP fiscal"
                    value={review.receiver?.fiscalPostalCode}
                  />
                  <ReadOnlyField
                    label="UsoCFDI actual"
                    value={review.receiver?.fiscalUseCode}
                  />
                  <ReadOnlyField
                    label="Correo de facturación"
                    value={review.receiver?.billingEmail}
                  />
                </div>
              </section>
            </div>

            <section className="grid gap-3">
              <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                Conceptos fiscales
              </p>
              <div className="overflow-x-auto rounded-2xl border border-[color:var(--erp-border)]">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-[var(--erp-charcoal)] text-xs uppercase tracking-[.1em] text-white">
                    <tr>
                      <th className="p-3">Concepto</th>
                      <th className="p-3">ClaveProdServ</th>
                      <th className="p-3">ClaveUnidad</th>
                      <th className="p-3">ObjetoImp</th>
                      <th className="p-3">Impuestos</th>
                      <th className="p-3 text-right">Importe</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.concepts.map((concept) => (
                      <tr
                        className="border-t border-[color:var(--erp-border)]"
                        key={concept.saleItemId}
                      >
                        <td className="p-3">
                          <p className="font-bold">
                            {concept.description ?? "Sin descripción"}
                          </p>
                          <p className="text-xs text-[var(--erp-muted-foreground)]">
                            {concept.quantity ?? "—"}{" "}
                            {concept.operationalUnit ?? ""}
                          </p>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {fiscalValue(concept.productServiceCode)}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {fiscalValue(concept.unitCode)}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {fiscalValue(concept.taxObjectCode)}
                        </td>
                        <td className="p-3 text-xs">
                          {fiscalValue(concept.taxCode)} ·{" "}
                          {fiscalValue(concept.factorType)} ·{" "}
                          {fiscalValue(concept.rateOrQuota)}
                          <br />
                          Impuesto {concept.tax}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {concept.amount}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {concept.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-3 rounded-2xl border border-[color:var(--erp-border)] p-4">
                <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                  Decisiones fiscales permitidas
                </p>
                <p className="text-xs text-[var(--erp-muted-foreground)]">
                  Estos valores se envían como decisión operativa; el backend
                  recalcula conceptos, impuestos, total y saldo disponible.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className={fieldClass}>
                    UsoCFDI
                    <Select
                      aria-label="UsoCFDI"
                      disabled={Boolean(nativeInvoice) || issue.isPending}
                      onChange={(event) => setCfdiUse(event.target.value)}
                      value={cfdiUse}
                    >
                      <option value="">Seleccionar catálogo SAT</option>
                      {controlledCfdiUseOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className={fieldClass}>
                    Forma de pago
                    <Select
                      aria-label="Forma de pago"
                      disabled={Boolean(nativeInvoice) || issue.isPending}
                      onChange={(event) => setPaymentForm(event.target.value)}
                      value={paymentForm}
                    >
                      {controlledPaymentFormOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className={fieldClass}>
                    Método de pago
                    <Select
                      aria-label="Método de pago"
                      disabled={Boolean(nativeInvoice) || issue.isPending}
                      onChange={(event) => {
                        const value = event.target
                          .value as IssueCfdiInput["paymentMethod"];
                        setPaymentMethod(value);
                        if (value === "PPD") setPaymentForm("99");
                        if (value === "PUE" && paymentForm === "99")
                          setPaymentForm("03");
                      }}
                      value={paymentMethod}
                    >
                      <option value="PUE">PUE · Pago en una exhibición</option>
                      <option value="PPD">PPD · Pago diferido</option>
                    </Select>
                  </label>
                  <label className={fieldClass}>
                    Exportación
                    <Select
                      aria-label="Exportación"
                      disabled={Boolean(nativeInvoice) || issue.isPending}
                      onChange={(event) => setExportCode(event.target.value)}
                      value={exportCode}
                    >
                      {exportCodeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {requiresExchangeRate && (
                    <label className={fieldClass}>
                      Tipo de cambio
                      <Input
                        aria-label="Tipo de cambio"
                        disabled={Boolean(nativeInvoice) || issue.isPending}
                        inputMode="decimal"
                        min="0.000001"
                        onChange={(event) => setTipoCambio(event.target.value)}
                        placeholder="Ej. 17.250000"
                        step="0.000001"
                        type="number"
                        value={tipoCambio}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className="grid min-w-[240px] content-start gap-2 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm">
                <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                  Totales autoritativos
                </p>
                <ReadOnlyField
                  label="Subtotal"
                  value={review.totals.subtotal}
                />
                <ReadOnlyField
                  label="Descuento"
                  value={review.totals.discount}
                />
                <ReadOnlyField label="Impuesto" value={review.totals.tax} />
                <ReadOnlyField label="Total CFDI" value={review.totals.total} />
              </div>
            </section>
          </>
        )}

        <ProfileWarning request={request} />
        <StatusNotice
          invoice={nativeInvoice}
          issueError={issue.error}
          status={status}
        />

        {nativeInvoice?.fiscalStatus === "STAMPED" && (
          <section className="grid gap-4 rounded-2xl border border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.06)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--erp-success)]">
              <CheckCircle2 className="h-5 w-5" /> Identidad fiscal recibida
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ReadOnlyField label="UUID" value={nativeInvoice.uuid} />
              <ReadOnlyField
                label="Fecha de emisión"
                value={formatCfdiDate(nativeInvoice.issuedAt)}
              />
              <ReadOnlyField
                label="Fecha de timbrado"
                value={formatCfdiDate(nativeInvoice.stampedAt)}
              />
              <ReadOnlyField
                label="Cancelación"
                value={
                  cancellationLabels[cancellationState] ?? cancellationState
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ArtifactButton
                available={hasArtifact("XML")}
                invoiceId={nativeInvoice.id}
                onDownload={download}
                pending={artifact.isPending && artifactType === "XML"}
                type="XML"
              />
              <ArtifactButton
                available={hasArtifact("PDF")}
                invoiceId={nativeInvoice.id}
                onDownload={download}
                pending={artifact.isPending && artifactType === "PDF"}
                type="PDF"
              />
            </div>
            {artifact.error && (
              <p className="text-sm font-semibold text-[var(--erp-danger)]">
                No se pudo generar la descarga temporal del artefacto fiscal.
              </p>
            )}
          </section>
        )}

        {nativeInvoice?.fiscalStatus === "STAMPED" && (
          <section className="grid gap-4 rounded-2xl border border-[color:var(--erp-border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-[var(--erp-foreground)]">
                <Ban className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" />
                Cancelación fiscal
              </div>
              <Badge
                tone={
                  cancellationState === "CANCELLED"
                    ? "green"
                    : cancellationState === "PENDING"
                      ? "amber"
                      : cancellationState === "REJECTED" ||
                          cancellationState === "ERROR"
                        ? "red"
                        : "slate"
                }
              >
                {cancellationLabels[cancellationState] ?? cancellationState}
              </Badge>
            </div>

            {cancellationState === "PENDING" && (
              <div className="grid gap-1 rounded-xl border border-[rgba(214,155,45,0.35)] bg-[rgba(214,155,45,0.12)] p-3 text-sm text-[var(--erp-brand-gold-deep)]">
                <p className="font-black">Cancelación fiscal pendiente</p>
                <p>
                  El PAC/SAT aún no confirma la operación. No se puede repetir
                  la solicitud desde el navegador.
                </p>
              </div>
            )}
            {cancellationState === "CANCELLED" && (
              <div className="grid gap-2 rounded-xl border border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.06)] p-3 text-sm text-[var(--erp-success)]">
                <p className="font-black">
                  Cancelación confirmada por el PAC/SAT
                </p>
                {replacementUuid && cancellationMotiveFromServer === "01" && (
                  <ReadOnlyField
                    label="UUID sustituto"
                    value={replacementUuid}
                  />
                )}
              </div>
            )}
            {cancellationState === "REJECTED" && (
              <p className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">
                El PAC/SAT rechazó la cancelación. La factura y sus aplicaciones
                comerciales permanecen activas.
              </p>
            )}
            {cancellationState === "ERROR" && (
              <p className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">
                No fue posible confirmar la cancelación. El saldo no se liberó;
                revisa el estado fiscal antes de tomar otra decisión.
                {remoteCancellation?.lastErrorCode && (
                  <span className="mt-1 block text-xs">
                    Código: {remoteCancellation.lastErrorCode}
                  </span>
                )}
              </p>
            )}

            {cancellationState !== "PENDING" &&
              cancellationState !== "CANCELLED" && (
                <div className="grid gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">
                    Solicitar cancelación fiscal
                  </p>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className={fieldClass}>
                      Motivo SAT
                      <Select
                        aria-label="Motivo SAT"
                        disabled={cancel.isPending}
                        onChange={(event) =>
                          setCancellationMotive(
                            event.target.value as FiscalCancellationMotive,
                          )
                        }
                        value={cancellationMotive}
                      >
                        {cancellationMotiveOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className={fieldClass}>
                      Motivo interno
                      <Input
                        aria-label="Motivo interno"
                        disabled={cancel.isPending}
                        maxLength={500}
                        onChange={(event) =>
                          setInternalReason(event.target.value)
                        }
                        placeholder="Describe la razón operativa"
                        value={internalReason}
                      />
                    </label>
                    {cancellationMotive === "01" && (
                      <label className={fieldClass}>
                        ID de factura sustituta
                        <Input
                          aria-label="ID de factura sustituta"
                          disabled={cancel.isPending}
                          name="replacementInvoiceId"
                          onChange={(event) =>
                            setReplacementInvoiceId(event.target.value)
                          }
                          placeholder="El backend resolverá el UUID"
                          value={replacementInvoiceId}
                        />
                      </label>
                    )}
                  </div>
                  {cancellationMotive === "01" && (
                    <p className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
                      El UUID sustituto será validado y resuelto por el backend;
                      nunca se captura como dato del proveedor.
                    </p>
                  )}
                  {cancellationError && (
                    <p
                      className="text-sm font-semibold text-[var(--erp-danger)]"
                      role="alert"
                    >
                      {cancellationError}
                    </p>
                  )}
                  <Button
                    aria-busy={cancel.isPending}
                    disabled={!canCancel || cancel.isPending}
                    onClick={submitCancellation}
                  >
                    {cancel.isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                    {cancel.isPending
                      ? "Solicitando cancelación"
                      : "Solicitar cancelación"}
                  </Button>
                </div>
              )}

            <Button
              aria-label="Actualizar estado fiscal"
              disabled={cancellationStatus.isFetching}
              onClick={refreshCancellationStatus}
              size="sm"
              variant="outline"
            >
              {cancellationStatus.isFetching ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Actualizar estado fiscal
            </Button>
            {cancellationStatus.error && (
              <p
                className="text-sm font-semibold text-[var(--erp-danger)]"
                role="alert"
              >
                No se pudo consultar el estado fiscal; la última respuesta
                persistida sigue siendo la fuente de verdad.
              </p>
            )}
          </section>
        )}

        {nativeInvoice?.fiscalStatus === "STAMPED" &&
        nativeInvoice.status !== "CANCELLED" &&
        nativeInvoice.cancellationStatus !== "ACCEPTED" &&
        nativeInvoice.concepts?.length ? (
          <CreditAdjustmentPanel invoice={nativeInvoice} role={role} />
        ) : null}

        {status === "STAMP_UNKNOWN" && (
          <p className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
            Usa la consulta de estado fiscal para reconciliar la operación; el
            saldo reservado permanece protegido contra un segundo CFDI.
          </p>
        )}

        {!nativeInvoice && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs text-[var(--erp-muted-foreground)]">
              UUID, TFD, sellos, certificados y totales no son editables desde
              esta pantalla. Serán recibidos y persistidos únicamente por el
              backend después de la respuesta del PAC.
            </p>
            <Button
              aria-busy={issue.isPending}
              disabled={!canIssue || issue.isPending}
              onClick={submit}
            >
              {issue.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="h-4 w-4" />
              )}
              {issue.isPending ? "Timbrando CFDI" : "Emitir CFDI"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
