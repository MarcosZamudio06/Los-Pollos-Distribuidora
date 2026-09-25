import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PrinterStatusIndicator } from "./PrinterStatusIndicator";
import {
  createPosPrinterRuntime,
  createPrintJob,
  PosPrinter,
  PosPrinterStatus,
  posPrinterStatusLabel,
  type LocalAgentPort,
} from "./posPrinter";
import type { TicketData } from "../types";

const ticket = {
  ticketId: "doc-1",
  ticketNumber: "T-001",
  saleNumber: "V-001",
  documentType: "SIMPLE_NOTE",
  templateVersion: 3,
  customerName: "Cliente original",
  items: [
    {
      productName: "Pollo entero",
      sku: "POL-001",
      unit: "KG",
      quantityKg: "2.5",
      unitPrice: "100.00",
      subtotal: "250.00",
    },
  ],
  total: "250.00",
  html: "<script>window.alert('secret')</script>",
  authorization: "Bearer should-never-leave-the-erp",
} as unknown as TicketData;

function buildJob() {
  return createPrintJob(ticket, { jobId: "job-1" });
}

describe("pos printer abstraction", () => {
  it("uses browser printing and reports no configured hardware without a local agent", async () => {
    const browserPrint = vi.fn();
    const runtime = createPosPrinterRuntime({ browserPrint });

    expect(runtime.kind).toBe(PosPrinter.BROWSER);
    expect(await runtime.getStatus()).toBe(PosPrinterStatus.NOT_CONFIGURED);

    await expect(runtime.print(buildJob())).resolves.toEqual({
      requestedPrinter: PosPrinter.BROWSER,
      actualPrinter: PosPrinter.BROWSER,
      usedFallback: false,
    });
    expect(browserPrint).toHaveBeenCalledTimes(1);
  });

  it("sends only the normalized print job to a local agent", async () => {
    const localAgent: LocalAgentPort = {
      getStatus: vi.fn().mockResolvedValue(PosPrinterStatus.AVAILABLE),
      print: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = createPosPrinterRuntime({ localAgent });
    const job = buildJob();

    expect(await runtime.getStatus()).toBe(PosPrinterStatus.AVAILABLE);
    await runtime.print(job);

    expect(localAgent.print).toHaveBeenCalledWith(job);
    expect(JSON.stringify(job)).not.toContain("script");
    expect(JSON.stringify(job)).not.toContain("authorization");
    expect(job).toMatchObject({
      jobId: "job-1",
      documentId: "doc-1",
      documentType: "SIMPLE_NOTE",
      templateVersion: 3,
      printerProfile: "default",
      payload: {
        customerName: "Cliente original",
        items: [{ productName: "Pollo entero", quantityKg: "2.5" }],
      },
    });
  });

  it("falls back to the browser when the local agent print fails", async () => {
    const browserPrint = vi.fn();
    const localAgent: LocalAgentPort = {
      getStatus: vi.fn().mockResolvedValue(PosPrinterStatus.OFFLINE),
      print: vi.fn().mockRejectedValue(new Error("agent unavailable")),
    };
    const runtime = createPosPrinterRuntime({ localAgent, browserPrint });

    await expect(runtime.print(buildJob())).resolves.toEqual({
      requestedPrinter: PosPrinter.LOCAL_AGENT,
      actualPrinter: PosPrinter.BROWSER,
      usedFallback: true,
      fallbackReason: "LOCAL_AGENT_PRINT_FAILED",
    });
    expect(browserPrint).toHaveBeenCalledTimes(1);
  });

  it("reports the local agent as offline when its status probe fails", async () => {
    const localAgent: LocalAgentPort = {
      getStatus: vi.fn().mockRejectedValue(new Error("connection refused")),
      print: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = createPosPrinterRuntime({ localAgent });

    await expect(runtime.getStatus()).resolves.toBe(PosPrinterStatus.OFFLINE);
  });

  it("returns a stable error when both print paths fail", async () => {
    const localAgent: LocalAgentPort = {
      getStatus: vi.fn().mockResolvedValue(PosPrinterStatus.OFFLINE),
      print: vi.fn().mockRejectedValue(new Error("agent unavailable")),
    };
    const runtime = createPosPrinterRuntime({
      localAgent,
      browserPrint: () => {
        throw new Error("browser unavailable");
      },
    });

    await expect(runtime.print(buildJob())).rejects.toMatchObject({
      code: "PRINT_FAILED",
    });
  });

  it("rejects jobs without an exact SaleDocument reference or valid type", () => {
    expect(() =>
      createPrintJob({ ...ticket, ticketId: undefined }, { jobId: "job-2" }),
    ).toThrowError(
      expect.objectContaining({ code: "PRINT_JOB_DOCUMENT_ID_REQUIRED" }),
    );
    expect(() =>
      createPrintJob(
        { ...ticket, documentType: "UNKNOWN" },
        { jobId: "job-3" },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "PRINT_JOB_DOCUMENT_TYPE_INVALID" }),
    );
    expect(() =>
      createPrintJob(ticket, { jobId: "job-4", printerProfile: "  " }),
    ).toThrowError(
      expect.objectContaining({ code: "PRINT_JOB_PRINTER_PROFILE_INVALID" }),
    );
  });

  it("keeps the three operational printer status labels explicit", () => {
    expect(posPrinterStatusLabel(PosPrinterStatus.NOT_CONFIGURED)).toBe(
      "Impresora no configurada",
    );
    expect(posPrinterStatusLabel(PosPrinterStatus.AVAILABLE)).toBe(
      "Impresora disponible",
    );
    expect(posPrinterStatusLabel(PosPrinterStatus.OFFLINE)).toBe(
      "Impresora sin conexión",
    );

    const html = renderToStaticMarkup(
      <PrinterStatusIndicator status={PosPrinterStatus.NOT_CONFIGURED} />,
    );
    expect(html).toContain("Impresora no configurada");
  });

  it("uses template version one for provisional sale data when omitted", () => {
    expect(createPrintJob({ ...ticket, templateVersion: undefined })).toMatchObject(
      {
        templateVersion: 1,
        payload: { templateVersion: 1 },
      },
    );
  });
});
