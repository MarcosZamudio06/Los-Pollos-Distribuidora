// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { publicUrl, getCommercialConfig } from "../config/commercialConfig";
import { submitDemoRequest } from "../services/demoRequest";

beforeEach(() => { vi.stubEnv("VITE_LANDING_PRIVACY_VERSION", "demo-contact-v1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const receipt = { accepted: true, reference: "12345678-1234-4234-8234-123456789001", receipt: "stored", duplicate: false, notification: "pending" };
const lead = { name: "Demo", email: "demo@example.test", company: "Example", message: "Ventas", consent: true, website: "" };
describe("commercial safety contract", () => {
  it("rejects local, credentialed, and insecure public destinations", () => {
    for (const url of ["http://example.test", "https://localhost", "https://127.0.0.1", "https://[::ffff:127.0.0.1]", "https://erp", "https://user:pass@example.test", "javascript:alert(1)"]) expect(publicUrl(url)).toBe("");
    expect(publicUrl("https://erp.example.test/")).toBe("https://erp.example.test/");
  });
  it("requires both endpoint and privacy URL before collecting personal data", () => {
    vi.stubEnv("VITE_LANDING_LEAD_ENDPOINT", "https://leads.example.test");
    expect(getCommercialConfig().canSubmit).toBe(false);
    vi.stubEnv("VITE_LANDING_PRIVACY_URL", "https://example.test/privacy");
    expect(getCommercialConfig().canSubmit).toBe(true);
  });
  it("never submits missing configuration or spam", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(submitDemoRequest(lead, "")).rejects.toThrow();
    await expect(submitDemoRequest({ ...lead, website: "bot" }, "https://leads.example.test")).rejects.toThrow();
    await expect(submitDemoRequest({ ...lead, consent: false }, "https://leads.example.test")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires an explicit acceptance from the receiver, not just HTTP success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(submitDemoRequest(lead, "https://leads.example.test")).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => (receipt) }));
    await expect(submitDemoRequest(lead, "https://leads.example.test")).resolves.toEqual(receipt);
  });
  it("does not accept a rejected HTTP response even if its body says accepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => (receipt) }));
    await expect(submitDemoRequest(lead, "https://leads.example.test")).rejects.toThrow();
  });
});

import { act } from "react";
import { createRoot } from "react-dom/client";
import { FinalCta } from "../components/FinalCta";
import { ProductGallery } from "../components/ProductGallery";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("keeps unavailable modules selectable and supports all verified categories", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ProductGallery />));
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(10);
    const tab = container.querySelector<HTMLButtonElement>('[aria-selected="true"]')!;
    await act(async () => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe("Facturación");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Módulo siguiente"]')!.click());
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe("Dashboard");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Módulo siguiente"]')!.click());
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe("Punto de venta");
    expect(container.querySelector('[role="tabpanel"] img')?.getAttribute("src")).toContain("approved/pos.jpg");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
it("keeps a failed asset's description and category instead of hiding the module", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ProductGallery />));
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("No se pudo cargar");
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(10);
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe('Dashboard');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
it("exposes form loading, rejects unconfirmed acceptance and only then shows confirmed success", async () => {
  vi.stubEnv("VITE_LANDING_LEAD_ENDPOINT", "https://leads.example.test");
  vi.stubEnv("VITE_LANDING_PRIVACY_URL", "https://example.test/privacy");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  let resolveFetch!: (value: unknown) => void;
  const fetch = vi.fn().mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
  vi.stubGlobal("fetch", fetch);
  try {
    await act(async () => root.render(<FinalCta />));
    clock.mockReturnValue(4000);
    const form = container.querySelector<HTMLFormElement>("form")!;
    for (const [name, value] of Object.entries({ name: "Demo", company: "Example", email: "demo@example.test" })) form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    form.querySelector<HTMLInputElement>('[name="consent"]')!.checked = true;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(form.getAttribute("aria-busy")).toBe("true");
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveFetch({ ok: true, json: async () => ({}) }));
    expect(container.textContent).toContain("No se confirmó la recepción");
    expect(container.textContent).not.toContain("Solicitud recibida");
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => resolveFetch({ ok: true, json: async () => (receipt) }));
    expect(container.textContent).toContain("Gracias por tu interés. Hemos registrado tu solicitud");
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  } finally { clock.mockRestore(); await act(async () => root.unmount()); container.remove(); }
});
import { getPublicSeo } from "../services/seoTags";
it("does not publish local canonical or social image URLs", () => {
  expect(getPublicSeo("http://localhost:5174", "https://localhost/social.jpg")).toEqual({ canonical: "", socialImage: "" });
  expect(getPublicSeo("https://example.test", "https://example.test/product.webp").canonical).toBe("https://example.test/");
});

import { getCommercialAction } from "../config/commercialConfig";
it("uses exploration without a channel and validated email without promising delivery", () => {
  expect(getCommercialAction()).toEqual({ label: "Explorar el ERP", href: "#erp-gallery", kind: "explore" });
  vi.stubEnv("VITE_LANDING_CONTACT_EMAIL", "sales@example.test?bcc=other@example.test");
  expect(getCommercialAction().kind).toBe("explore");
  vi.stubEnv("VITE_LANDING_CONTACT_EMAIL", "sales@example.test");
  expect(getCommercialAction()).toEqual({ label: "Contactar por correo", href: "mailto:sales@example.test", kind: "email" });
  vi.stubEnv("VITE_LANDING_CONTACT_EMAIL", "sales%0d%0a@example.test");
  expect(getCommercialAction().href).toBe("mailto:sales%250d%250a@example.test");
});

it("rejects invalid or oversized lead fields before making a request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const invalid of [{ email: "invalid" }, { name: " " }, { name: "a".repeat(101) }, { company: "a".repeat(161) }, { message: "a".repeat(2001) }]) {
    await expect(submitDemoRequest({ ...lead, ...invalid }, "https://leads.example.test")).rejects.toThrow();
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("does not confirm reception after a network or malformed JSON failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network unavailable")));
  await expect(submitDemoRequest(lead, "https://leads.example.test")).rejects.toThrow();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } }));
  await expect(submitDemoRequest(lead, "https://leads.example.test")).rejects.toThrow();
});
