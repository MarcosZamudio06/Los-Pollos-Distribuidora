import { describe, expect, it } from "vitest";
import {
  buildProductQrPayload,
  parseProductQrPayload,
} from "../../../shared/product-qr";

describe("product QR contract", () => {
  it("builds and parses the versioned product payload", () => {
    const payload = buildProductQrPayload("cm123456");

    expect(payload).toBe("ERP:PRODUCT:1:cm123456");
    expect(parseProductQrPayload(payload)).toBe("cm123456");
  });

  it.each([
    "ERP:PRODUCT:2:cm123456",
    "ERP:product:1:cm123456",
    "ERP:PRODUCT:1:",
    "ERP:PRODUCT:1:cm123456:extra",
    " ERP:PRODUCT:1:cm123456",
    "ERP:PRODUCT:1:cm 123456",
    null,
    42,
  ])("rejects invalid payload %p", (value) => {
    expect(parseProductQrPayload(value)).toBeNull();
  });

  it.each(["", " cm123456", "cm:123456", "cm/123456"]) (
    "rejects invalid product id %p when building",
    (productId) => {
      expect(() => buildProductQrPayload(productId)).toThrow();
    },
  );
});
