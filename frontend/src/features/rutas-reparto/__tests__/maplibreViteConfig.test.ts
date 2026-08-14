import { describe, expect, it } from "vitest";
import viteConfig from "../../../../vite.config";

describe("MapLibre Vite integration", () => {
  it("keeps MapLibre out of dependency pre-bundling so its worker is served", () => {
    expect(viteConfig.optimizeDeps?.exclude ?? []).toContain("maplibre-gl");
  });
});
