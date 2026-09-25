// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { LANDING_CONFIG } from "../config/landingConfig";
import { LandingHeader } from "../components/LandingHeader";
import { LandingProductImage } from "../components/LandingProductImage";

const sourceDirectory = resolve(import.meta.dirname, "..");
const packageSource = readFileSync(resolve(sourceDirectory, "../package.json"), "utf8");
const appSource = readFileSync(resolve(sourceDirectory, "App.tsx"), "utf8");
const motionShellSource = readFileSync(
  resolve(sourceDirectory, "components/LandingMotionShell.tsx"),
  "utf8",
);
const stylesSource = readFileSync(resolve(sourceDirectory, "styles/landing.css"), "utf8");

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.innerHTML = "";
  root = undefined;
});

function staticMarkup(node: ReactNode) {
  return renderToStaticMarkup(node);
}

describe("standalone ERP marketing landing", () => {
  it("keeps the landing package independent from the authenticated ERP", () => {
    expect(packageSource).not.toContain('"react-router-dom"');
    expect(appSource).not.toContain("frontend/src");
    expect(LANDING_CONFIG.erpLoginUrl).toBe(`${LANDING_CONFIG.appUrl}/login`);
  });

  it("renders a stable placeholder when a product image has no URL", () => {
    const html = renderToStaticMarkup(
      <LandingProductImage
        alt="Dashboard"
        aspectRatio="16 / 10"
        label="Captura del Dashboard"
        src=""
      />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("Captura pendiente");
    expect(html).not.toContain("<img");
  });

  it("renders a configured image URL without changing the image contract", () => {
    const html = renderToStaticMarkup(
      <LandingProductImage
        alt="Dashboard real"
        aspectRatio="16 / 10"
        label="Captura del Dashboard"
        src="/images/dashboard.webp"
      />,
    );

    expect(html).toContain('<img');
    expect(html).toContain('src="/images/dashboard.webp"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="Dashboard real"');
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
          label="Captura del Dashboard"
          src="/images/missing.webp"
        />,
      ),
    );

    const image = container.querySelector("img");
    expect(image).toBeTruthy();
    await act(async () => image?.dispatchEvent(new Event("error")));

    expect(container.querySelector('[role="img"]')).toBeTruthy();
    expect(container.querySelector(".lucide-image-off")).toBeNull();
    expect(container.textContent).toContain("No se pudo cargar la captura");
  });

  it("renders public navigation, external ERP access, and FAQ content", () => {
    const html = staticMarkup(<App />);

    expect(html).toContain('href="#features"');
    expect(html).toContain('href="#demo"');
    expect(html).toContain(`href="${LANDING_CONFIG.erpLoginUrl}"`);
    expect(html).toContain('id="plans"');
    expect(html).toContain("ERP Operación");
    expect(html).toContain("¿Qué estás buscando?");
    expect(html).toContain('id="faq"');
    expect(html).toContain("¿Puede manejar ventas a crédito?");
    expect(html).not.toContain("sin datos ficticios");
    expect(html).not.toContain("DEMO REQUEST / PREPARADO");
  });

  it("exposes the operational signal narrative without importing ERP modules", () => {
    const html = staticMarkup(<App />);

    expect(packageSource).toContain('"@gsap/react"');
    expect(packageSource).toContain('"gsap"');
    expect(packageSource).toContain('"lenis"');
    expect(html).toContain('data-platform-sequence');
    expect(html).toContain('data-signal-journey');
    expect(html).toContain('data-route-sequence');
    expect(html).toContain('data-isolation-sequence');
    expect(html).toContain('data-cta-signal-path');
    expect(html).toContain('data-scroll-progress');
  });

  it("keeps Lenis wheel and trackpad scrolling on an active animation frame", () => {
    expect(motionShellSource).toContain("useLenis");
    expect(motionShellSource).toContain("autoRaf: false");
    expect(motionShellSource).toContain("gsap.ticker.add");
    expect(motionShellSource).toContain('lenis.raf(time * 1000)');
    expect(motionShellSource).toContain("lerp: 0.08");
    expect(motionShellSource).toContain("wheelMultiplier: 0.9");
    expect(stylesSource).not.toContain(".landing-motion-shell {\n  overflow: clip;");
  });

  it("keeps dark CTA labels readable before motion initializes", () => {
    expect(stylesSource).toContain(".landing-page .landing-button--dark");
    expect(stylesSource).toContain(".landing-page .landing-button--small");
    expect(motionShellSource).not.toContain('.from(actions, { autoAlpha: 0');
  });

  it("sequences panel changes and SVG signals without future segments", () => {
    expect(motionShellSource).toContain('`${label}+=0.34`');
    expect(motionShellSource).toContain("length + 2");
    expect(motionShellSource).toContain("data-isolation-trunk");
    expect(motionShellSource).toContain("data-isolation-branch");
  });

  it("renders finance transition and progressive company layers", () => {
    const html = staticMarkup(<App />);

    expect(html).toContain("data-finance-transition-surface");
    expect(html).toContain("data-finance-transition-path");
    expect(html).toContain("data-company-layer");
  });

  it("pins desktop scroll narratives to the visual that is animating", () => {
    expect(motionShellSource).toContain("trigger: platformStage");
    expect(motionShellSource).toContain("[data-signal-journey-rail]");
    expect(motionShellSource).toContain("pin: journeyRail");
    expect(motionShellSource).toContain("[data-route-map]");
    expect(motionShellSource).toContain("pin: routeMap");
  });

  it("keeps the final polish compact and continuous", () => {
    expect(motionShellSource).toContain("viewportDistance(1.62, platformPanels.length * 290)");
    expect(motionShellSource).toContain("viewportDistance(0.64, 620)");
    expect(motionShellSource).toContain("viewportDistance(0.76, 740)");
    expect(motionShellSource).toContain("data-finance-exit-surface");
    expect(motionShellSource).toContain("data-finance-exit-path");
    expect(motionShellSource).toContain("landing-route-shot__media");
    expect(stylesSource).toContain(".landing-finance-exit__surface");
    expect(stylesSource).not.toContain("landing-route-story__ghost");
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
    expect(container.textContent).toContain("Iniciar sesión");
  });
});
