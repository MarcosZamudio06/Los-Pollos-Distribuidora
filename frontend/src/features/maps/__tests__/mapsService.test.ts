import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../lib/api";
import { MapsConfigError, mapsService } from "../mapsService";
import type { MapClientConfig } from "../types";

vi.mock("../../../lib/api", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const getConfig = vi.mocked(apiClient.get);

const config: MapClientConfig = {
  renderer: "maplibre",
  available: true,
  styleUrl: "/maps/styles/operations/style.json",
  revision: "mexico-2026-08",
  attribution: [
    {
      label: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
    },
  ],
  defaultViewport: {
    latitude: 19.1738,
    longitude: -96.1342,
    zoom: 11,
  },
  capabilities: {
    geocoding: true,
    routing: true,
    optimization: true,
  },
};

describe("mapsService", () => {
  beforeEach(() => {
    getConfig.mockReset();
  });

  it("loads the browser-safe config with the current access token", async () => {
    const signal = new AbortController().signal;
    getConfig.mockResolvedValue({
      data: config,
      message: "Map configuration retrieved successfully",
      success: true,
    });

    await expect(mapsService.getConfig("access-token", signal)).resolves.toEqual(
      config,
    );
    expect(getConfig).toHaveBeenCalledWith("/maps/config", {
      headers: { authorization: "Bearer access-token" },
      signal,
    });
  });

  it("rejects malformed runtime configuration instead of guessing defaults", async () => {
    getConfig.mockResolvedValue({
      data: {
        ...config,
        styleUrl: "",
      },
    });

    await expect(mapsService.getConfig()).rejects.toBeInstanceOf(
      MapsConfigError,
    );
  });

  it("keeps geocoding requests authenticated, abortable, and normalized", async () => {
    const searchSignal = new AbortController().signal;
    const reverseSignal = new AbortController().signal;
    getConfig
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              label: "Av. Centro 10",
              latitude: 19.432608,
              longitude: -96.1342,
              osmType: "W",
              osmId: "123",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          label: "Av. Centro 10",
          latitude: 19.432608,
          longitude: -96.1342,
        },
      });

    await expect(
      mapsService.searchAddresses("Avenida Centro", "access-token", {
        latitude: 19.4,
        longitude: -96.1,
        limit: 5,
        signal: searchSignal,
      }),
    ).resolves.toEqual([
      {
        label: "Av. Centro 10",
        latitude: 19.432608,
        longitude: -96.1342,
        osmType: "W",
        osmId: "123",
      },
    ]);
    expect(getConfig).toHaveBeenNthCalledWith(1, "/geocoding/search?q=Avenida+Centro&latitude=19.4&longitude=-96.1&limit=5", {
      headers: { authorization: "Bearer access-token" },
      signal: searchSignal,
    });

    await expect(
      mapsService.reverseAddress(
        { latitude: 19.432608, longitude: -96.1342 },
        "access-token",
        { signal: reverseSignal },
      ),
    ).resolves.toEqual({
      label: "Av. Centro 10",
      latitude: 19.432608,
      longitude: -96.1342,
    });
    expect(getConfig).toHaveBeenNthCalledWith(2, "/geocoding/reverse?latitude=19.432608&longitude=-96.1342", {
      headers: { authorization: "Bearer access-token" },
      signal: reverseSignal,
    });
  });
});
