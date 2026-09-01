import { ApiClientError } from "@/lib/api";
import { SAT_CFDI_USES } from "../../../../shared/fiscal-catalog";
import type { SatCatalog } from "./types";

export type CfdiFiscalStatus =
  | "LEGACY"
  | "DRAFT"
  | "READY"
  | "STAMPING"
  | "STAMP_UNKNOWN"
  | "STAMPED"
  | "STAMP_ERROR";

export const cfdiUseOptions = SAT_CFDI_USES.map(({ code, label }) => ({
  value: code,
  label: `${code} · ${label}`,
}));

/**
 * The API catalog is authoritative when an active version is configured. The
 * existing controlled snapshot remains a compatibility fallback while an
 * environment is waiting for its first reviewed SAT import; it is never a
 * free-text input and cannot bypass backend validation.
 */
export function satCatalogOptions(
  catalog: SatCatalog | undefined,
  fallback: ReadonlyArray<{ value: string; label: string }>,
) {
  if (!catalog?.configured) return fallback;
  return catalog.entries.map((entry) => ({
    value: entry.code,
    label: `${entry.code} · ${entry.description}`,
  }));
}

export const paymentFormOptions = [
  { value: "01", label: "01 · Efectivo" },
  { value: "02", label: "02 · Cheque nominativo" },
  { value: "03", label: "03 · Transferencia electrónica" },
  { value: "04", label: "04 · Tarjeta de crédito" },
  { value: "28", label: "28 · Tarjeta de débito" },
  { value: "99", label: "99 · Por definir" },
] as const;

export const exportCodeOptions = [
  { value: "01", label: "01 · No aplica" },
  { value: "02", label: "02 · Definitiva" },
  { value: "03", label: "03 · Temporal" },
  { value: "04", label: "04 · Definitiva con enajenación" },
] as const;

const statusLabels: Record<CfdiFiscalStatus, string> = {
  LEGACY: "Factura legacy",
  DRAFT: "Borrador fiscal",
  READY: "Lista para timbrar",
  STAMPING: "Timbrando CFDI",
  STAMP_UNKNOWN: "Timbrado indeterminado",
  STAMPED: "CFDI timbrado",
  STAMP_ERROR: "Error de timbrado",
};

export function normalizeCfdiFiscalStatus(
  value?: string | null,
): CfdiFiscalStatus {
  switch (value) {
    case "UNKNOWN":
      return "STAMP_UNKNOWN";
    case "FAILED":
      return "STAMP_ERROR";
    case "LEGACY":
    case "DRAFT":
    case "READY":
    case "STAMPING":
    case "STAMPED":
      return value;
    default:
      return "READY";
  }
}

export function cfdiFiscalStatusLabel(status: CfdiFiscalStatus) {
  return statusLabels[status];
}

export function cfdiFiscalStatusTone(
  status: CfdiFiscalStatus,
): "amber" | "blue" | "green" | "red" | "slate" {
  if (status === "STAMPED") return "green";
  if (status === "STAMP_UNKNOWN" || status === "READY") return "amber";
  if (status === "STAMPING") return "blue";
  if (status === "STAMP_ERROR") return "red";
  return "slate";
}

function errorCode(error: unknown): string | null {
  if (error instanceof ApiClientError) {
    if (typeof error.payload === "object" && error.payload !== null) {
      const payload = error.payload as { code?: unknown; message?: unknown };
      if (typeof payload.code === "string") return payload.code;
      if (typeof payload.message === "string") return payload.message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : null;
}

const issueErrorMessages: Record<string, string> = {
  MISSING_FISCAL_PROFILE:
    "Completa el perfil fiscal del emisor y del receptor antes de timbrar.",
  MISSING_PRODUCT_FISCAL_PROFILE: "Completa el perfil fiscal de los conceptos.",
  INVALID_CFDI_USE: "Selecciona un UsoCFDI válido del catálogo SAT.",
  CFDI_USE_REGIME_INCOMPATIBLE:
    "El Uso CFDI seleccionado no es compatible con el régimen fiscal del receptor.",
  INVALID_PAYMENT_CONFIGURATION:
    "La FormaPago y el MetodoPago no son compatibles para este CFDI.",
  TOTAL_MISMATCH:
    "Los importes de la solicitud no coinciden con los conceptos autoritativos.",
  OVER_INVOICED: "La solicitud supera el saldo disponible para facturar.",
  BILLING_REQUEST_NOT_APPROVED:
    "Solo una solicitud aprobada puede iniciar la emisión CFDI.",
  VERSION_CONFLICT:
    "La solicitud cambió; actualiza la revisión antes de intentar de nuevo.",
  IDEMPOTENCY_CONFLICT:
    "La clave de idempotencia ya se usó con otra decisión fiscal.",
  CFDI_OPERATION_ALREADY_EXISTS:
    "La solicitud ya tiene una operación fiscal reservada.",
  FISCAL_PROVIDER_CONFIGURATION:
    "El proveedor fiscal no está disponible para esta operación.",
  FISCAL_PROVIDER_AUTHENTICATION:
    "El proveedor fiscal rechazó la autenticación; solicita revisión administrativa.",
  FISCAL_PROVIDER_VALIDATION:
    "El PAC rechazó la información fiscal; corrige los datos señalados.",
  FISCAL_PROVIDER_TIMEOUT:
    "El PAC no respondió a tiempo. Consulta el estado antes de volver a intentar.",
  SAT_CATALOG_NOT_CONFIGURED:
    "El catálogo SAT requerido aún no está configurado; solicita una importación aprobada.",
  SAT_CATALOG_CODE_NOT_FOUND:
    "Uno de los códigos fiscales no pertenece a la versión SAT activa.",
  GLOBAL_INVOICE_INFORMATION_REQUIRED:
    "El RFC genérico nacional solo puede emitirse como factura global explícita.",
  GLOBAL_INVOICE_RECEIVER_INVALID:
    "La factura global requiere Público en General, régimen 616 y el código postal del emisor.",
  GLOBAL_INVOICE_PAYMENT_INVALID:
    "La factura global requiere el método de pago PUE.",
  GLOBAL_INVOICE_EXPORTATION_INVALID:
    "La factura global requiere Exportación 01.",
  GLOBAL_INVOICE_PERIOD_INVALID:
    "La periodicidad, mes o año no coincide con las operaciones seleccionadas.",
};

export function getCfdiIssueErrorDetails(error: unknown): string[] {
  const code = errorCode(error);
  if (!code) return ["No fue posible iniciar la emisión CFDI."];
  return [
    issueErrorMessages[code] ??
      (code.includes("STAMP")
        ? "La emisión CFDI no pudo completarse; revisa el estado fiscal."
        : code),
  ];
}

export function formatCfdiDate(value?: string | null) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export function fiscalValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "")
    return "No disponible";
  return String(value);
}

export function fieldLabel(value: string) {
  const labels: Record<string, string> = {
    fiscalName: "razón social fiscal",
    taxId: "RFC",
    fiscalPostalCode: "código postal fiscal",
    fiscalRegime: "régimen fiscal",
    fiscalUseCode: "UsoCFDI",
    billingEmail: "correo de facturación",
    defaultSeries: "serie fiscal",
    certificateSerialNumber: "certificado CSD",
    certificateFingerprint: "huella del certificado",
    satProductServiceCode: "ClaveProdServ",
    satUnitCode: "ClaveUnidad",
    taxObjectCode: "ObjetoImp",
    defaultTaxCode: "impuesto SAT",
    defaultFactorType: "tipo de factor",
    defaultRateOrQuota: "tasa o cuota",
  };
  return labels[value] ?? value;
}
