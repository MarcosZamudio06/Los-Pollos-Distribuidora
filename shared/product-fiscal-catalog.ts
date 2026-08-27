/**
 * CFDI 4.0 product-profile catalog snapshot.
 *
 * These controlled values are retained only for compatibility with existing
 * product forms. The versioned SatCatalog tables are authoritative when an
 * import is active; `c_ClaveProdServ` and `c_ClaveUnidad` are not inferred or
 * treated as complete SAT datasets by this module.
 */

export const SAT_PRODUCT_TAX_OBJECT_CODES = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
] as const;

export const SAT_PRODUCT_TAX_CODES = ["001", "002", "003"] as const;

export const SAT_PRODUCT_FACTOR_TYPES = ["Tasa", "Cuota", "Exento"] as const;

export type ProductTaxObjectCode =
  (typeof SAT_PRODUCT_TAX_OBJECT_CODES)[number];
export type ProductTaxCode = (typeof SAT_PRODUCT_TAX_CODES)[number];
export type ProductFactorType = (typeof SAT_PRODUCT_FACTOR_TYPES)[number];

export const PRODUCT_FISCAL_PROFILE_FIELDS = [
  "satProductServiceCode",
  "satUnitCode",
  "taxObjectCode",
  "defaultTaxCode",
  "defaultFactorType",
  "defaultRateOrQuota",
] as const;

export type ProductFiscalProfileField =
  (typeof PRODUCT_FISCAL_PROFILE_FIELDS)[number];

export type ProductFiscalProfileSource = Partial<
  Record<ProductFiscalProfileField, unknown>
>;

export const PRODUCT_FISCAL_PROFILE_INCOMPLETE_CODE =
  "CFDI_PRODUCT_PROFILE_INCOMPLETE" as const;

function hasValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim().length > 0;
}

export function missingProductFiscalProfileFields(
  source: ProductFiscalProfileSource,
): ProductFiscalProfileField[] {
  return PRODUCT_FISCAL_PROFILE_FIELDS.filter(
    (field) => !hasValue(source[field]),
  );
}

export function isProductFiscalProfileComplete(
  source: ProductFiscalProfileSource,
): boolean {
  return missingProductFiscalProfileFields(source).length === 0;
}

export function productFiscalProfileStatus(source: ProductFiscalProfileSource) {
  const missingFields = missingProductFiscalProfileFields(source);
  const isComplete = missingFields.length === 0;

  return {
    status: isComplete ? ("COMPLETE" as const) : ("INCOMPLETE" as const),
    isComplete,
    missingFields,
    validationCode: isComplete ? null : PRODUCT_FISCAL_PROFILE_INCOMPLETE_CODE,
  };
}

export function normalizeProductFiscalCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeProductFactorType(value: string): ProductFactorType {
  const normalized = value.trim().toLowerCase();
  const match = SAT_PRODUCT_FACTOR_TYPES.find(
    (factorType) => factorType.toLowerCase() === normalized,
  );

  return match ?? (value.trim() as ProductFactorType);
}

export function isValidSatProductServiceCode(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidSatUnitCode(value: string): boolean {
  return /^[A-Z0-9]{2,3}$/.test(value.trim().toUpperCase());
}

export function isValidSatProductTaxObjectCode(value: string): boolean {
  return SAT_PRODUCT_TAX_OBJECT_CODES.includes(
    normalizeProductFiscalCode(value) as ProductTaxObjectCode,
  );
}

export function isValidSatProductTaxCode(value: string): boolean {
  return SAT_PRODUCT_TAX_CODES.includes(
    normalizeProductFiscalCode(value) as ProductTaxCode,
  );
}

export function isValidSatProductFactorType(value: string): boolean {
  return SAT_PRODUCT_FACTOR_TYPES.some(
    (factorType) => factorType.toLowerCase() === value.trim().toLowerCase(),
  );
}
