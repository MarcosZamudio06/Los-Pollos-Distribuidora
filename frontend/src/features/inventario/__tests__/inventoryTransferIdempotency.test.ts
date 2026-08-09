import { beforeEach, describe, expect, it, vi } from "vitest";
import { productService } from "../services/productService";

const post = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", () => ({
  apiClient: { post },
}));

describe("productService inventory transfer commands", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: { id: "transfer-1" } });
  });

  it("envía Idempotency-Key al confirmar y cancelar transferencias", async () => {
    await productService.confirmTransfer(
      "transfer-1",
      "access-token",
      "confirm-key",
    );
    await productService.cancelTransfer(
      "transfer-1",
      "Duplicado",
      "access-token",
      "cancel-key",
    );

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/inventory-transfers/transfer-1/confirm",
      {
        headers: {
          "Idempotency-Key": "confirm-key",
          authorization: "Bearer access-token",
        },
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/inventory-transfers/transfer-1/cancel",
      {
        body: { reason: "Duplicado" },
        headers: {
          "Idempotency-Key": "cancel-key",
          authorization: "Bearer access-token",
        },
      },
    );
  });
});
