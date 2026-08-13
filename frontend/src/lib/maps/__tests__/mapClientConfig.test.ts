import { describe, expect, it } from "vitest";
import { resolveMapClientConfig } from "../mapClientConfig";

describe("runtime map client configuration", () => {
  it("derives the production client style from the canonical same-origin config", () => {
    const config = resolveMapClientConfig({
      mode: "production",
      styleUrl: "/maps/styles/operations/style.json",
    });

    expect(config).toMatchObject({
      available: true,
      renderer: "maplibre",
      style: "/maps/styles/operations/style.json",
      defaultViewport: {
        latitude: 19.1738,
        longitude: -96.1342,
        zoom: 11,
      },
    });
    expect(config.attribution.map((item) => item.label)).toEqual([
      "© OpenMapTiles",
      "© OpenStreetMap contributors",
    ]);
  });

  it("keeps the development fallback without marking production as available", () => {
    const config = resolveMapClientConfig({ mode: "development" });

    expect(config.available).toBe(true);
    expect(config.style).toMatchObject({ version: 8 });
  });
});
