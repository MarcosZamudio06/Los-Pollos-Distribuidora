// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { InvoiceReconciliationPanel } from "../InvoiceReconciliationPanel";
import { billingRequestsService } from "../billingRequestsService";
import {
  cfdiFiscalStatusLabel,
  getCfdiIssueErrorDetails,
  normalizeCfdiFiscalStatus,
} from "../cfdiReview";
import type { BillingRequestDetail } from "../types";

const mockState = vi.hoisted(() => ({
  issue: {
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
  },
  artifact: {
    isPending: false,
    error: null as unknown,
    mutateAsync: vi.fn(),
  },
  cancel: {
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
  },
  cancellationStatus: {
    data: undefined as unknown,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  catalog: {
    data: undefined as unknown,
  },
  createCredit: {
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
  },
  approveCredit: {
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
  },
  issueCredit: {
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
  },
}));

vi.mock("../hooks", () => ({
  useIssueBillingCfdi: () => mockState.issue,
  useFiscalArtifactDownload: () => mockState.artifact,
  useCancelInvoice: () => mockState.cancel,
  useCancellationStatus: () => mockState.cancellationStatus,
  useSatCatalog: () => mockState.catalog,
  useCreateCreditAdjustment: () => mockState.createCredit,
  useApproveCreditAdjustment: () => mockState.approveCredit,
  useIssueCreditAdjustment: () => mockState.issueCredit,
}));

const review = {
  currencyCode: "MXN",
  issuer: {
    id: "issuer-1",
    legalName: "Distribuidora Fiscal, S.A. de C.V.",
    taxId: "DIS010101AB1",
    fiscalPostalCode: "64000",
    fiscalRegime: "601",
    cfdiEnabled: true,
    isActive: true,
    defaultSeries: "A",
    certificateSerialNumber: "30001000000500003416",
    certificateFingerprint: "a".repeat(64),
    certificateValidFrom: "2026-01-01T00:00:00.000Z",
    certificateValidTo: "2027-01-01T00:00:00.000Z",
  },
  receiver: {
    id: "customer-1",
    fiscalName: "Cliente Fiscal, S.A. de C.V.",
    taxId: "CLI010101AB1",
    fiscalAddress: "Av. Fiscal 1",
    fiscalPostalCode: "91700",
    fiscalRegime: "601",
    fiscalUseCode: "G03",
    billingEmail: "facturacion@example.test",
  },
  concepts: [
    {
      saleItemId: "sale-item-1",
      productId: "product-1",
      description: "Pollo entero",
      sku: "POL-001",
      quantity: "10.000000",
      operationalUnit: "KG",
      productServiceCode: "50111500",
      unitCode: "KGM",
      taxObjectCode: "02",
      taxCode: "002",
      factorType: "Tasa",
      rateOrQuota: "0.160000",
      unitValue: "10.000000",
      amount: "100.00",
      discount: "0.00",
      taxableBase: "100.00",
      tax: "16.00",
      total: "116.00",
    },
  ],
  totals: {
    subtotal: "100.00",
    discount: "0.00",
    taxableBase: "100.00",
    tax: "16.00",
    total: "116.00",
  },
  profile: {
    complete: true,
    issuerMissingFields: [],
    receiverMissingFields: [],
    conceptIssues: [],
  },
} as const;

function request(
  overrides: Partial<BillingRequestDetail> = {},
): BillingRequestDetail {
  return {
    id: "request-1",
    customerId: "customer-1",
    customerName: "Cliente Fiscal",
    saleId: "sale-1",
    saleNumber: "V-1001",
    requestedByUserId: "user-1",
    status: "APPROVED",
    version: 4,
    requestedAt: "2026-08-23T12:00:00.000Z",
    createdAt: "2026-08-23T12:00:00.000Z",
    updatedAt: "2026-08-23T12:00:00.000Z",
    sale: {
      id: "sale-1",
      legalEntityId: "issuer-1",
      currencyCode: "MXN",
    },
    cfdiReview: review,
    ...overrides,
  };
}

describe("native CFDI issue UI", () => {
  beforeEach(() => {
    mockState.issue = {
      isPending: false,
      error: null,
      data: undefined,
      mutateAsync: vi.fn(),
    };
    mockState.artifact = {
      isPending: false,
      error: null,
      mutateAsync: vi.fn(),
    };
    mockState.cancel = {
      isPending: false,
      error: null,
      data: undefined,
      mutateAsync: vi.fn(),
    };
    mockState.cancellationStatus = {
      data: undefined,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    };
    mockState.catalog = { data: undefined };
    mockState.createCredit = {
      isPending: false,
      error: null,
      data: undefined,
      mutateAsync: vi.fn(),
    };
    mockState.approveCredit = {
      isPending: false,
      error: null,
      data: undefined,
      mutateAsync: vi.fn(),
    };
    mockState.issueCredit = {
      isPending: false,
      error: null,
      data: undefined,
      mutateAsync: vi.fn(),
    };
  });

  it("renders a fiscal review from backend snapshots and never renders server-owned inputs", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel request={request()} role="BILLING" />,
    );

    expect(html).toContain("Revisión fiscal CFDI 4.0");
    expect(html).toContain("Emitir CFDI");
    expect(html).toContain("DIS010101AB1");
    expect(html).toContain("CLI010101AB1");
    expect(html).toContain("50111500");
    expect(html).toContain("KGM");
    expect(html).toContain("ObjetoImp");
    expect(html).toContain("Forma de pago");
    expect(html).toContain("Tipo de factura");
    expect(html).toContain("Global · Público en general");
    expect(html).toContain("Método de pago");
    expect(html).toContain("116.00");
    expect(html).not.toContain("Conciliación de factura externa");
    expect(html).not.toMatch(/name="uuid"/i);
    expect(html).not.toMatch(/name="cfdiSeal"/i);
    expect(html).not.toMatch(/name="total"/i);
  });

  it("does not render the issuance surface outside the fiscal RBAC roles", () => {
    expect(
      renderToStaticMarkup(
        <InvoiceReconciliationPanel request={request()} role="SELLER" />,
      ),
    ).toBe("");
  });

  it("keeps an indeterminate PAC result visible as STAMP_UNKNOWN", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            series: "A",
            folio: "7",
            fiscalStatus: "UNKNOWN",
            cancellationStatus: "NOT_REQUESTED",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
            lastFiscalErrorCode: "FISCAL_PROVIDER_TIMEOUT",
          },
        })}
        role="ADMIN"
      />,
    );

    expect(html).toContain("Timbrado indeterminado");
    expect(html).toContain("STAMP_UNKNOWN");
    expect(html).not.toContain("Error de timbrado");
    expect(html).toContain("No se volverá a timbrar automáticamente");
  });

  it("shows stamped identity, cancellation and artifact actions", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            issuedAt: "2026-08-23T18:00:00.000Z",
            stampedAt: "2026-08-23T18:00:00.000Z",
            fiscalStatus: "STAMPED",
            cancellationStatus: "NOT_REQUESTED",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
            fiscalArtifacts: [
              {
                id: "artifact-xml",
                type: "XML",
                status: "AVAILABLE",
                version: 1,
                mimeType: "application/xml",
              },
              {
                id: "artifact-pdf",
                type: "PDF",
                status: "AVAILABLE",
                version: 1,
                mimeType: "application/pdf",
              },
            ],
          },
        })}
        role="BILLING"
      />,
    );

    expect(html).toContain("A8098C1A-F86E-11DA-BD1A-00112444BE1E");
    expect(html).toContain("Descargar XML");
    expect(html).toContain("Descargar PDF");
    expect(html).toContain("No solicitada");
  });

  it("offers an explicit authorized credit-note workflow without inventory side effects", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            version: 8,
            status: "ACTIVE",
            fiscalStatus: "STAMPED",
            cancellationStatus: "NOT_REQUESTED",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
            concepts: [
              {
                id: "concept-1",
                lineNumber: 1,
                description: "Pollo entero",
                productServiceCode: "50111500",
                unitCode: "KGM",
                taxObjectCode: "02",
                amount: "100.00",
                discount: "0.00",
                taxAmount: "16.00",
                total: "116.00",
              },
            ],
          },
        })}
        role="BILLING"
      />,
    );

    expect(html).toContain("Nota de crédito CFDI E");
    expect(html).toContain("Pollo entero");
    expect(html).toContain("Crear operación de crédito");
    expect(html).toContain("No modifica inventario");
    expect(html).not.toMatch(/name="uuid"/i);
    expect(html).not.toMatch(/name="relationshipTypeCode"/i);
  });

  it("disables the CTA while stamping to prevent duplicate submit", () => {
    mockState.issue.isPending = true;
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel request={request()} role="BILLING" />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("Timbrando CFDI");
  });

  it("renders SAT cancellation controls only for a stamped invoice", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            version: 8,
            status: "ACTIVE",
            fiscalStatus: "STAMPED",
            cancellationStatus: "NOT_REQUESTED",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
          },
        })}
        role="BILLING"
      />,
    );

    expect(html).toContain("Solicitar cancelación fiscal");
    expect(html).toContain("Motivo SAT");
    expect(html).toContain("Motivo interno");
    expect(html).not.toContain("UUID sustituto");
  });

  it("shows the replacement selector only for motive 01 and never allows a provider UUID input", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            version: 8,
            status: "ACTIVE",
            fiscalStatus: "STAMPED",
            cancellationStatus: "NOT_REQUESTED",
            cancellationMotiveCode: "01",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
          },
        })}
        role="BILLING"
      />,
    );

    expect(html).toContain("UUID sustituto");
    expect(html).toContain("ID de factura sustituta");
    expect(html).not.toMatch(/name="replacementUuid"/i);
  });

  it("does not render a repeat-cancellation form while the fiscal request is pending", () => {
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            version: 8,
            status: "ACTIVE",
            fiscalStatus: "STAMPED",
            cancellationStatus: "PENDING",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
          },
        })}
        role="ADMIN"
      />,
    );

    expect(html).toContain("Cancelación fiscal pendiente");
    expect(html).not.toContain("Solicitar cancelación fiscal");
    expect(html).toContain("Actualizar estado fiscal");
  });

  it("keeps a failed status refresh visible instead of hiding it as a generic error", () => {
    mockState.cancellationStatus.error = new Error("status unavailable");
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel
        request={request({
          nativeInvoice: {
            id: "invoice-1",
            uuid: "A8098C1A-F86E-11DA-BD1A-00112444BE1E",
            series: "A",
            folio: "7",
            version: 8,
            status: "ACTIVE",
            fiscalStatus: "STAMPED",
            cancellationStatus: "PENDING",
            subtotal: "100.00",
            discount: "0.00",
            tax: "16.00",
            total: "116.00",
          },
        })}
        role="ADMIN"
      />,
    );

    expect(html).toContain("No se pudo consultar el estado fiscal");
    expect(html).toContain(
      "la última respuesta persistida sigue siendo la fuente de verdad",
    );
  });

  it("presents backend validation failures separately from PAC errors", () => {
    mockState.issue.error = new ApiClientError("TOTAL_MISMATCH", 422, {
      message: "TOTAL_MISMATCH",
    });
    const html = renderToStaticMarkup(
      <InvoiceReconciliationPanel request={request()} role="BILLING" />,
    );

    expect(html).toContain("Validación fiscal");
    expect(html).toContain(
      "Los importes de la solicitud no coinciden con los conceptos autoritativos.",
    );
    expect(html).not.toContain("Error de timbrado");
  });

  it("maps stable backend errors to actionable review messages", () => {
    expect(
      getCfdiIssueErrorDetails(
        new ApiClientError("MISSING_PRODUCT_FISCAL_PROFILE", 422, {
          message: "MISSING_PRODUCT_FISCAL_PROFILE",
        }),
      ),
    ).toContain("Completa el perfil fiscal de los conceptos.");
    expect(
      getCfdiIssueErrorDetails(
        new ApiClientError("VERSION_CONFLICT", 409, {
          message: "VERSION_CONFLICT",
        }),
      ),
    ).toContain(
      "La solicitud cambió; actualiza la revisión antes de intentar de nuevo.",
    );
    expect(
      getCfdiIssueErrorDetails(
        new ApiClientError("CFDI_USE_REGIME_INCOMPATIBLE", 422, {
          code: "CFDI_USE_REGIME_INCOMPATIBLE",
          message: "CFDI_USE_REGIME_INCOMPATIBLE",
        }),
      ),
    ).toContain(
      "El Uso CFDI seleccionado no es compatible con el régimen fiscal del receptor.",
    );
  });

  it("keeps the issuance contract server-owned and sends the idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            billingRequestId: "request-1",
            invoiceId: "invoice-1",
            attemptId: "attempt-1",
            fiscalStatus: "STAMPING",
            operationStatus: "PROCESSING",
            uuid: null,
            replayed: false,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await billingRequestsService.issueCfdi(
      "request-1",
      {
        expectedVersion: 4,
        cfdiUse: "G03",
        paymentMethod: "PUE",
        paymentForm: "03",
        exportCode: "01",
      },
      "access-token",
      "issue-key-1",
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(new Headers(options?.headers).get("idempotency-key")).toBe(
      "issue-key-1",
    );
    expect(options?.body).toBe(
      JSON.stringify({
        expectedVersion: 4,
        cfdiUse: "G03",
        paymentMethod: "PUE",
        paymentForm: "03",
        exportCode: "01",
      }),
    );
    expect(options?.body).not.toContain("uuid");
    fetchMock.mockRestore();
  });

  it("sends an explicit typed global period without client-owned receiver data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await billingRequestsService.issueCfdi(
      "request-global",
      {
        expectedVersion: 2,
        cfdiUse: "S01",
        paymentMethod: "PUE",
        paymentForm: "01",
        exportCode: "01",
        globalInformation: {
          periodicity: "04",
          months: "08",
          year: 2026,
        },
      },
      "access-token",
      "global-key-1",
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.globalInformation).toEqual({
      periodicity: "04",
      months: "08",
      year: 2026,
    });
    expect(body).not.toHaveProperty("receiver");
    expect(body).not.toHaveProperty("taxId");
    fetchMock.mockRestore();
  });
});

describe("CFDI fiscal status labels", () => {
  it("normalizes backend status names without hiding UNKNOWN", () => {
    expect(normalizeCfdiFiscalStatus("UNKNOWN")).toBe("STAMP_UNKNOWN");
    expect(normalizeCfdiFiscalStatus("FAILED")).toBe("STAMP_ERROR");
    expect(cfdiFiscalStatusLabel("STAMP_UNKNOWN")).toBe(
      "Timbrado indeterminado",
    );
  });
});
