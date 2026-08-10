import { afterEach, describe, expect, it, vi } from "vitest";
import { productService } from "../services/productService";
import type { Product } from "../types";

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({ apiClient }));

const zeroBalanceProduct: Product = {
  id: "product-1",
  name: "Pollo entero",
  sku: "POL-001",
  categoryId: "category-1",
  presentationType: "WHOLE",
  salePrice: 85,
  minStock: 0,
  unit: "KG",
  pieceWeightEquivalent: null,
  equivalentPolicyStatus: "DRAFT",
  isActive: true,
  inventoryBalance: {
    locationId: "branch-1",
    quantityKg: 0,
    quantityPieces: 0,
    reservedQuantityKg: 0,
    reservedQuantityPieces: 0,
    availableQuantityKg: 0,
    availableQuantityPieces: 0,
    minQuantityKg: 0,
    minQuantityPieces: 0,
    isLowStock: false,
  },
};

const decimalWeightProduct: Product = {
  ...zeroBalanceProduct,
  id: "product-weight",
  name: "Pechuga por peso",
  inventoryBalance: {
    ...zeroBalanceProduct.inventoryBalance!,
    quantityKg: 12.75,
    reservedQuantityKg: 2.25,
    availableQuantityKg: 10.5,
    minQuantityKg: 5,
  },
};

const invalidNegativeBalanceProduct: Product = {
  ...zeroBalanceProduct,
  id: "product-invalid-negative",
  inventoryBalance: {
    ...zeroBalanceProduct.inventoryBalance!,
    quantityKg: -1,
    availableQuantityKg: -1,
  },
};

const invalidFractionalPieceProduct: Product = {
  ...zeroBalanceProduct,
  id: "product-invalid-fractional-piece",
  unit: "PIECE",
  inventoryBalance: {
    ...zeroBalanceProduct.inventoryBalance!,
    quantityKg: 0,
    reservedQuantityKg: 0,
    availableQuantityKg: 0,
    quantityPieces: 1.5,
    availableQuantityPieces: 1.5,
    minQuantityKg: 0,
    minQuantityPieces: 0,
  },
};

describe("productService canonical product responses", () => {
  afterEach(() => {
    apiClient.get.mockReset();
  });

  it("preserves generic catalog responses without operational validation", async () => {
    const catalogProduct = {
      id: "catalog-product-1",
      name: "Producto de catálogo",
      salePrice: 85,
      unit: "KG",
      isActive: true,
    } as Product;
    apiClient.get.mockResolvedValue({ data: { items: [catalogProduct] } });

    await expect(
      productService.listProducts(
        { isActive: "true", locationId: "branch-1" },
        "token",
      ),
    ).resolves.toEqual([catalogProduct]);
  });

  it("keeps registered zero balances and valid decimal weight balances", async () => {
    apiClient.get.mockResolvedValue({
      data: { items: [zeroBalanceProduct, decimalWeightProduct] },
    });

    await expect(
      productService.listProducts(
        {
          isActive: "true",
          locationId: "branch-1",
          requireInventoryBalance: true,
        },
        "token",
      ),
    ).resolves.toEqual([zeroBalanceProduct, decimalWeightProduct]);
  });

  it("rejects a mixed response when one balance is semantically invalid", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        items: [zeroBalanceProduct, decimalWeightProduct, invalidNegativeBalanceProduct],
      },
    });

    await expect(
      productService.listProducts(
        {
          locationId: "branch-1",
          requireInventoryBalance: true,
        },
        "token",
      ),
    ).rejects.toThrow("saldo canónico");
  });

  it.each([
    {
      name: "negative reserved quantity",
      product: {
        ...zeroBalanceProduct,
        id: "product-invalid-reserved-negative",
        inventoryBalance: {
          ...zeroBalanceProduct.inventoryBalance!,
          reservedQuantityKg: -1,
        },
      },
    },
    {
      name: "reserved quantity greater than physical quantity",
      product: {
        ...zeroBalanceProduct,
        id: "product-invalid-reserved-overage",
        inventoryBalance: {
          ...zeroBalanceProduct.inventoryBalance!,
          quantityKg: 1,
          reservedQuantityKg: 2,
          availableQuantityKg: 0,
        },
      },
    },
    {
      name: "inconsistent available quantity",
      product: {
        ...zeroBalanceProduct,
        id: "product-invalid-available-inconsistent",
        inventoryBalance: {
          ...zeroBalanceProduct.inventoryBalance!,
          quantityKg: 10,
          reservedQuantityKg: 2,
          availableQuantityKg: 7,
        },
      },
    },
    {
      name: "negative available quantity",
      product: {
        ...zeroBalanceProduct,
        id: "product-invalid-available-negative",
        inventoryBalance: {
          ...zeroBalanceProduct.inventoryBalance!,
          quantityKg: 1,
          availableQuantityKg: -1,
        },
      },
    },
    {
      name: "fractional piece quantity",
      product: invalidFractionalPieceProduct,
    },
    {
      name: "inconsistent low stock flag",
      product: {
        ...zeroBalanceProduct,
        id: "product-invalid-low-stock",
        inventoryBalance: {
          ...zeroBalanceProduct.inventoryBalance!,
          quantityKg: 1,
          availableQuantityKg: 1,
          minQuantityKg: 2,
          isLowStock: false,
        },
      },
    },
  ])("rejects $name", async ({ product }) => {
    apiClient.get.mockResolvedValue({ data: { items: [product] } });

    await expect(
      productService.listProducts(
        { locationId: "branch-1", requireInventoryBalance: true },
        "token",
      ),
    ).rejects.toThrow("saldo canónico");
  });

  it("rejects a transfer-shaped partial product response", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        items: [
          {
            id: "transfer-item-1",
            name: "Pollo de embarque",
            unit: "KG",
            isActive: true,
            inventoryBalance: zeroBalanceProduct.inventoryBalance,
          },
        ],
      },
    });

    await expect(
      productService.listProducts(
        {
          isActive: "true",
          locationId: "branch-1",
          requireInventoryBalance: true,
        },
        "token",
      ),
    ).rejects.toThrow("contrato canónico");
  });

  it("rejects a product with a malformed source balance", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        items: [
          {
            ...zeroBalanceProduct,
            inventoryBalance: {
              locationId: "branch-1",
              quantityKg: 0,
            },
          },
        ],
      },
    });

    await expect(
      productService.listProducts(
        {
          locationId: "branch-1",
          requireInventoryBalance: true,
        },
        "token",
      ),
    ).rejects.toThrow("saldo canónico");
  });
});
