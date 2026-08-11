import { beforeEach, describe, expect, it, vi } from "vitest";
import { productService } from "../services/productService";

const post = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", () => ({
  apiClient: { post },
}));

describe("productService inventory adjustment commands", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: { id: "movement-1" } });
  });

  it("envía la clave de idempotencia al registrar un ajuste", async () => {
    await productService.createAdjustment(
      {
        productId: "product-1",
        locationId: "location-1",
        type: "ADJUSTMENT",
        unit: "KG",
        quantityKg: 2.5,
        quantityPieces: 0,
        reason: "Physical count correction",
      },
      "access-token",
      "adjustment-key",
    );

    expect(post).toHaveBeenCalledWith("/inventory/adjustments", {
      body: expect.objectContaining({ productId: "product-1" }),
      headers: {
        "Idempotency-Key": "adjustment-key",
        authorization: "Bearer access-token",
      },
    });
  });
});
