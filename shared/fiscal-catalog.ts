/**
 * CFDI 4.0 catalog snapshot used by the customer fiscal profile.
 *
 * These values remain a controlled compatibility fallback for environments
 * that have not imported their first reviewed SAT version. The versioned
 * SatCatalog tables and read API are authoritative once configured; this
 * snapshot must never be treated as an import source or as a substitute for
 * catalog validation at fiscal issuance.
 */

export const SAT_FISCAL_REGIMES = [
  { code: "601", label: "General de Ley Personas Morales" },
  { code: "603", label: "Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { code: "606", label: "Arrendamiento" },
  { code: "607", label: "Régimen de Enajenación o Adquisición de Bienes" },
  { code: "608", label: "Demás ingresos" },
  {
    code: "610",
    label:
      "Residentes en el Extranjero sin Establecimiento Permanente en México",
  },
  { code: "611", label: "Ingresos por Dividendos (socios y accionistas)" },
  {
    code: "612",
    label: "Personas Físicas con Actividades Empresariales y Profesionales",
  },
  { code: "614", label: "Ingresos por intereses" },
  { code: "615", label: "Régimen de los ingresos por obtención de premios" },
  { code: "616", label: "Sin obligaciones fiscales" },
  {
    code: "620",
    label:
      "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  },
  { code: "621", label: "Incorporación Fiscal" },
  {
    code: "622",
    label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  },
  { code: "623", label: "Opcional para Grupos de Sociedades" },
  { code: "624", label: "Coordinados" },
  {
    code: "625",
    label:
      "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  },
  { code: "626", label: "Régimen Simplificado de Confianza" },
] as const;

export const SAT_CFDI_USES = [
  { code: "G01", label: "Adquisición de mercancías" },
  { code: "G02", label: "Devoluciones, descuentos o bonificaciones" },
  { code: "G03", label: "Gastos en general" },
  { code: "I01", label: "Construcciones" },
  { code: "I02", label: "Mobiliario y equipo de oficina por inversiones" },
  { code: "I03", label: "Equipo de transporte" },
  { code: "I04", label: "Equipo de cómputo y accesorios" },
  { code: "I05", label: "Dados, troqueles, moldes, matrices y herramental" },
  { code: "I06", label: "Comunicaciones telefónicas" },
  { code: "I07", label: "Comunicaciones satelitales" },
  { code: "I08", label: "Otra maquinaria y equipo" },
  { code: "D01", label: "Honorarios médicos, dentales y gastos hospitalarios" },
  { code: "D02", label: "Gastos médicos por incapacidad o discapacidad" },
  { code: "D03", label: "Gastos funerales" },
  { code: "D04", label: "Donativos" },
  {
    code: "D05",
    label: "Intereses reales efectivamente pagados por créditos hipotecarios",
  },
  { code: "D06", label: "Aportaciones voluntarias al SAR" },
  { code: "D07", label: "Primas por seguros de gastos médicos" },
  { code: "D08", label: "Gastos de transportación escolar obligatoria" },
  {
    code: "D09",
    label: "Depósitos en cuentas para el ahorro y planes de pensiones",
  },
  { code: "D10", label: "Pagos por servicios educativos (colegiaturas)" },
  { code: "S01", label: "Sin efectos fiscales" },
  { code: "CP01", label: "Pagos" },
  { code: "CN01", label: "Nómina" },
] as const;

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
