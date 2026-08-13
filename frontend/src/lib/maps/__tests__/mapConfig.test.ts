import { describe, expect, it } from "vitest";
import {
  assertProductionMapConfig,
  resolveMapStyle,
} from "../mapConfig";
import {
  OSM_RASTER_ATTRIBUTION,
  OSM_RASTER_TILE_URL,
} from "../mapStyle";

describe("map configuration", () => {
  it("uses the controlled OSM raster fallback outside production", () => {
    const style = resolveMapStyle({ mode: "development" });

    expect(typeof style).toBe("object");
    expect(style).toMatchObject({
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [OSM_RASTER_TILE_URL],
          tileSize: 256,
          attribution: OSM_RASTER_ATTRIBUTION,
        },
      },
    });
  });

  it("also uses the fallback in test mode", () => {
    expect(resolveMapStyle({ mode: "test" })).toEqual(
      resolveMapStyle({ mode: "development" }),
    );
  });

  it("requires a style URL in production", () => {
    expect(() => assertProductionMapConfig({ mode: "production" })).toThrow(
      "VITE_MAP_STYLE_URL must be defined",
    );
    expect(() => resolveMapStyle({ mode: "production" })).toThrow(
      "VITE_MAP_STYLE_URL must be defined",
    );
  });

  it("returns a configured style URL without transforming it", () => {
    const styleUrl = "https://maps.example.test/styles/public/style.json";

    expect(resolveMapStyle({ mode: "production", styleUrl })).toBe(styleUrl);
  });

  it("does not require or expose a secret for map configuration", () => {
    const styleUrl = "https://maps.example.test/styles/public/style.json";
    const resolvedStyle = resolveMapStyle({ mode: "development", styleUrl });

    expect(resolvedStyle).toBe(styleUrl);
    expect(JSON.stringify(resolvedStyle)).not.toContain("apiKey");
    expect(JSON.stringify(resolvedStyle)).not.toContain("secret");
  });

  it("rejects credentials and query tokens", () => {
    expect(() =>
      assertProductionMapConfig({
        mode: "production",
        styleUrl: "https://user:secret@maps.example.test/style.json",
      }),
    ).toThrow("must not contain credentials");
    expect(() =>
      assertProductionMapConfig({
        mode: "production",
        styleUrl: "https://maps.example.test/style.json?token=secret",
      }),
    ).toThrow("must not contain credentials");
  });
});
