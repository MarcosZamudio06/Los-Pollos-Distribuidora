// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { LANDING_CONFIG } from "../config/landingConfig";
import { LANDING_IMAGES, getLandingImage } from "../config/landingImages";
import { LandingHeader } from "../components/LandingHeader";
import { LandingProductImage } from "../components/LandingProductImage";

const sourceDirectory = resolve(import.meta.dirname, "..");
const packageSource = readFileSync(resolve(sourceDirectory, "../package.json"), "utf8");
const appSource = readFileSync(resolve(sourceDirectory, "App.tsx"), "utf8");
const motionShellSource = readFileSync(resolve(sourceDirectory, "components/LandingMotionShell.tsx"), "utf8");
const modulePath = resolve(sourceDirectory, "styles/landing.module.css");
const stylesSource = existsSync(modulePath) ? readFileSync(modulePath, "utf8") : "";
const globalStylesSource = readFileSync(resolve(sourceDirectory, "styles/landing.css"), "utf8");
const indexSource = readFileSync(resolve(sourceDirectory, "../index.html"), "utf8");

function colorToken(name: string) {
  const value = globalStylesSource.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing color token ${name}`);
  return value;
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    if (typeof callback !== "function") throw new TypeError("ResizeObserver requires a callback");
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | undefined;
  target: Element | undefined;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.latest = this;
  }

  observe(target: Element) {
    this.target = target;
  }

  unobserve() {}

  disconnect() {}

  emit(isIntersecting: boolean) {
    if (!this.target) throw new Error("No observed target");
    const entry = {
      target: this.target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  if (typeof ResizeObserver === "undefined") vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.innerHTML = "";
  root = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function staticMarkup(node: ReactNode) {
  return renderToStaticMarkup(node);
}

describe("standalone ERP marketing landing", () => {
  it("keeps the landing package independent from the authenticated ERP", () => {
    expect(packageSource).not.toContain('"react-router-dom"');
    expect(appSource).not.toContain("frontend/src");
    expect(LANDING_CONFIG.erpLoginUrl).toBe("");
  });

  it("renders an honest product-interface fallback when an image has no URL", () => {
    const html = renderToStaticMarkup(
      <LandingProductImage
        alt="Dashboard"
        aspectRatio="16 / 10"
        src=""
      />,
    );

    expect(html).toContain('role="img"');
    expect(html).not.toContain("Captura pendiente");
    expect(html).toContain("No se pudo cargar esta captura");
    expect(html).not.toContain("<img");
  });

  it("renders a configured image URL without changing the image contract", () => {
    const html = renderToStaticMarkup(
      <LandingProductImage
        alt="Dashboard real"
        aspectRatio="16 / 10"
        src="/images/dashboard.webp"
      />,
    );

    expect(html).toContain('<img');
    expect(html).toContain('src="/images/dashboard.webp"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="Dashboard real"');
  });

  it("uses the bundled real POS screenshot and accepts optional approved screenshots", () => {
    vi.stubEnv("VITE_LANDING_DASHBOARD_IMAGE", "/images/landing/dashboard.webp");
    vi.stubEnv("VITE_LANDING_INVENTORY_IMAGE", "/images/landing/inventory.webp");
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    const images = [...page.querySelectorAll("#hero-product img")];

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe("/images/landing/dashboard.webp");
    expect(getLandingImage("heroDashboard")).toBe("/images/landing/dashboard.webp");
    expect(getLandingImage("inventory")).toBe("/images/landing/inventory.webp");
    expect(existsSync(resolve(sourceDirectory, "../public/images/landing/pos-checkout.jpg"))).toBe(true);
    expect(images.every((image) => image.getAttribute("alt"))).toBe(true);
  });

  it("keeps the demo video absent until accessible media assets are configured", () => {
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_URL", "/videos/erp-demo.mp4");
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");

    expect(page.querySelector("#video-demo video")).toBeNull();
    expect(page.querySelector("h1")?.closest("section")?.querySelector('a[href="#erp-gallery"]')?.textContent)
      .toBe("Explorar el ERP");
  });

  it("renders a manual video demo with poster, Spanish captions, and a transcript link", () => {
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_URL", "/videos/erp-demo.mp4");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_POSTER", "/images/landing/erp-demo-poster.webp");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_CAPTIONS", "/videos/erp-demo-es.vtt");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_TRANSCRIPT", "/videos/erp-demo-transcript.html");
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    const video = page.querySelector<HTMLVideoElement>("#video-demo video");

    expect(video?.getAttribute("src")).toBe("/videos/erp-demo.mp4");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.getAttribute("preload")).toBe("none");
    expect(video?.getAttribute("poster")).toBe("/images/landing/erp-demo-poster.webp");
    expect(video?.querySelector('track[kind="captions"][srclang="es"][default]')?.getAttribute("src"))
      .toBe("/videos/erp-demo-es.vtt");
    expect(page.querySelector('#video-demo a[href="/videos/erp-demo-transcript.html"]')?.textContent)
      .toBe("Leer la transcripción");
    expect(page.querySelector('h1')?.closest("section")?.querySelector('a[href="#erp-gallery"]')?.textContent)
      .toBe("Explorar el ERP");
  });

  it("pauses configured demo video when it leaves the viewport", async () => {
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_URL", "/videos/erp-demo.mp4");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_POSTER", "/images/landing/erp-demo-poster.webp");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_CAPTIONS", "/videos/erp-demo-es.vtt");
    vi.stubEnv("VITE_LANDING_DEMO_VIDEO_TRANSCRIPT", "/videos/erp-demo-transcript.html");
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<App />));
    await act(async () => FakeIntersectionObserver.latest?.emit(false));

    expect(FakeIntersectionObserver.latest?.target).toBe(container.querySelector("#video-demo video"));
    expect(pause).toHaveBeenCalledOnce();
  });

  it("returns to the neutral placeholder after an image load error", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(
        <LandingProductImage
          alt="Dashboard real"
          aspectRatio="16 / 10"
        src="/images/missing.webp"
        />,
      ),
    );

    const image = container.querySelector("img");
    expect(image).toBeTruthy();
    await act(async () => image?.dispatchEvent(new Event("error")));

    expect(container.querySelector('[role="img"]')).toBeTruthy();
    expect(container.querySelector(".lucide-image-off")).toBeNull();
    expect(container.textContent).toContain("No se pudo cargar esta captura");
  });

  it("leads with the product promise and makes a real ERP screen the hero visual", () => {
    const html = staticMarkup(<App />);
    const page = new DOMParser().parseFromString(html, "text/html");
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toBe("De la venta al cierre. Tu operación, conectada.");
    expect(page.querySelector("h1")?.nextElementSibling?.textContent).toContain(
      "Consulta mercancía por ubicación y saldos",
    );
    expect(page.querySelector("h1")?.closest("section")?.querySelector("#hero-product img")).toBeTruthy();
    expect(html).toContain("Los-Pollos-Distribuidora");
    expect(html).not.toContain("Los Pollos Distribuidora");
    expect(html).not.toContain("distribución avícola");
    expect(html).toContain("CEDIS");
    expect(html).not.toContain("Pierna");
    expect(html).not.toContain("ERP PARA DISTRIBUCIÓN AVÍCOLA");
  });

  it("leads prospects to the product and keeps customer login secondary", () => {
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    for (const id of ["product", "features", "operation", "logistics", "security", "faq", "demo", "plans"]) {
      expect(page.getElementById(id), id).toBeTruthy();
    }
    for (const link of page.querySelectorAll('a[href^="#"]')) {
      expect(page.getElementById(link.getAttribute("href")!.slice(1))).toBeTruthy();
    }
    expect(page.querySelector('a[href*="localhost"]')).toBeNull();
    expect(page.querySelector("h1")?.closest("section")?.textContent).toContain("Explorar el ERP");
    expect(page.querySelector("form")).toBeNull();
    expect(page.body.textContent).not.toContain("ERP Corporativo");
  });

  it("does not invent customer, outcome, stock, or performance figures", () => {
    const html = staticMarkup(<App />);
    for (const fabricatedValue of ["$1,900", "$450", "$900", "Producto de muestra", "Almacén Norte", "Captura pendiente", "Vista conceptual", "imagen pendiente"]) {
      expect(html).not.toContain(fabricatedValue);
    }
    expect(LANDING_IMAGES.pos).toBe("/images/landing/approved/pos.jpg");
    expect(html).toContain("demostración");
  });

  it("uses charcoal and warm-white evidence with WCAG text and CTA contrast", () => {
    expect(globalStylesSource).toContain("color-scheme: dark");
    const background = colorToken("--landing-bg");
    const ink = colorToken("--landing-foreground");
    const muted = colorToken("--landing-muted");
    const accentText = colorToken("--landing-gold-text");
    const gold = colorToken("--landing-gold");
    const buttonInk = colorToken("--landing-accent-ink");
    const dark = colorToken("--landing-dark");
    const darkInk = colorToken("--landing-dark-foreground");
    const darkMuted = colorToken("--landing-dark-muted");

    expect(relativeLuminance(background)).toBeLessThan(0.03);
    expect(relativeLuminance(colorToken("--landing-evidence"))).toBeGreaterThan(0.88);
    expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(muted, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentText, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(buttonInk, gold)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkInk, dark)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(darkMuted, dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps light mobile product UI headings readable inside a dark chapter", () => {
    const driverHeading = stylesSource.match(/\.page \.driverScreen h3\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(driverHeading).toContain("color: var(--landing-foreground)");
  });

  it("tells one six-stage operational story without scroll locking or duplicate platform panels", () => {
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    const story = page.querySelector("#operation");
    expect(story?.querySelectorAll("ol button")).toHaveLength(6);
    expect(story?.querySelector("[data-workflow-detail] img")).toBeTruthy();
    expect(page.querySelector("[data-platform-sequence]")).toBeNull();
    expect(motionShellSource).not.toContain("pin:");
    expect(page.querySelectorAll("#logistics")).toHaveLength(1);
    expect(page.querySelector("#company")?.hasAttribute("data-isolation-sequence")).toBe(true);
  });

  it("reveals the operational sequence once without a pinned timeline", () => {
    expect(motionShellSource).toContain("once: true");
    expect(motionShellSource).toContain("[data-operation-story]");
    expect(motionShellSource).not.toContain("scrub:");
  });

  it("describes only discovered modules and location-based inventory", () => {
    const html = staticMarkup(<App />);
    for (const label of ["Venta", "Inventario", "CEDIS", "Logística", "Entrega", "Cobranza", "Cierre", "Facturación", "Roles y permisos"]) {
      expect(html).toContain(label);
    }
    expect(new DOMParser().parseFromString(html, "text/html").querySelectorAll("#logistics")).toHaveLength(1);
    expect(html).not.toContain("Almacén y reparto, con contexto.");
    expect(html).toContain("por ubicación");
    expect(html).not.toContain("ERP Fiscal");
    expect(html).not.toContain("testimonios");
  });

  it("uses one motion owner and avoids continuous decorative animation", () => {
    expect(appSource).toContain("LandingMotionShell");
    expect(motionShellSource).not.toContain("ReactLenis");
    expect(stylesSource).toContain(".operationRail");
    expect(stylesSource).toContain("prefers-reduced-motion: reduce");
    expect(stylesSource).toContain("focus-visible");
    expect(stylesSource).not.toContain("infinite");
    expect(stylesSource).not.toContain("scroll-behavior: smooth");
    expect(stylesSource).toContain("--landing-foreground");
    expect(stylesSource).toContain("@media (hover: hover) and (pointer: fine)");
    expect(stylesSource).not.toContain("transition: all");
  });

  it("unifies demo intent and exposes a truthful unavailable state", () => {
    vi.stubEnv("VITE_LANDING_DEMO_REQUEST_URL", "https://example.test/demo");
    let page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    expect(page.querySelector('header a[href="#demo"]')?.textContent).toBe("Solicitar demostración");
    expect(page.querySelector('#demo a[href="https://example.test/demo"]')?.textContent).toBe("Solicitar demostración");
    vi.stubEnv("VITE_LANDING_DEMO_REQUEST_URL", "");
    page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    expect(page.querySelector("form")).toBeNull();
    expect(page.querySelector("#demo")?.textContent).toContain("Explora");
  });

  it("keeps the hero image eager and below-the-fold product assets lazy", () => {
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    const heroImage = page.querySelector<HTMLImageElement>("#hero-product img");
    expect(heroImage?.getAttribute("loading")).toBe("eager");
    expect(heroImage?.getAttribute("fetchpriority")).toBe("high");
    expect(heroImage?.getAttribute("width")).toBe("1600");
    expect(heroImage?.getAttribute("height")).toBe("924");
    expect(page.querySelector("#erp-gallery img")?.getAttribute("loading")).toBe("lazy");
  });

  it("offers semantic expandable FAQ answers and a skip-to-main link", () => {
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    expect(page.querySelectorAll("details summary")).toHaveLength(8);
    expect(page.querySelector("#faq h2")?.textContent).toBe("Preguntas antes de decidir.");
    expect(page.querySelector('a[href="#main-content"]')).toBeTruthy();
    expect(page.querySelector("main")?.id).toBe("main-content");
    expect(page.body.textContent).toContain("¿Puede manejar ventas a crédito?");
  });

  it("explains that companies share the platform but not their data context", () => {
    const page = new DOMParser().parseFromString(staticMarkup(<App />), "text/html");
    const section = page.querySelector<HTMLElement>("#company");
    const planes = [...(section?.querySelectorAll("[data-company-plane]") ?? [])];

    expect(section?.textContent).toContain("los datos, ubicaciones y accesos permanecen separados");
    expect(planes.map((plane) => plane.querySelector("h3")?.textContent)).toEqual(["Empresa", "Otra empresa"]);
    expect(planes.every((plane) => plane.querySelectorAll("[data-company-layer]").length === 3)).toBe(true);
  });

  it("closes the mobile menu after selecting an existing section", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<LandingHeader />));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-controls="landing-mobile-menu"]');
    await act(async () => toggle?.click());
    const operation = container.querySelector<HTMLAnchorElement>('#landing-mobile-menu a[href="#operation"]');
    await act(async () => operation?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('#landing-mobile-menu')).toBeNull();
  });

  it("restores SEO metadata on unmount without changing the ERP configuration", async () => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<App />));
    expect(document.title).toBe("Los-Pollos-Distribuidora | Ventas, inventario y distribución");
    expect(document.documentElement.lang).toBe("es");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain("cobranza");
    await act(async () => root?.unmount());
    root = undefined;
    expect(document.title).toBe(previousTitle);
    expect(document.documentElement.lang).toBe(previousLanguage);
  });

  it("declares a real local favicon instead of requesting an absent default asset", () => {
    expect(indexSource).toContain('rel="icon" href="/favicon.svg"');
    expect(indexSource).toContain('content="Los-Pollos-Distribuidora | Ventas, inventario y distribución"');
    expect(indexSource).not.toContain("Los Pollos Distribuidora");
    expect(existsSync(resolve(sourceDirectory, "../public/favicon.svg"))).toBe(true);
  });

  it("provides an accessible mobile menu toggle", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<LandingHeader />));

    const menuButton = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="landing-mobile-menu"]',
    );
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => menuButton?.click());

    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelector('nav[aria-label="Navegación móvil"]'),
    ).toBeTruthy();
    expect(container.querySelector('a[href*="localhost"]')).toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);
  });
});
