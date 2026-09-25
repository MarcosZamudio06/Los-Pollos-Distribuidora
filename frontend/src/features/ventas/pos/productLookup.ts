import { parseProductQrPayload } from "../../../../../shared/product-qr";
import type { ProductOption } from "../types";

export function findProductByLookup(
  products: ProductOption[],
  value: string,
): ProductOption | undefined {
  const normalizedValue = value.trim();
  if (!normalizedValue) return undefined;

  const qrProductId = parseProductQrPayload(normalizedValue);
  if (qrProductId) {
    return products.find((product) => product.id === qrProductId);
  }

  const caseInsensitiveValue = normalizedValue.toLowerCase();
  return (
    products.find(
      (product) =>
        product.barcode?.trim().toLowerCase() === caseInsensitiveValue,
    ) ??
    products.find(
      (product) => product.sku?.trim().toLowerCase() === caseInsensitiveValue,
    ) ??
    products.find(
      (product) =>
        product.name.trim().toLowerCase() === caseInsensitiveValue,
    )
  );
}
