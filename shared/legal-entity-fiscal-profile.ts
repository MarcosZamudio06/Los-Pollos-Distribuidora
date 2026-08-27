import {
  isStructurallyValidFiscalRfc,
  isValidMexicanFiscalPostalCode,
  isValidSatFiscalRegime,
  normalizeFiscalTaxId,
} from "./fiscal-catalog";

export const LEGAL_ENTITY_FISCAL_PROFILE_FIELDS = [
  "legalName",
  "taxId",
  "fiscalPostalCode",
  "fiscalRegime",
  "defaultSeries",
  "certificateSerialNumber",
  "certificateFingerprint",
  "certificateValidFrom",
  "certificateValidTo",
] as const;

export type LegalEntityFiscalProfileField =
  (typeof LEGAL_ENTITY_FISCAL_PROFILE_FIELDS)[number];

export type LegalEntityFiscalProfileSource = Partial<
  Record<LegalEntityFiscalProfileField, unknown>
>;

export const LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE =
  "CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE" as const;

export const LEGAL_ENTITY_CERTIFICATE_EXPIRED =
  "CFDI_LEGAL_ENTITY_CERTIFICATE_EXPIRED" as const;

export const LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID =
  "CFDI_LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID" as const;

export type LegalEntityFiscalProfileValidationCode =
  | typeof LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE
  | typeof LEGAL_ENTITY_CERTIFICATE_EXPIRED
  | typeof LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID;

export function isValidLegalEntityDefaultSeries(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{0,9}$/.test(value.trim());
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function missingLegalEntityFiscalProfileFields(
  source: LegalEntityFiscalProfileSource,
): LegalEntityFiscalProfileField[] {
  const missing: LegalEntityFiscalProfileField[] = [];

  if (!hasText(source.legalName)) missing.push("legalName");

  if (!hasText(source.taxId)) {
    missing.push("taxId");
  } else if (
    !isStructurallyValidFiscalRfc(normalizeFiscalTaxId(source.taxId))
  ) {
    missing.push("taxId");
  }

  if (
    !hasText(source.fiscalPostalCode) ||
    !isValidMexicanFiscalPostalCode(source.fiscalPostalCode)
  ) {
    missing.push("fiscalPostalCode");
  }

  if (
    !hasText(source.fiscalRegime) ||
    !isValidSatFiscalRegime(source.fiscalRegime)
  ) {
    missing.push("fiscalRegime");
  }

  if (
    !hasText(source.defaultSeries) ||
    !isValidLegalEntityDefaultSeries(source.defaultSeries)
  ) {
    missing.push("defaultSeries");
  }

  if (!hasText(source.certificateSerialNumber)) {
    missing.push("certificateSerialNumber");
  }

  if (!hasText(source.certificateFingerprint)) {
    missing.push("certificateFingerprint");
  }

  if (!(source.certificateValidFrom instanceof Date)) {
    missing.push("certificateValidFrom");
  }

  if (!(source.certificateValidTo instanceof Date)) {
    missing.push("certificateValidTo");
  }

  if (
    source.certificateValidFrom instanceof Date &&
    source.certificateValidTo instanceof Date &&
    source.certificateValidFrom >= source.certificateValidTo
  ) {
    if (!missing.includes("certificateValidFrom")) {
      missing.push("certificateValidFrom");
    }
    if (!missing.includes("certificateValidTo")) {
      missing.push("certificateValidTo");
    }
  }

  return missing;
}

export function legalEntityFiscalProfileStatus(
  source: LegalEntityFiscalProfileSource,
): "COMPLETE" | "INCOMPLETE" {
  return missingLegalEntityFiscalProfileFields(source).length === 0
    ? "COMPLETE"
    : "INCOMPLETE";
}

export function getLegalEntityCertificateValidationCode(
  source: LegalEntityFiscalProfileSource,
  at = new Date(),
):
  | typeof LEGAL_ENTITY_CERTIFICATE_EXPIRED
  | typeof LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID
  | null {
  if (
    !(source.certificateValidFrom instanceof Date) ||
    !(source.certificateValidTo instanceof Date)
  ) {
    return null;
  }

  if (at < source.certificateValidFrom) {
    return LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID;
  }

  if (at >= source.certificateValidTo) {
    return LEGAL_ENTITY_CERTIFICATE_EXPIRED;
  }

  return null;
}
