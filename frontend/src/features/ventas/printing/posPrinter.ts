import type { SaleDocumentType, TicketData } from "../types";

export const PosPrinter = {
  BROWSER: "BROWSER",
  LOCAL_AGENT: "LOCAL_AGENT",
} as const;

export type PosPrinter = (typeof PosPrinter)[keyof typeof PosPrinter];

export const PosPrinterStatus = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  AVAILABLE: "AVAILABLE",
  OFFLINE: "OFFLINE",
} as const;

export type PosPrinterStatus =
  (typeof PosPrinterStatus)[keyof typeof PosPrinterStatus];

export const DEFAULT_PRINTER_PROFILE = "default";
export const DEFAULT_PRINT_TEMPLATE_VERSION = 1;

const saleDocumentTypes = [
  "SCALE_TICKET",
  "SIMPLE_NOTE",
  "LARGE_NOTE",
  "INTERNAL_RECEIPT",
] as const satisfies readonly SaleDocumentType[];

type PrintJobValue = number | string | null;

export type PrintJobItem = Readonly<{
  productName: string | null;
  sku: string | null;
  unit: string | null;
  quantityKg: PrintJobValue;
  quantityPieces: PrintJobValue;
  unitPrice: PrintJobValue;
  subtotal: PrintJobValue;
  discount: PrintJobValue;
  taxableBase: PrintJobValue;
  tax: PrintJobValue;
  total: PrintJobValue;
}>;

export type PrintJobPayment = Readonly<{
  amount: PrintJobValue;
  paymentMethod: string | null;
  cashTendered: PrintJobValue;
  changeGiven: PrintJobValue;
  paidAt: string | null;
}>;

export type PrintJobScaleTicket = Readonly<{
  physicalFolio: string | null;
  capturedAt: string | null;
  productName: string | null;
  productUnit: string | null;
  grossWeightKg: PrintJobValue;
  tareWeightKg: PrintJobValue;
  netWeightKg: PrintJobValue;
  pieceCount: PrintJobValue;
  unitPrice: PrintJobValue;
  amount: PrintJobValue;
  operatorName: string | null;
}>;

/**
 * Whitelisted, renderer-neutral document data for a future local agent.
 * It intentionally has no HTML, authorization data, or arbitrary metadata.
 */
export type PrintJobPayload = Readonly<{
  ticketNumber: string | null;
  saleNumber: string | null;
  createdAt: string | null;
  documentType: SaleDocumentType;
  physicalFolio: string | null;
  requiresAdministrativeInvoice: boolean;
  templateVersion: number;
  sellerName: string | null;
  customerName: string | null;
  customerCommercialName: string | null;
  customerNumber: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxId: string | null;
  customerCreditDays: number | null;
  locationId: string | null;
  locationName: string | null;
  items: readonly PrintJobItem[];
  subtotal: PrintJobValue;
  discount: PrintJobValue;
  tax: PrintJobValue;
  total: PrintJobValue;
  paid: PrintJobValue;
  outstanding: PrintJobValue;
  dueDate: string | null;
  paymentMethod: string | null;
  paymentType: string | null;
  collectionStatus: string | null;
  status: string | null;
  payments: readonly PrintJobPayment[];
  scaleTicket: PrintJobScaleTicket | null;
  legend: string | null;
}>;

export type PrintJob = Readonly<{
  jobId: string;
  documentId: string;
  documentType: SaleDocumentType;
  templateVersion: number;
  printerProfile: string;
  payload: PrintJobPayload;
}>;

export type PosPrinterErrorCode =
  | "PRINT_JOB_DOCUMENT_ID_REQUIRED"
  | "PRINT_JOB_DOCUMENT_TYPE_REQUIRED"
  | "PRINT_JOB_DOCUMENT_TYPE_INVALID"
  | "PRINT_JOB_TEMPLATE_VERSION_INVALID"
  | "PRINT_JOB_PRINTER_PROFILE_INVALID"
  | "BROWSER_PRINT_UNAVAILABLE"
  | "PRINT_FAILED";

export class PosPrinterError extends Error {
  readonly code: PosPrinterErrorCode;
  readonly cause?: unknown;

  constructor(code: PosPrinterErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PosPrinterError";
    this.code = code;
    this.cause = cause;
  }
}

export type PrintResult = Readonly<{
  requestedPrinter: PosPrinter;
  actualPrinter: PosPrinter;
  usedFallback: boolean;
  fallbackReason?: "LOCAL_AGENT_PRINT_FAILED";
}>;

export type PosPrinterAdapter = Readonly<{
  kind: PosPrinter;
  getStatus: () => Promise<PosPrinterStatus>;
  print: (job: PrintJob) => Promise<PrintResult>;
}>;

export type LocalAgentPort = Readonly<{
  getStatus: () => Promise<Exclude<PosPrinterStatus, "NOT_CONFIGURED">>;
  print: (job: PrintJob) => Promise<void>;
}>;

export type PosPrinterDependencies = Readonly<{
  localAgent?: LocalAgentPort;
  browserPrint?: () => void;
}>;

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function isSaleDocumentType(value: unknown): value is SaleDocumentType {
  return (
    typeof value === "string" &&
    (saleDocumentTypes as readonly string[]).includes(value)
  );
}

function createJobId() {
  if (globalThis.crypto?.randomUUID)
    return `pos-print-${globalThis.crypto.randomUUID()}`;
  return `pos-print-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePrintPayload(
  document: TicketData,
  templateVersion: number,
  documentType: SaleDocumentType,
): PrintJobPayload {
  return {
    ticketNumber: nullable(document.ticketNumber),
    saleNumber: nullable(document.saleNumber),
    createdAt: nullable(document.createdAt),
    documentType,
    physicalFolio: nullable(document.physicalFolio),
    requiresAdministrativeInvoice:
      document.requiresAdministrativeInvoice === true,
    templateVersion,
    sellerName: nullable(document.sellerName),
    customerName: nullable(document.customerName),
    customerCommercialName: nullable(document.customerCommercialName),
    customerNumber: nullable(document.customerNumber),
    customerAddress: nullable(document.customerAddress),
    customerPhone: nullable(document.customerPhone),
    customerTaxId: nullable(document.customerTaxId),
    customerCreditDays: nullable(document.customerCreditDays),
    locationId: nullable(document.locationId),
    locationName: nullable(document.locationName),
    items: (document.items ?? []).map((item) => ({
      productName: nullable(item.productName ?? item.product),
      sku: nullable(item.sku),
      unit: nullable(item.unit),
      quantityKg: nullable(item.quantityKg ?? item.kilos),
      quantityPieces: nullable(item.quantityPieces ?? item.pieces),
      unitPrice: nullable(item.unitPrice),
      subtotal: nullable(item.subtotal),
      discount: nullable(item.discount),
      taxableBase: nullable(item.taxableBase),
      tax: nullable(item.tax),
      total: nullable(item.total),
    })),
    subtotal: nullable(document.subtotal),
    discount: nullable(document.discount),
    tax: nullable(document.tax),
    total: nullable(document.total),
    paid: nullable(document.paid),
    outstanding: nullable(document.outstanding),
    dueDate: nullable(document.dueDate),
    paymentMethod: nullable(document.paymentMethod),
    paymentType: nullable(document.paymentType),
    collectionStatus: nullable(document.collectionStatus),
    status: nullable(document.status),
    payments: (document.payments ?? []).map((payment) => ({
      amount: nullable(payment.amount),
      paymentMethod: nullable(payment.paymentMethod),
      cashTendered: nullable(payment.cashTendered),
      changeGiven: nullable(payment.changeGiven),
      paidAt: nullable(payment.paidAt),
    })),
    scaleTicket: document.scaleTicket
      ? {
          physicalFolio: nullable(document.scaleTicket.physicalFolio),
          capturedAt: nullable(document.scaleTicket.capturedAt),
          productName: nullable(document.scaleTicket.productName),
          productUnit: nullable(document.scaleTicket.productUnit),
          grossWeightKg: nullable(document.scaleTicket.grossWeightKg),
          tareWeightKg: nullable(document.scaleTicket.tareWeightKg),
          netWeightKg: nullable(document.scaleTicket.netWeightKg),
          pieceCount: nullable(document.scaleTicket.pieceCount),
          unitPrice: nullable(document.scaleTicket.unitPrice),
          amount: nullable(document.scaleTicket.amount),
          operatorName: nullable(document.scaleTicket.operatorName),
        }
      : null,
    legend: nullable(document.legend),
  };
}

export function createPrintJob(
  document: TicketData,
  options: {
    documentId?: string | null;
    jobId?: string;
    printerProfile?: string;
  } = {},
): PrintJob {
  const documentId = (options.documentId ?? document.ticketId)?.trim();
  if (!documentId) {
    throw new PosPrinterError(
      "PRINT_JOB_DOCUMENT_ID_REQUIRED",
      "A print job requires the exact SaleDocument identifier.",
    );
  }

  if (!document.documentType) {
    throw new PosPrinterError(
      "PRINT_JOB_DOCUMENT_TYPE_REQUIRED",
      "A print job requires a SaleDocument type.",
    );
  }

  if (!isSaleDocumentType(document.documentType)) {
    throw new PosPrinterError(
      "PRINT_JOB_DOCUMENT_TYPE_INVALID",
      "The print job document type is not supported.",
    );
  }

  const templateVersion =
    document.templateVersion ?? DEFAULT_PRINT_TEMPLATE_VERSION;
  if (!Number.isInteger(templateVersion) || templateVersion < 1) {
    throw new PosPrinterError(
      "PRINT_JOB_TEMPLATE_VERSION_INVALID",
      "The print job template version must be a positive integer.",
    );
  }

  const printerProfile =
    options.printerProfile === undefined
      ? DEFAULT_PRINTER_PROFILE
      : options.printerProfile.trim();
  if (!printerProfile) {
    throw new PosPrinterError(
      "PRINT_JOB_PRINTER_PROFILE_INVALID",
      "The print job printer profile cannot be empty.",
    );
  }

  const jobId = options.jobId?.trim() || createJobId();
  return {
    jobId,
    documentId,
    documentType: document.documentType,
    templateVersion,
    printerProfile,
    payload: normalizePrintPayload(
      document,
      templateVersion,
      document.documentType,
    ),
  };
}

export function requestBrowserPrint(): void {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    throw new PosPrinterError(
      "BROWSER_PRINT_UNAVAILABLE",
      "Browser printing is unavailable in this environment.",
    );
  }
  window.print();
}

export function createBrowserPosPrinter(
  browserPrint: () => void = requestBrowserPrint,
): PosPrinterAdapter {
  return {
    kind: PosPrinter.BROWSER,
    getStatus: async () => PosPrinterStatus.NOT_CONFIGURED,
    print: async () => {
      browserPrint();
      return {
        requestedPrinter: PosPrinter.BROWSER,
        actualPrinter: PosPrinter.BROWSER,
        usedFallback: false,
      };
    },
  };
}

export function createLocalAgentPosPrinter(
  localAgent: LocalAgentPort,
): PosPrinterAdapter {
  return {
    kind: PosPrinter.LOCAL_AGENT,
    getStatus: async () => {
      try {
        const status = await localAgent.getStatus();
        return status === PosPrinterStatus.AVAILABLE
          ? PosPrinterStatus.AVAILABLE
          : PosPrinterStatus.OFFLINE;
      } catch {
        return PosPrinterStatus.OFFLINE;
      }
    },
    print: async (job) => {
      await localAgent.print(job);
      return {
        requestedPrinter: PosPrinter.LOCAL_AGENT,
        actualPrinter: PosPrinter.LOCAL_AGENT,
        usedFallback: false,
      };
    },
  };
}

export function createPosPrinterRuntime(
  dependencies: PosPrinterDependencies = {},
): PosPrinterAdapter {
  const browserPrinter = createBrowserPosPrinter(dependencies.browserPrint);
  if (!dependencies.localAgent) return browserPrinter;

  const localPrinter = createLocalAgentPosPrinter(dependencies.localAgent);
  return {
    kind: PosPrinter.LOCAL_AGENT,
    getStatus: localPrinter.getStatus,
    print: async (job) => {
      try {
        return await localPrinter.print(job);
      } catch (localAgentError) {
        try {
          await browserPrinter.print(job);
          return {
            requestedPrinter: PosPrinter.LOCAL_AGENT,
            actualPrinter: PosPrinter.BROWSER,
            usedFallback: true,
            fallbackReason: "LOCAL_AGENT_PRINT_FAILED",
          };
        } catch (browserError) {
          throw new PosPrinterError(
            "PRINT_FAILED",
            "The local agent and browser print paths both failed.",
            browserError ?? localAgentError,
          );
        }
      }
    },
  };
}

export function posPrinterStatusLabel(status: PosPrinterStatus): string {
  if (status === PosPrinterStatus.AVAILABLE) return "Impresora disponible";
  if (status === PosPrinterStatus.OFFLINE) return "Impresora sin conexión";
  return "Impresora no configurada";
}
