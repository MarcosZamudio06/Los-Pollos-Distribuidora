import type {
  EquivalentPolicyStatus,
  OperationalUnit,
  Product,
  ProductFormValues,
  ProductFactorType,
  ProductTaxCode,
  ProductTaxObjectCode,
  ProductPresentation,
} from "./types";
import {
  isValidSatProductFactorType,
  isValidSatProductServiceCode,
  isValidSatProductTaxCode,
  isValidSatProductTaxObjectCode,
  isValidSatUnitCode,
  normalizeProductFactorType,
} from "../../../../shared/product-fiscal-catalog";

export type ProductFormDraft = Omit<
  ProductFormValues,
  | "presentationType"
  | "salePrice"
  | "purchaseCost"
  | "minStock"
  | "unit"
  | "pieceWeightEquivalent"
  | "equivalentPolicyStatus"
  | "satProductServiceCode"
  | "satUnitCode"
  | "taxObjectCode"
  | "defaultTaxCode"
  | "defaultFactorType"
  | "defaultRateOrQuota"
> & {
  presentationType: ProductPresentation | "";
  salePrice: string;
  purchaseCost: string;
  minStock: string;
  unit: OperationalUnit | "";
  pieceWeightEquivalent: string;
  equivalentPolicyStatus: EquivalentPolicyStatus | "";
  satProductServiceCode: string;
  satUnitCode: string;
  taxObjectCode: ProductTaxObjectCode | "";
  defaultTaxCode: ProductTaxCode | "";
  defaultFactorType: ProductFactorType | "";
  defaultRateOrQuota: string;
};

export type ProductFormField =
  | "name"
  | "sku"
  | "description"
  | "categoryId"
  | "presentationType"
  | "salePrice"
  | "purchaseCost"
  | "minStock"
  | "unit"
  | "pieceWeightEquivalent"
  | "equivalentPolicyStatus"
  | "satProductServiceCode"
  | "satUnitCode"
  | "taxObjectCode"
  | "defaultTaxCode"
  | "defaultFactorType"
  | "defaultRateOrQuota";

export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

const MULTIPLE_SPACES = /\s+/g;
const SKU_ALLOWED = /[^A-Z0-9-]/g;
const PRODUCT_PRESENTATIONS = new Set<ProductPresentation>([
  "KG",
  "WHOLE",
  "CUT",
]);
const OPERATIONAL_UNITS = new Set<OperationalUnit>([
  "KG",
  "PIECE",
  "KG_AND_PIECE",
]);
const EQUIVALENT_POLICY_STATUSES = new Set<EquivalentPolicyStatus>([
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
]);

export function collapseSpaces(value: string) {
  return value.replace(MULTIPLE_SPACES, " ").trim();
}

export function cleanSku(value: string) {
  return value.toUpperCase().replace(SKU_ALLOWED, "");
}

export function normalizeDecimalInput(value: string, maxDecimals: number) {
  const safeMaxDecimals = Math.max(0, maxDecimals);
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return "";

  const hasDecimalPoint = cleaned.includes(".");
  const [wholePart, ...fractionalParts] = cleaned.split(".");
  const safeWhole = wholePart.replace(/-/g, "").replace(/^0+(?=\d)/, "") || "0";
  const safeFraction = fractionalParts
    .join("")
    .replace(/\D/g, "")
    .slice(0, safeMaxDecimals);

  if (safeMaxDecimals === 0) return safeWhole;
  if (hasDecimalPoint && safeFraction === "") return `${safeWhole}.`;
  return safeFraction ? `${safeWhole}.${safeFraction}` : safeWhole;
}

export function formatDecimalDisplay(value: string, maxDecimals: number) {
  const normalized = normalizeDecimalInput(value, maxDecimals);
  if (!normalized || normalized === "0.") return normalized === "0." ? "0" : "";

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: maxDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(amount);
}

export function parseDecimalValue(value: string, maxDecimals: number) {
  const normalized = normalizeDecimalInput(value, maxDecimals);
  if (!normalized || normalized.endsWith(".")) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function normalizeCurrencyInput(value: string) {
  return normalizeDecimalInput(value, 2);
}

export function formatCurrencyDisplay(value: string) {
  return formatDecimalDisplay(value, 2);
}

export function parseCurrencyValue(value: string) {
  return parseDecimalValue(value, 2);
}

function equivalentPolicyStatus(
  product?: Product | null,
): EquivalentPolicyStatus {
  const value =
    product?.equivalentPolicyStatus ??
    product?.equivalencePolicyStatus ??
    "DRAFT";
  return value === "ACTIVE" || value === "INACTIVE" || value === "DRAFT"
    ? value
    : "DRAFT";
}

function normalizeProductPresentation(
  value?: ProductPresentation | null,
): ProductPresentation {
  return value && PRODUCT_PRESENTATIONS.has(value) ? value : "KG";
}

function normalizeOperationalUnit(
  value?: OperationalUnit | null,
): OperationalUnit {
  return value && OPERATIONAL_UNITS.has(value) ? value : "KG";
}

function numericDraftValue(
  value: number | null | undefined,
  maxDecimals: number,
) {
  return value == null ? "" : normalizeDecimalInput(String(value), maxDecimals);
}

function fiscalCodeDraftValue(value?: string | null) {
  return value?.trim().toUpperCase() ?? "";
}

function factorTypeDraftValue(value?: ProductFactorType | null) {
  if (!value) return "";
  return normalizeProductFactorType(value);
}

export function toProductFormDraft(product?: Product | null): ProductFormDraft {
  return {
    name: collapseSpaces(product?.name ?? ""),
    sku: cleanSku(product?.sku ?? ""),
    description: collapseSpaces(product?.description ?? ""),
    categoryId: collapseSpaces(product?.categoryId ?? ""),
    presentationType: normalizeProductPresentation(
      product?.presentationType ?? product?.presentation,
    ),
    salePrice: numericDraftValue(product?.salePrice ?? 0, 2),
    purchaseCost: numericDraftValue(
      product?.purchaseCost ?? product?.cost ?? 0,
      2,
    ),
    minStock: numericDraftValue(product?.minStock ?? 0, 2),
    unit: normalizeOperationalUnit(product?.unit ?? product?.operationalUnit),
    pieceWeightEquivalent: numericDraftValue(
      product?.pieceWeightEquivalent ?? product?.equivalentWeightKg,
      3,
    ),
    equivalentPolicyStatus: equivalentPolicyStatus(product),
    satProductServiceCode: fiscalCodeDraftValue(product?.satProductServiceCode),
    satUnitCode: fiscalCodeDraftValue(product?.satUnitCode),
    taxObjectCode: fiscalCodeDraftValue(product?.taxObjectCode) as
      ProductTaxObjectCode | "",
    defaultTaxCode: fiscalCodeDraftValue(product?.defaultTaxCode) as
      ProductTaxCode | "",
    defaultFactorType: factorTypeDraftValue(product?.defaultFactorType),
    defaultRateOrQuota: numericDraftValue(product?.defaultRateOrQuota, 6),
  };
}

export function toProductFormValues(
  draft: ProductFormDraft,
): ProductFormValues {
  return {
    name: collapseSpaces(draft.name),
    sku: cleanSku(draft.sku).trim(),
    description: collapseSpaces(draft.description),
    categoryId: collapseSpaces(draft.categoryId),
    presentationType: draft.presentationType || "KG",
    salePrice: parseCurrencyValue(draft.salePrice) ?? 0,
    purchaseCost: parseCurrencyValue(draft.purchaseCost) ?? 0,
    minStock:
      parseDecimalValue(draft.minStock, draft.unit === "PIECE" ? 0 : 2) ?? 0,
    unit: draft.unit || "KG",
    pieceWeightEquivalent: parseDecimalValue(draft.pieceWeightEquivalent, 3),
    equivalentPolicyStatus: draft.equivalentPolicyStatus || "DRAFT",
    satProductServiceCode: draft.satProductServiceCode.trim() || null,
    satUnitCode: draft.satUnitCode.trim().toUpperCase() || null,
    taxObjectCode: draft.taxObjectCode || null,
    defaultTaxCode: draft.defaultTaxCode || null,
    defaultFactorType: draft.defaultFactorType || null,
    defaultRateOrQuota: parseDecimalValue(draft.defaultRateOrQuota, 6),
  };
}

function hasValidDecimalPrecision(value: string, maxDecimals: number) {
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return false;
  const [, ...fractionalParts] = cleaned.split(".");
  const fraction = fractionalParts.join("").replace(/\D/g, "");
  return fraction.length <= maxDecimals;
}

function isIntegerDecimal(value: number) {
  return Number.isInteger(value);
}

export function validateProductField(
  field: ProductFormField,
  draft: ProductFormDraft,
) {
  switch (field) {
    case "name": {
      const value = collapseSpaces(draft.name);
      if (!value) return "El nombre del producto es obligatorio.";
      if (value.length < 3 || value.length > 120)
        return "El nombre del producto debe tener entre 3 y 120 caracteres.";
      return null;
    }
    case "sku": {
      const value = cleanSku(draft.sku).trim();
      if (!value) return null;
      if (value.length > 40) return "El SKU no debe exceder 40 caracteres.";
      return /^[-A-Z0-9]+$/.test(value)
        ? null
        : "El SKU solo permite letras, números y guiones.";
    }
    case "description": {
      const value = collapseSpaces(draft.description);
      return value.length > 500
        ? "La descripción no debe exceder 500 caracteres."
        : null;
    }
    case "categoryId":
      return collapseSpaces(draft.categoryId).length > 120
        ? "El ID de categoría no debe exceder 120 caracteres."
        : null;
    case "presentationType":
      return draft.presentationType &&
        PRODUCT_PRESENTATIONS.has(draft.presentationType)
        ? null
        : "Selecciona una presentación válida.";
    case "salePrice": {
      const value = parseCurrencyValue(draft.salePrice);
      if (value === null) return "El precio de venta es obligatorio.";
      if (!hasValidDecimalPrecision(draft.salePrice, 2))
        return "El precio de venta permite hasta 2 decimales.";
      return value > 0 ? null : "El precio de venta debe ser mayor que cero.";
    }
    case "purchaseCost": {
      const value = parseCurrencyValue(draft.purchaseCost);
      if (value === null) return "El costo de compra es obligatorio.";
      if (!hasValidDecimalPrecision(draft.purchaseCost, 2))
        return "El costo de compra permite hasta 2 decimales.";
      return value >= 0 ? null : "El costo de compra no puede ser negativo.";
    }
    case "unit":
      return draft.unit && OPERATIONAL_UNITS.has(draft.unit)
        ? null
        : "Selecciona una unidad operativa válida.";
    case "minStock": {
      const maxDecimals = draft.unit === "PIECE" ? 0 : 2;
      const value = parseDecimalValue(draft.minStock, maxDecimals);
      if (value === null) return "El mínimo comercial es obligatorio.";
      if (value < 0) return "El mínimo comercial no puede ser negativo.";
      if (draft.unit === "PIECE" && !isIntegerDecimal(value))
        return "El mínimo comercial debe ser entero cuando la unidad es pieza.";
      return null;
    }
    case "pieceWeightEquivalent": {
      if (!draft.pieceWeightEquivalent) return null;
      const value = parseDecimalValue(draft.pieceWeightEquivalent, 3);
      if (value === null)
        return "La equivalencia kg por pieza debe ser numérica.";
      if (!hasValidDecimalPrecision(draft.pieceWeightEquivalent, 3))
        return "La equivalencia permite hasta 3 decimales.";
      return value > 0
        ? null
        : "La equivalencia de kg por pieza debe ser mayor que cero cuando se captura.";
    }
    case "equivalentPolicyStatus":
      return draft.equivalentPolicyStatus &&
        EQUIVALENT_POLICY_STATUSES.has(draft.equivalentPolicyStatus)
        ? null
        : "Selecciona una política de equivalencia válida.";
    case "satProductServiceCode":
      if (!draft.satProductServiceCode) return null;
      return isValidSatProductServiceCode(draft.satProductServiceCode)
        ? null
        : "La ClaveProdServ debe contener exactamente ocho dígitos.";
    case "satUnitCode":
      if (!draft.satUnitCode) return null;
      return isValidSatUnitCode(draft.satUnitCode)
        ? null
        : "La ClaveUnidad debe contener dos o tres caracteres SAT.";
    case "taxObjectCode":
      if (!draft.taxObjectCode) return null;
      return isValidSatProductTaxObjectCode(draft.taxObjectCode)
        ? null
        : "Selecciona un ObjetoImp válido del catálogo SAT.";
    case "defaultTaxCode":
      if (!draft.defaultTaxCode) return null;
      return isValidSatProductTaxCode(draft.defaultTaxCode)
        ? null
        : "Selecciona un impuesto SAT válido.";
    case "defaultFactorType":
      if (!draft.defaultFactorType) return null;
      return isValidSatProductFactorType(draft.defaultFactorType)
        ? null
        : "Selecciona un TipoFactor válido del catálogo SAT.";
    case "defaultRateOrQuota": {
      if (!draft.defaultRateOrQuota) return null;
      const value = parseDecimalValue(draft.defaultRateOrQuota, 6);
      if (value === null) return "La tasa o cuota debe ser numérica.";
      if (!hasValidDecimalPrecision(draft.defaultRateOrQuota, 6))
        return "La tasa o cuota permite hasta 6 decimales.";
      return value >= 0 ? null : "La tasa o cuota no puede ser negativa.";
    }
    default:
      return null;
  }
}

export function validateProductForm(draft: ProductFormDraft) {
  const fields: ProductFormField[] = [
    "name",
    "sku",
    "description",
    "categoryId",
    "presentationType",
    "salePrice",
    "purchaseCost",
    "minStock",
    "unit",
    "pieceWeightEquivalent",
    "equivalentPolicyStatus",
    "satProductServiceCode",
    "satUnitCode",
    "taxObjectCode",
    "defaultTaxCode",
    "defaultFactorType",
    "defaultRateOrQuota",
  ];

  return fields.reduce<ProductFormErrors>((accumulator, field) => {
    const error = validateProductField(field, draft);
    if (error) accumulator[field] = error;
    return accumulator;
  }, {});
}

export function hasProductFormErrors(errors: ProductFormErrors) {
  return Object.values(errors).some(Boolean);
}

export function firstProductFormErrorField(errors: ProductFormErrors) {
  return (Object.keys(errors) as ProductFormField[]).find((field) =>
    Boolean(errors[field]),
  );
}
