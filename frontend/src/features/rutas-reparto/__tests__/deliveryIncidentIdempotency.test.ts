import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryService } from "../deliveryService";

describe("delivery incident idempotency", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("crypto", { randomUUID: () => "generated-attempt-key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the caller-owned key so a lost-response retry can reuse it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            deliveryOrder: { id: "order-1", status: "RETURNED" },
            incident: { id: "incident-1" },
            inventoryMovements: [],
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await deliveryService.createOrderIncident(
      "order-1",
      { reason: "Cliente devolvió producto", status: "RETURNED" },
      "incident-retry-key",
      "access-token",
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("idempotency-key")).toBe("incident-retry-key");
    expect(headers.get("authorization")).toBe("Bearer access-token");
  });

  it("sends the caller-owned key when opening a route settlement", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: "settlement-1" } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await deliveryService.openSettlement(
      "route-1",
      "settlement-retry-key",
      "access-token",
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("idempotency-key")).toBe("settlement-retry-key");
    expect(headers.get("authorization")).toBe("Bearer access-token");
  });
});
