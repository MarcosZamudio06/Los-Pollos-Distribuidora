import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LANDING_BRAND, LANDING_SEO } from "../config/landingConfig";
import { CompanySection } from "../components/CompanySection";
import { HeroSection } from "../components/HeroSection";
import { ProductCapture } from "../components/ProductCapture";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.unstubAllEnvs());
it("uses the configured identity in company, hero and authentic capture descriptions", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<><CompanySection /><HeroSection /><ProductCapture image="pos" title="POS" caption="Original" /></>));
    expect(container.textContent).not.toContain("ERP Operativo");
    expect(container.querySelector('section[data-hero]')?.textContent).toContain(LANDING_BRAND.descriptor);
    expect(container.querySelector('section[data-hero]')?.textContent).toContain(LANDING_BRAND.tagline);
    expect(container.querySelector('img')?.alt).toContain(LANDING_BRAND.productName);
    expect(container.textContent).toContain("La identidad visible pertenece al entorno capturado");
    expect(LANDING_SEO.title.startsWith(LANDING_BRAND.productName)).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
