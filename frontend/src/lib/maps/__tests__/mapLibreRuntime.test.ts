import { afterEach, describe, expect, it, vi } from "vitest";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const maplibre = vi.hoisted(() => ({
  setWorkerUrl: vi.fn(),
}));

vi.mock("maplibre-gl", () => maplibre);

import { loadMapLibre } from "../mapLibreRuntime";

describe("mapLibreRuntime", () => {
  afterEach(() => {
    maplibre.setWorkerUrl.mockClear();
  });

  it("configures the Vite worker URL once and reuses the lazy module", async () => {
    const [first, second] = await Promise.all([
      loadMapLibre(),
      loadMapLibre(),
    ]);

    expect(first).toBe(second);
    expect(maplibre.setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith(mapLibreWorkerUrl);
  });
});
