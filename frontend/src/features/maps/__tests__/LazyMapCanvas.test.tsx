// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyMapCanvas } from "../LazyMapCanvas";
import type { MapClientConfig } from "../types";

const unavailableConfig: MapClientConfig = {
  renderer: "maplibre",
  available: false,
  styleUrl: "/maps/styles/operations/style.json",
  revision: "mexico-2026-08",
  attribution: [],
  defaultViewport: { latitude: 19.1738, longitude: -96.1342, zoom: 11 },
  capabilities: { geocoding: false, routing: false, optimization: false },
};

describe("LazyMapCanvas", () => {
  it("does not request the renderer chunk when runtime configuration disables maps", () => {
    const html = renderToStaticMarkup(
      <LazyMapCanvas config={unavailableConfig} />,
    );

    expect(html).toContain("Mapa no disponible");
    expect(html).toContain("configuración de mapas");
  });
});
