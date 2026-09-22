const DEFAULT_ERP_APP_URL = "http://localhost:3000";

function normalizeAppUrl(value: string) {
  return value.replace(/\/+$/, "");
}

const erpAppUrl = normalizeAppUrl(
  import.meta.env.VITE_ERP_APP_URL?.trim() || DEFAULT_ERP_APP_URL,
);

export const LANDING_CONFIG = {
  appUrl: erpAppUrl,
  erpLoginUrl: `${erpAppUrl}/login`,
} as const;

export const LANDING_BRAND = {
  productName: "ERP",
  descriptor: "Plataforma operativa",
  tagline: "Una vista clara para cada parte de tu operación.",
} as const;

export const LANDING_NAV_ITEMS = [
  { label: "Producto", href: "#product" },
  { label: "Funcionalidades", href: "#features" },
  { label: "Operación", href: "#operation" },
  { label: "Logística", href: "#logistics" },
  { label: "Seguridad", href: "#security" },
  { label: "Preguntas", href: "#faq" },
] as const;

export const LANDING_SEO = {
  title: "ERP | Operación conectada para empresas que crecen",
  description:
    "Centraliza ventas, inventario, compras, cobranza, distribución y fiscalidad en una plataforma empresarial configurable y preparada para operar por empresa.",
  canonicalUrl: "",
} as const;

export const LANDING_FOOTER_GROUPS = [
  {
    label: "Producto",
    links: [
      { label: "La plataforma", href: "#product" },
      { label: "Funcionalidades", href: "#features" },
      { label: "Operación", href: "#operation" },
      { label: "Soluciones", href: "#plans" },
    ],
  },
  {
    label: "Confianza",
    links: [
      { label: "Seguridad", href: "#security" },
      { label: "Preguntas frecuentes", href: "#faq" },
      { label: "Contacto", href: "#demo" },
    ],
  },
  {
    label: "Legal",
    links: [
      { label: "Aviso de privacidad", href: "#privacy", placeholder: true },
      { label: "Términos", href: "#terms", placeholder: true },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  links: ReadonlyArray<{
    label: string;
    href: string;
    placeholder?: boolean;
  }>;
}>;
