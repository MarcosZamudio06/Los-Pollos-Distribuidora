/**
 * Stable identifiers for the SAT catalogs consumed by the CFDI bounded
 * context.  The entries themselves are persisted in PostgreSQL and are
 * intentionally not embedded here; this module only defines the contract
 * shared by importers, APIs and clients.
 */
export const SAT_CATALOG_KEYS = [
  "c_ClaveProdServ",
  "c_ClaveUnidad",
  "c_RegimenFiscal",
  "c_UsoCFDI",
  "c_FormaPago",
  "c_MetodoPago",
  "c_Impuesto",
  "c_TasaOCuota",
  "c_TipoDeComprobante",
  "c_Moneda",
  "c_MotivoCancelacion",
  "c_CodigoPostal",
  "c_ObjetoImp",
  "c_TipoRelacion",
] as const;

export type SatCatalogKey = (typeof SAT_CATALOG_KEYS)[number];

const SAT_CATALOG_KEY_SET = new Set<string>(SAT_CATALOG_KEYS);

export function isSatCatalogKey(value: string): value is SatCatalogKey {
  return SAT_CATALOG_KEY_SET.has(value);
}

export function normalizeSatCatalogKey(value: string): SatCatalogKey {
  const normalized = value.trim();
  if (!isSatCatalogKey(normalized)) {
    throw new Error("SAT_CATALOG_KEY_UNSUPPORTED");
  }
  return normalized;
}

export const SAT_CATALOG_DESCRIPTIONS: Record<SatCatalogKey, string> = {
  c_ClaveProdServ: "SAT product and service codes",
  c_ClaveUnidad: "SAT unit codes",
  c_RegimenFiscal: "SAT fiscal regimes",
  c_UsoCFDI: "SAT CFDI uses",
  c_FormaPago: "SAT payment forms",
  c_MetodoPago: "SAT payment methods",
  c_Impuesto: "SAT taxes",
  c_TasaOCuota: "SAT rates and quotas",
  c_TipoDeComprobante: "SAT CFDI document types",
  c_Moneda: "SAT currencies",
  c_MotivoCancelacion: "SAT cancellation motives",
  c_CodigoPostal: "SAT fiscal postal codes",
  c_ObjetoImp: "SAT tax object codes",
  c_TipoRelacion: "SAT CFDI relationship types",
};
