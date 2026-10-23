// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ProductGallery } from "../components/ProductGallery";
import { WorkflowSection } from "../components/WorkflowSection";
import { PRODUCT_MODULES } from "../config/productModules";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  }
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  history.replaceState(null, "", window.location.pathname);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

describe("Visible Operations P0", () => {
  it("ships exactly the optimized capture bytes recorded by the provenance manifest", () => {
    const manifest = ["LANDING-SKILLUI-IMPLEMENTATION-001", "LANDING-SKILLUI-P0-CLOSURE-002"].flatMap(task =>
      JSON.parse(readFileSync(resolve(import.meta.dirname, `../../evidence/${task}/capture-provenance.json`), "utf8")) as { assets: Record<string, { path: string; sha256: string }> }[]);
    expect(manifest).toHaveLength(11);
    for (const capture of manifest) for (const asset of Object.values(capture.assets)) {
      const bytes = readFileSync(resolve(import.meta.dirname, "../../..", asset.path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
  });
  it("leads with the approved operational proposition and a full genuine dashboard", () => {
    const page = new DOMParser().parseFromString(renderToStaticMarkup(<App />), "text/html");
    expect(page.querySelector("h1")?.textContent).toBe("De la venta al cierre. Tu operación, conectada.");
    expect(page.querySelector("#hero-product img")?.getAttribute("src")).toContain("/approved/dashboard.jpg");
    expect(page.querySelector("#hero-product img")?.getAttribute("loading")).toBe("eager");
    expect(page.querySelector("#hero-product")?.textContent).toContain("demostración");
    expect(page.querySelector("#hero-product img")?.getAttribute("src")).not.toContain("confirmation");
  });

  it("puts direct product exploration before the operational story and removes the duplicate platform sequence", () => {
    const page = new DOMParser().parseFromString(renderToStaticMarkup(<App />), "text/html");
    const sections = [...page.querySelectorAll("main > section")].map(section => section.id);
    expect(sections.indexOf("erp-gallery")).toBeLessThan(sections.indexOf("operation"));
    expect(page.querySelector("[data-platform-sequence]")).toBeNull();
    for (const a of page.querySelectorAll('a[href^="#"]')) {
      expect(page.getElementById(a.getAttribute("href")!.slice(1))).not.toBeNull();
    }
  });

  it("keeps every verified category selectable and presents the approved inventory balance capture", async () => {
    const container = await mount(<ProductGallery />);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual([
      "Dashboard", "Punto de venta", "Inventario", "CEDIS", "Compras", "Logística", "Repartidores", "Cobranza", "Cierres", "Facturación",
    ]);
    await act(async () => tabs[2].click());
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("saldos por ubicación");
    const inventoryImage = container.querySelector('[role="tabpanel"] img');
    expect(inventoryImage).toBeTruthy();
    expect(inventoryImage?.getAttribute("src")).toContain("/approved/inventory.jpg");
    expect(container.querySelector('[role="tabpanel"] figcaption')?.textContent).toContain("entorno capturado");
  });

  it("announces the product tab orientation that matches its responsive layout", async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    let compact = false;
    const media = {
      get matches() { return compact; },
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    const container = await mount(<ProductGallery />);
    const tablist = container.querySelector('[role="tablist"]')!;
    expect(tablist.getAttribute("aria-orientation")).toBe("vertical");
    await act(async () => {
      compact = true;
      listeners.forEach(listener => listener({ matches: true, media: media.media } as MediaQueryListEvent));
    });
    expect(tablist.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("describes the route planner and billing form without overstating their evidence", async () => {
    const fleet = PRODUCT_MODULES.find(module => module.id === "fleet")!;
    const billing = PRODUCT_MODULES.find(module => module.id === "billing")!;
    expect(fleet.note.toLowerCase()).toContain("planificador administrativo de rutas");
    expect(fleet.note).toContain("cero paradas cargadas");
    expect(fleet.note).not.toContain("seguimiento en vivo");
    expect(billing.note.toLowerCase()).toContain("formulario administrativo");
    expect(billing.note).not.toContain("Bandeja");

    const gallery = await mount(<ProductGallery />);
    await act(async () => gallery.querySelector<HTMLButtonElement>("#module-tab-fleet")!.click());
    expect(gallery.querySelector("figcaption")?.textContent).toContain("cero paradas cargadas");
    await act(async () => gallery.querySelector<HTMLButtonElement>("#module-tab-billing")!.click());
    expect(gallery.querySelector("figcaption")?.textContent?.toLowerCase()).toContain("formulario administrativo");

    const workflow = await mount(<WorkflowSection />);
    await act(async () => workflow.querySelectorAll<HTMLButtonElement>("ol button")[2].click());
    expect(workflow.querySelector("figcaption")?.textContent?.toLowerCase()).toContain("planificador administrativo de rutas");
    expect(workflow.querySelector("figcaption")?.textContent).toContain("cero paradas cargadas");
  });

  it("renders the approved driver frame at native portrait dimensions and zooms without desktop metadata", async () => {
    const container = await mount(<ProductGallery />);
    await act(async () => container.querySelector<HTMLButtonElement>("#module-tab-driver")!.click());
    const image = container.querySelector('[role="tabpanel"] img')!;
    expect(image.getAttribute("src")).toContain("/approved/driver.jpg");
    expect(image.getAttribute("width")).toBe("386");
    expect(image.getAttribute("height")).toBe("834");
    expect(image.closest("figure")?.getAttribute("data-portrait")).toBe("true");
    expect(container.textContent).toContain("traslado CEDIS");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Ampliar captura de Repartidores"]')!.click());
    const enlarged = container.querySelector("dialog img")!;
    expect(enlarged.getAttribute("width")).toBe("386");
    expect(enlarged.getAttribute("height")).toBe("834");
  });

  it("selects and focuses the module addressed by a fragment link", async () => {
    const container = await mount(<ProductGallery />);
    await act(async () => {
      history.replaceState(null, "", "#module-tab-driver");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const driver = container.querySelector<HTMLButtonElement>("#module-tab-driver")!;
    expect(driver.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(driver);
    await act(async () => container.querySelector<HTMLButtonElement>("#module-tab-pos")!.click());
    expect(window.location.hash).toBe("#module-tab-pos");
    history.replaceState(null, "", window.location.pathname);
  });

  it("shows real mobile transport evidence without implying a completed customer delivery", async () => {
    const container = await mount(<WorkflowSection />);
    await act(async () => container.querySelectorAll<HTMLButtonElement>("ol button")[3].click());
    expect(container.querySelector("img")?.getAttribute("src")).toContain("driver-stop.jpg");
    expect(container.textContent).toContain("no una entrega a cliente confirmada");
  });

  it("shows the real location-balance capture in the inventory stage", async () => {
    const container = await mount(<WorkflowSection />);
    await act(async () => container.querySelectorAll<HTMLButtonElement>("ol button")[1].click());
    expect(container.querySelector('[data-workflow-detail] img')?.getAttribute("src")).toContain("/approved/inventory.jpg");
    expect(container.querySelector("figcaption")?.textContent).toContain("cantidades físicas");
  });

  it("supports arrow keys, Home and End with roving focus even for missing captures", async () => {
    const container = await mount(<ProductGallery />);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tabs[9]);
    expect(tabs[9].tabIndex).toBe(0);
    await act(async () => tabs[9].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    expect(container.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
  });

  it("uses the approved full POS and explicitly maps CEDIS instead of substituting a button crop", async () => {
    const container = await mount(<ProductGallery />);
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1].click());
    expect(container.querySelector('[role="tabpanel"] img')?.getAttribute("src")).toContain("/approved/pos.jpg");
    expect(container.textContent).toContain("turno sin abrir");
    await act(async () => tabs[3].click());
    expect(container.querySelector('[role="tabpanel"] img')?.getAttribute("src")).toContain("/approved/cedis.jpg");
  });

  it("makes each supplied CEDIS cycle screenshot inspectable without claiming completion", async () => {
    const container = await mount(<ProductGallery />);
    await act(async () => container.querySelector<HTMLButtonElement>("#module-tab-cedis")!.click());
    const captures = [
      { id: "supply", label: "Envío", file: "cedis-supply.jpg", phrase: "no muestra un suministro completado" },
      { id: "receptions", label: "Recepciones", file: "cedis-receptions.jpg", phrase: "pendiente de revisión" },
      { id: "reconciliation", label: "Conciliación", file: "cedis-reconciliation.jpg", phrase: "diferencia visible" },
      { id: "returns", label: "Devoluciones", file: "cedis-returns.jpg", phrase: "pendiente de confirmar" },
      { id: "return-confirmation", label: "Confirmación", file: "cedis-return-confirmation.jpg", phrase: "previo a confirmar" },
    ];

    for (const capture of captures) {
      const button = container.querySelector<HTMLButtonElement>(`[data-cedis-capture="${capture.id}"]`);
      expect(button?.textContent).toBe(capture.label);
      await act(async () => button?.click());
      expect(container.querySelector('[role="tabpanel"] img')?.getAttribute("src")).toContain(`/approved/${capture.file}`);
      expect(container.querySelector('[role="tabpanel"] figcaption')?.textContent?.toLowerCase()).toContain(capture.phrase);
    }
  });

  it("ships optimized regular and enlarged derivatives for the new approved captures", () => {
    const files = [
      "inventory.jpg", "inventory-full.jpg",
      "cedis-supply.jpg", "cedis-supply-full.jpg",
      "cedis-receptions.jpg", "cedis-receptions-full.jpg",
      "cedis-reconciliation.jpg", "cedis-reconciliation-full.jpg",
      "cedis-returns.jpg", "cedis-returns-full.jpg",
      "cedis-return-confirmation.jpg", "cedis-return-confirmation-full.jpg",
    ];
    for (const file of files) {
      const bytes = readFileSync(resolve(import.meta.dirname, `../../public/images/landing/approved/${file}`));
      expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    }
  });

  it("keeps a failed capture's module visible and offers retry without fabricating interface content", async () => {
    const container = await mount(<ProductGallery />);
    await act(async () => container.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(10);
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe("Dashboard");
    expect(container.textContent).toContain("No se pudo cargar");
    expect(container.textContent).not.toContain("Cliente · Pago");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Reintentar captura");
    expect(retry).toBeTruthy();
    await act(async () => retry?.click());
    expect(container.querySelector('[role="tabpanel"] img')).not.toBeNull();
  });

  it("zooms the real image with Escape and focus return", async () => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
    const container = await mount(<ProductGallery />);
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Ampliar captura de Dashboard"]')!;
    await act(async () => trigger.click());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("img")?.getAttribute("src")).toContain("dashboard-full.jpg");
    await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the preview and dialog focus when only the enlarged image fails", async () => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
    const container = await mount(<ProductGallery />);
    const preview = container.querySelector('[role="tabpanel"] img')!;
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Ampliar captura de Dashboard"]')!;
    await act(async () => trigger.click());
    const dialog = container.querySelector("dialog")!;
    const close = dialog.querySelector<HTMLButtonElement>('[aria-label="Cerrar captura ampliada"]')!;
    close.focus();
    await act(async () => dialog.querySelector("img")?.dispatchEvent(new Event("error")));

    expect(dialog.open).toBe(true);
    expect(preview.isConnected).toBe(true);
    expect(trigger.isConnected).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain("No se pudo cargar la ampliación");

    const retry = dialog.querySelector<HTMLButtonElement>('button[aria-label="Reintentar captura ampliada"]')!;
    await act(async () => retry.click());
    expect(document.activeElement).toBe(close);
    expect(dialog.querySelector("img")?.getAttribute("src")).toContain("dashboard-full.jpg");
  });

  it("lets the visitor choose all six operational stages without forcing scroll", async () => {
    const container = await mount(<WorkflowSection />);
    const steps = [...container.querySelectorAll<HTMLButtonElement>("ol button")];
    expect(steps.map(step => step.textContent?.replace(/^\d+/, "").trim())).toEqual(["Venta", "Inventario", "Ruta", "Entrega", "Cobranza", "Cierre"]);
    await act(async () => steps[4].click());
    expect(steps[4].getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-workflow-detail]')?.textContent).toContain("una sola cuenta");
    expect(container.querySelector("img")?.getAttribute("src")).toContain("collections.jpg");
    expect(container.textContent).toContain("no toda venta requiere entrega");
  });

  it("top-aligns the logistics capture beside the stacked driver evidence", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../styles/landing.module.css"), "utf8");
    const layout = css.match(/\.distributionLayout\s*\{([^}]*)\}/)?.[1];
    expect(layout).toBeDefined();
    expect(layout).toMatch(/align-items:\s*start\s*;/);
  });
});
