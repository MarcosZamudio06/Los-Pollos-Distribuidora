import { describe, expect, it } from "vitest";
import { buildProductQrPayload } from "../../../../../shared/product-qr";
import { findProductByLookup } from "./productLookup";
import type { ProductOption } from "../types";

const products: ProductOption[] = [
  {
    id: "product-qr",
    name: "Producto QR",
    sku: "SKU-QR",
    barcode: "BARCODE-QR",
    presentationType: "CUT",
    unit: "PIECE",
    salePrice: 10,
    unitPrice: 10,
    locationId: "location-1",
    availableKg: 0,
    availablePieces: 5,
  },
  {
    id: "product-barcode",
    name: "Producto barcode",
    sku: "SKU-BARCODE",
    barcode: "BARCODE-OTHER",
    presentationType: "CUT",
    unit: "PIECE",
    salePrice: 10,
    unitPrice: 10,
    locationId: "location-1",
    availableKg: 0,
    availablePieces: 5,
  },
];

describe("POS product lookup", () => {
  it("resolves a valid QR by product id before barcode, SKU, and name", () => {
    const priorityProducts = [
      products[0],
      { ...products[1], barcode: "ERP:PRODUCT:1:product-qr" },
    ];
    expect(
      findProductByLookup(
        priorityProducts,
        buildProductQrPayload("product-qr"),
      ),
    ).toBe(priorityProducts[0]);
  });

  it("preserves barcode, SKU, and exact-name lookup compatibility", () => {
    expect(findProductByLookup(products, "barCODE-other")).toBe(products[1]);
    expect(findProductByLookup(products, "sku-qr")).toBe(products[0]);
    expect(findProductByLookup(products, "PRODUCTO QR")).toBe(products[0]);
  });
});
