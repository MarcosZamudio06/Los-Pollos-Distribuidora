import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../lib/api";
import { mapsService } from "../mapsService";

vi.mock("../../../lib/api", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const get = vi.mocked(apiClient.get);

describe("mapsService", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("keeps geocoding requests authenticated, abortable, and normalized", async () => {
    const searchSignal = new AbortController().signal;
    const reverseSignal = new AbortController().signal;
    get
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
    expect(get).toHaveBeenNthCalledWith(
      1,
      "/geocoding/search?q=Avenida+Centro&latitude=19.4&longitude=-96.1&limit=5",
      {
        headers: { authorization: "Bearer access-token" },
        signal: searchSignal,
      },
    );

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
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/geocoding/reverse?latitude=19.432608&longitude=-96.1342",
      {
        headers: { authorization: "Bearer access-token" },
        signal: reverseSignal,
      },
    );
  });

  it("drops malformed geocoding items while keeping an empty normalized result", async () => {
    get.mockResolvedValue({
      data: {
        items: [
          { label: "válido", latitude: 19, longitude: -96 },
          { label: "sin coordenadas" },
        ],
      },
    });

    await expect(mapsService.searchAddresses("válido")).resolves.toEqual([
      { label: "válido", latitude: 19, longitude: -96 },
    ]);
  });
});
