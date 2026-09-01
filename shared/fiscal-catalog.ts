/**
 * CFDI 4.0 catalog snapshot used by the customer fiscal profile.
 *
 * These values remain a controlled compatibility fallback for environments
 * that have not imported their first reviewed SAT version. The versioned
 * SatCatalog tables and read API are authoritative once configured; this
 * snapshot must never be treated as an import source or as a substitute for
 * catalog validation at fiscal issuance.
 *
 * The compatibility fields below are the reviewed fallback projection of the
 * official SAT c_UsoCFDI/c_RegimenFiscal catalogs. Versioned catalog entries
 * with the same metadata shape supersede this projection when configured.
 */

export type SatReceiverPersonType = "physical" | "moral" | "generic";
export type SatNaturalPersonType = Exclude<SatReceiverPersonType, "generic">;
export type SatPersonApplicability = Readonly<
  Record<SatNaturalPersonType, boolean>
>;

export interface SatFiscalRegimeCatalogEntry {
  readonly code: string;
  readonly label: string;
  readonly appliesTo: SatPersonApplicability;
  readonly validFrom: string | null;
  readonly validTo: string | null;
}

export interface SatCfdiUseCatalogEntry {
  readonly code: string;
  readonly label: string;
  readonly appliesTo: SatPersonApplicability;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly fiscalRegimes: readonly string[];
}

export interface SatFiscalCompatibilityCatalog {
  readonly fiscalRegimes: readonly SatFiscalRegimeCatalogEntry[];
  readonly cfdiUses: readonly SatCfdiUseCatalogEntry[];
}

export const SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA =
  "sat-fiscal-compatibility/v1" as const;

export interface SatFiscalRegimeCompatibilityMetadata {
  readonly schema: typeof SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA;
  readonly appliesTo: SatPersonApplicability;
}

export interface SatCfdiUseCompatibilityMetadata extends SatFiscalRegimeCompatibilityMetadata {
  readonly fiscalRegimes: readonly string[];
}

const SAT_CATALOG_EFFECTIVE_FROM = "2022-01-01";
const SAT_BOTH_PERSON_TYPES = { physical: true, moral: true } as const;
const SAT_PHYSICAL_PERSON_ONLY = { physical: true, moral: false } as const;
const SAT_MORAL_PERSON_ONLY = { physical: false, moral: true } as const;

const SAT_BUSINESS_USE_REGIMES = [
  "601",
  "603",
  "606",
  "612",
  "620",
  "621",
  "622",
  "623",
  "624",
  "625",
  "626",
] as const;
const SAT_REFUND_USE_REGIMES = [
  ...SAT_BUSINESS_USE_REGIMES.slice(0, 10),
  "616",
  "626",
] as const;
const SAT_PERSONAL_USE_REGIMES = [
  "605",
  "606",
  "608",
  "611",
  "612",
  "614",
  "607",
  "615",
  "625",
] as const;
const SAT_NON_FISCAL_USE_REGIMES = [
  "601",
  "603",
  "605",
  "606",
  "608",
  "610",
  "611",
  "612",
  "614",
  "616",
  "620",
  "621",
  "622",
  "623",
  "624",
  "607",
  "615",
  "625",
  "626",
] as const;

export const SAT_CFDI_FALLBACK_SOURCE_VERSION = "2026-08-21" as const;
export const SAT_CFDI_FALLBACK_SOURCE_URL =
  "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI_V_4_20260821.xls" as const;

export const SAT_FISCAL_REGIMES = [
  {
    code: "601",
    label: "General de Ley Personas Morales",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "603",
    label: "Personas Morales con Fines no Lucrativos",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "605",
    label: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "606",
    label: "Arrendamiento",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "607",
    label: "Régimen de Enajenación o Adquisición de Bienes",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "608",
    label: "Demás ingresos",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "610",
    label:
      "Residentes en el Extranjero sin Establecimiento Permanente en México",
    appliesTo: SAT_BOTH_PERSON_TYPES,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "611",
    label: "Ingresos por Dividendos (socios y accionistas)",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "612",
    label: "Personas Físicas con Actividades Empresariales y Profesionales",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "614",
    label: "Ingresos por intereses",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "615",
    label: "Régimen de los ingresos por obtención de premios",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "616",
    label: "Sin obligaciones fiscales",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "620",
    label:
      "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "621",
    label: "Incorporación Fiscal",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "622",
    label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "623",
    label: "Opcional para Grupos de Sociedades",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "624",
    label: "Coordinados",
    appliesTo: SAT_MORAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "625",
    label:
      "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
  {
    code: "626",
    label: "Régimen Simplificado de Confianza",
    appliesTo: SAT_BOTH_PERSON_TYPES,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
  },
] as const satisfies readonly SatFiscalRegimeCatalogEntry[];

const satBusinessUse = (code: string, label: string) => ({
  code,
  label,
  appliesTo: SAT_BOTH_PERSON_TYPES,
  validFrom: SAT_CATALOG_EFFECTIVE_FROM,
  validTo: null,
  fiscalRegimes: SAT_BUSINESS_USE_REGIMES,
});

const satRefundUse = (code: string, label: string) => ({
  code,
  label,
  appliesTo: SAT_BOTH_PERSON_TYPES,
  validFrom: SAT_CATALOG_EFFECTIVE_FROM,
  validTo: null,
  fiscalRegimes: SAT_REFUND_USE_REGIMES,
});

const satInvestmentUse = (code: string, label: string) => ({
  code,
  label,
  appliesTo: SAT_BOTH_PERSON_TYPES,
  validFrom: SAT_CATALOG_EFFECTIVE_FROM,
  validTo: null,
  fiscalRegimes: SAT_BUSINESS_USE_REGIMES,
});

const satPersonalUse = (code: string, label: string) => ({
  code,
  label,
  appliesTo: SAT_PHYSICAL_PERSON_ONLY,
  validFrom: SAT_CATALOG_EFFECTIVE_FROM,
  validTo: null,
  fiscalRegimes: SAT_PERSONAL_USE_REGIMES,
});

export const SAT_CFDI_USES = [
  satBusinessUse("G01", "Adquisición de mercancías"),
  satRefundUse("G02", "Devoluciones, descuentos o bonificaciones"),
  satBusinessUse("G03", "Gastos en general"),
  satInvestmentUse("I01", "Construcciones"),
  satInvestmentUse("I02", "Mobiliario y equipo de oficina por inversiones"),
  satInvestmentUse("I03", "Equipo de transporte"),
  satInvestmentUse("I04", "Equipo de cómputo y accesorios"),
  satInvestmentUse("I05", "Dados, troqueles, moldes, matrices y herramental"),
  satInvestmentUse("I06", "Comunicaciones telefónicas"),
  satInvestmentUse("I07", "Comunicaciones satelitales"),
  satInvestmentUse("I08", "Otra maquinaria y equipo"),
  satPersonalUse("D01", "Honorarios médicos, dentales y gastos hospitalarios"),
  satPersonalUse("D02", "Gastos médicos por incapacidad o discapacidad"),
  satPersonalUse("D03", "Gastos funerales"),
  satPersonalUse("D04", "Donativos"),
  satPersonalUse(
    "D05",
    "Intereses reales efectivamente pagados por créditos hipotecarios",
  ),
  satPersonalUse("D06", "Aportaciones voluntarias al SAR"),
  satPersonalUse("D07", "Primas por seguros de gastos médicos"),
  satPersonalUse("D08", "Gastos de transportación escolar obligatoria"),
  satPersonalUse(
    "D09",
    "Depósitos en cuentas para el ahorro y planes de pensiones",
  ),
  satPersonalUse("D10", "Pagos por servicios educativos (colegiaturas)"),
  {
    code: "S01",
    label: "Sin efectos fiscales",
    appliesTo: SAT_BOTH_PERSON_TYPES,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
    fiscalRegimes: SAT_NON_FISCAL_USE_REGIMES,
  },
  {
    code: "CP01",
    label: "Pagos",
    appliesTo: SAT_BOTH_PERSON_TYPES,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
    fiscalRegimes: SAT_NON_FISCAL_USE_REGIMES,
  },
  {
    code: "CN01",
    label: "Nómina",
    appliesTo: SAT_PHYSICAL_PERSON_ONLY,
    validFrom: SAT_CATALOG_EFFECTIVE_FROM,
    validTo: null,
    fiscalRegimes: ["605"],
  },
] as const satisfies readonly SatCfdiUseCatalogEntry[];

export const SAT_FISCAL_COMPATIBILITY_FALLBACK = {
  fiscalRegimes: SAT_FISCAL_REGIMES,
  cfdiUses: SAT_CFDI_USES,
} as const satisfies SatFiscalCompatibilityCatalog;

export const SAT_FISCAL_REGIME_CODES = SAT_FISCAL_REGIMES.map(
  ({ code }) => code,
);
export const SAT_CFDI_USE_CODES = SAT_CFDI_USES.map(({ code }) => code);

export const CUSTOMER_FISCAL_PROFILE_FIELDS = [
  "fiscalName",
  "taxId",
  "fiscalPostalCode",
  "fiscalRegime",
  "fiscalUseCode",
  "billingEmail",
] as const;

export type CustomerFiscalProfileField =
  (typeof CUSTOMER_FISCAL_PROFILE_FIELDS)[number];

export type CustomerFiscalProfileSource = Partial<
  Record<CustomerFiscalProfileField, string | null | undefined>
>;

export function missingCustomerFiscalProfileFields(
  source: CustomerFiscalProfileSource,
): CustomerFiscalProfileField[] {
  return CUSTOMER_FISCAL_PROFILE_FIELDS.filter((field) => {
    const value = source[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function normalizeFiscalTaxId(value: string): string {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

export function isStructurallyValidFiscalRfc(value: string): boolean {
  const normalized = normalizeFiscalTaxId(value);
  if (normalized === "XAXX010101000" || normalized === "XEXX010101000") {
    return true;
  }

  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/u.test(normalized)) return false;

  const dateFragment =
    normalized.length === 12 ? normalized.slice(3, 9) : normalized.slice(4, 10);
  const year = Number(dateFragment.slice(0, 2));
  const month = Number(dateFragment.slice(2, 4));
  const day = Number(dateFragment.slice(4, 6));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  return [1900 + year, 2000 + year].some((fullYear) => {
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    return (
      date.getUTCFullYear() === fullYear &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });
}

export function isValidMexicanFiscalPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

export function isValidSatFiscalRegime(value: string): boolean {
  return SAT_FISCAL_REGIME_CODES.includes(
    value as (typeof SAT_FISCAL_REGIME_CODES)[number],
  );
}

export function isValidSatCfdiUseCode(value: string): boolean {
  return SAT_CFDI_USE_CODES.includes(
    value as (typeof SAT_CFDI_USE_CODES)[number],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExplicitPersonApplicability(
  value: unknown,
): value is SatPersonApplicability {
  return (
    isRecord(value) &&
    typeof value.physical === "boolean" &&
    typeof value.moral === "boolean" &&
    (value.physical || value.moral)
  );
}

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(new Date(value).getTime()) &&
    /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
  );
}

export function isSatFiscalRegimeCompatibilityMetadata(
  value: unknown,
): value is SatFiscalRegimeCompatibilityMetadata {
  return (
    isRecord(value) &&
    value.schema === SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA &&
    isExplicitPersonApplicability(value.appliesTo)
  );
}

export function isSatCfdiUseCompatibilityMetadata(
  value: unknown,
): value is SatCfdiUseCompatibilityMetadata {
  if (!isSatFiscalRegimeCompatibilityMetadata(value)) {
    return false;
  }

  const regimes = (value as SatCfdiUseCompatibilityMetadata).fiscalRegimes;
  if (!Array.isArray(regimes) || regimes.length === 0) return false;
  return (
    regimes.every(
      (code): code is string =>
        typeof code === "string" && /^[0-9]{3}$/.test(code),
    ) && new Set(regimes).size === regimes.length
  );
}

export function isSatFiscalRegimeCatalogEntry(
  value: unknown,
): value is SatFiscalRegimeCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    isExplicitPersonApplicability(value.appliesTo) &&
    (value.validFrom === null || isValidDateString(value.validFrom)) &&
    (value.validTo === null || isValidDateString(value.validTo))
  );
}

export function isSatCfdiUseCatalogEntry(
  value: unknown,
): value is SatCfdiUseCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    isExplicitPersonApplicability(value.appliesTo) &&
    (value.validFrom === null || isValidDateString(value.validFrom)) &&
    (value.validTo === null || isValidDateString(value.validTo)) &&
    Array.isArray(value.fiscalRegimes) &&
    value.fiscalRegimes.length > 0 &&
    value.fiscalRegimes.every(
      (code): code is string =>
        typeof code === "string" && /^[0-9]{3}$/.test(code),
    ) &&
    new Set(value.fiscalRegimes).size === value.fiscalRegimes.length
  );
}

export function deriveSatReceiverPersonType(
  value: string,
): SatReceiverPersonType | null {
  const normalized = normalizeFiscalTaxId(value);
  if (normalized === "XAXX010101000" || normalized === "XEXX010101000") {
    return "generic";
  }
  if (normalized.length === 12) return "moral";
  if (normalized.length === 13) return "physical";
  return null;
}

function isEffectiveAt(
  validFrom: string | null,
  validTo: string | null,
  effectiveDate?: Date,
): boolean {
  if (!effectiveDate) return true;
  const effectiveTime = effectiveDate.getTime();
  if (Number.isNaN(effectiveTime)) return false;

  const fromTime = validFrom ? new Date(validFrom).getTime() : null;
  const toTime = validTo ? new Date(validTo).getTime() : null;
  return (
    (fromTime === null ||
      (!Number.isNaN(fromTime) && fromTime <= effectiveTime)) &&
    (toTime === null || (!Number.isNaN(toTime) && effectiveTime < toTime))
  );
}

export interface IsCfdiUseCompatibleInput {
  readonly cfdiUse: string;
  readonly fiscalRegime: string;
  readonly receiverPersonType: SatReceiverPersonType | null;
  readonly effectiveDate?: Date;
  readonly receiverTaxId?: string;
}

export function isCfdiUseCompatible(
  input: IsCfdiUseCompatibleInput,
  catalog: SatFiscalCompatibilityCatalog = SAT_FISCAL_COMPATIBILITY_FALLBACK,
): boolean {
  const useCode = input.cfdiUse.trim().toUpperCase();
  const regimeCode = input.fiscalRegime.trim();
  const use = catalog.cfdiUses.find((entry) => entry.code === useCode);
  const regime = catalog.fiscalRegimes.find(
    (entry) => entry.code === regimeCode,
  );
  if (!use || !regime) return false;
  if (
    !isEffectiveAt(use.validFrom, use.validTo, input.effectiveDate) ||
    !isEffectiveAt(regime.validFrom, regime.validTo, input.effectiveDate)
  ) {
    return false;
  }
  if (!use.fiscalRegimes.includes(regime.code)) return false;

  const receiverPersonType =
    input.receiverPersonType ??
    (input.receiverTaxId
      ? deriveSatReceiverPersonType(input.receiverTaxId)
      : null);
  if (!receiverPersonType) return false;

  if (receiverPersonType === "generic") {
    return use.code === "S01" && regime.code === "616";
  }

  return (
    use.appliesTo[receiverPersonType] && regime.appliesTo[receiverPersonType]
  );
}
