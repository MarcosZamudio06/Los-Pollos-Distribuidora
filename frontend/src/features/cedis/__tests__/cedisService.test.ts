import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cedisService } from "../cedisService";

const jsonHeaders = { "content-type": "application/json" };

function okJson(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: jsonHeaders,
    status: 200,
  });
}

function lastRequest() {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error("No se registró ninguna petición fetch.");
  return {
    init: call[1] as RequestInit | undefined,
    url: String(call[0]),
  };
}

describe("CEDIS service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("consulta el dashboard con fecha, CEDIS, estado y búsqueda", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        businessDate: "2026-08-05",
        cedisLocationId: "cedis-1",
        dataAsOf: "2026-08-05T12:00:00.000Z",
        generatedAt: "2026-08-05T12:00:00.000Z",
        items: [],
        timeZone: "America/Mexico_City",
      }),
    );

    await cedisService.getDashboard(
      {
        businessDate: "2026-08-05",
        cedisLocationId: "cedis-1",
        search: "Centro Norte",
        status: "OPEN",
      },
      "access-token",
    );

    const request = lastRequest();
    expect(request.url).toBe(
      "/api/cedis/dashboard?cedisLocationId=cedis-1&businessDate=2026-08-05&status=OPEN&search=Centro+Norte",
    );
    expect(new Headers(request.init?.headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("lista CEDIS y desenvuelve data.items", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({ items: [{ id: "cedis-1", name: "CEDIS Centro" }] }),
    );

    await expect(
      cedisService.listLocations(
        { isActive: true, limit: 100, page: 1, type: "DISTRIBUTION_CENTER" },
        "access-token",
      ),
    ).resolves.toEqual([{ id: "cedis-1", name: "CEDIS Centro" }]);
  });

  it("envía Idempotency-Key en operaciones de abastecimiento y conciliación", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okJson({ id: "transfer-1" }))
      .mockResolvedValueOnce(okJson({ id: "cycle-1" }));

    await cedisService.createSupply(
      "cycle-1",
      {
        expectedVersion: 2,
        items: [{ productId: "product-1", unit: "KG", quantityKg: 5 }],
      },
      "access-token",
      "idem-supply",
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get(
        "idempotency-key",
      ),
    ).toBe("idem-supply");

    await cedisService.refreshCycle(
      "cycle-1",
      { expectedVersion: 2 },
      "access-token",
      "idem-refresh",
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).get(
        "idempotency-key",
      ),
    ).toBe("idem-refresh");
  });

  it("consulta envíos entrantes y conserva la clave de idempotencia al recibir", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        okJson({ items: [], total: 0, page: 1, limit: 25, totalPages: 0 }),
      )
      .mockResolvedValueOnce(okJson({ id: "transfer-1", status: "RECEIVED" }));

    await cedisService.listIncomingSupplies(
      { businessDate: "2026-08-05", status: "PENDING", page: 1, limit: 25 },
      "access-token",
    );
    expect(lastRequest().url).toBe(
      "/api/cedis/incoming-supplies?businessDate=2026-08-05&status=PENDING&page=1&limit=25",
    );

    await cedisService.receiveIncomingSupply(
      "transfer-1",
      {
        expectedCycleVersion: 2,
        notes: "Recepción exacta",
        items: [{ transferItemId: "item-1", quantityKg: 5, quantityPieces: 0 }],
      },
      "access-token",
      "idem-receipt",
    );
    const request = lastRequest();
    expect(request.url).toBe("/api/cedis/incoming-supplies/transfer-1/receive");
    expect(new Headers(request.init?.headers).get("idempotency-key")).toBe(
      "idem-receipt",
    );
  });
});
