const PRODUCT_QR_PREFIX = "ERP:PRODUCT:1:";
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PRODUCT_ID_PATTERN_SOURCE = "[A-Za-z0-9][A-Za-z0-9_-]*";
const PRODUCT_QR_PATTERN = new RegExp(
  `^${PRODUCT_QR_PREFIX}(${PRODUCT_ID_PATTERN_SOURCE})$`,
);

function assertProductId(productId: string): void {
  if (!PRODUCT_ID_PATTERN.test(productId)) {
    throw new Error("productId must contain only identifier characters");
  }
}

export function buildProductQrPayload(productId: string): string {
  if (typeof productId !== "string") {
    throw new TypeError("productId must be a string");
  }

  assertProductId(productId);
  return `${PRODUCT_QR_PREFIX}${productId}`;
}

export function parseProductQrPayload(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match = PRODUCT_QR_PATTERN.exec(value);
  return match?.[1] ?? null;
}
