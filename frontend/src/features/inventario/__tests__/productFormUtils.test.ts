import { describe, expect, it } from "vitest";
import {
  formatDecimalDisplay,
  hasProductFormErrors,
  normalizeDecimalInput,
  toProductFormDraft,
  toProductFormValues,
  validateProductForm,
} from "../productFormUtils";
import type { ProductFormDraft } from "../productFormUtils";

function commercialDraft(
  overrides: Partial<ProductFormDraft> = {},
): ProductFormDraft {
  return {
    name: "Pechuga de pollo",
    sku: "PECH-001",
    description: "Pechuga por kilogramo",
    categoryId: "",
    presentationType: "CUT",
    salePrice: "120",
    purchaseCost: "90",
    minStock: "10",
    unit: "KG",
    pieceWeightEquivalent: "",
    equivalentPolicyStatus: "DRAFT",
    satProductServiceCode: "",
    satUnitCode: "",
    taxObjectCode: "",
    defaultTaxCode: "",
    defaultFactorType: "",
    defaultRateOrQuota: "",
    ...overrides,
  };
}

describe("product fiscal profile form", () => {
  it("keeps the fiscal rate or quota precision at six decimals", () => {
    expect(normalizeDecimalInput("0.123456", 6)).toBe("0.123456");
    expect(formatDecimalDisplay("0.123456", 6)).toBe("0.123456");
  });

  it("allows a normal product without fiscal configuration", () => {
    const draft = commercialDraft();

    expect(hasProductFormErrors(validateProductForm(draft))).toBe(false);
    expect(toProductFormValues(draft)).toEqual(
      expect.objectContaining({
        unit: "KG",
        satProductServiceCode: null,
        satUnitCode: null,
        taxObjectCode: null,
        defaultTaxCode: null,
        defaultFactorType: null,
        defaultRateOrQuota: null,
      }),
    );
  });

  it("round-trips a complete fiscal profile without changing the operational unit", () => {
    const draft = commercialDraft({
      satProductServiceCode: "10101500",
      satUnitCode: "KGM",
      taxObjectCode: "02",
      defaultTaxCode: "002",
      defaultFactorType: "Tasa",
      defaultRateOrQuota: "0.160000",
    });

    expect(hasProductFormErrors(validateProductForm(draft))).toBe(false);
    expect(toProductFormValues(draft)).toEqual(
      expect.objectContaining({
        unit: "KG",
        satProductServiceCode: "10101500",
        satUnitCode: "KGM",
        taxObjectCode: "02",
        defaultTaxCode: "002",
        defaultFactorType: "Tasa",
        defaultRateOrQuota: 0.16,
      }),
    );
  });

  it.each([
    ["ClaveProdServ", { satProductServiceCode: "123" }],
    ["ClaveUnidad", { satUnitCode: "kilogram" }],
    ["ObjetoImp", { taxObjectCode: "99" }],
    ["Impuesto", { defaultTaxCode: "999" }],
    ["TipoFactor", { defaultFactorType: "Rate" }],
    ["TasaOCuota", { defaultRateOrQuota: "1.1234567" }],
  ])("flags invalid %s values", (_field, overrides) => {
    expect(
      hasProductFormErrors(
        validateProductForm(
          commercialDraft(overrides as Partial<ProductFormDraft>),
        ),
      ),
    ).toBe(true);
  });

  it("loads legacy products with an empty incomplete fiscal draft", () => {
    const draft = toProductFormDraft({
      id: "product-1",
      name: "Pollo entero",
      salePrice: 85,
      unit: "PIECE",
      isActive: true,
    });

    expect(draft.unit).toBe("PIECE");
    expect(draft.satProductServiceCode).toBe("");
    expect(draft.satUnitCode).toBe("");
    expect(draft.defaultRateOrQuota).toBe("");
  });
});
