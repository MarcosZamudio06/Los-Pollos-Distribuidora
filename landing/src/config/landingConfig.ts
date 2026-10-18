import { getCommercialConfig, publicUrl } from "./commercialConfig";

const commercial = getCommercialConfig();
export const LANDING_CONFIG = { appUrl: publicUrl(import.meta.env.VITE_ERP_APP_URL).replace(/\/+$/, ""), erpLoginUrl: commercial.loginUrl } as const;

export function getLandingDemoRequestUrl() {
  return publicUrl(import.meta.env.VITE_LANDING_DEMO_REQUEST_URL);
}

export const LANDING_BRAND = {
  productName: "Los-Pollos-Distribuidora",
  descriptor: "Plataforma operativa",
  tagline: "Una vista clara para cada parte de tu operación.",
} as const;

export const LANDING_NAV_ITEMS = [
  { label: "Producto", href: "#erp-gallery" },
  { label: "Operación", href: "#operation" },
  { label: "Confianza", href: "#security" },
  { label: "Preguntas", href: "#faq" },
] as const;

export const LANDING_SEO = {
  title: "Los-Pollos-Distribuidora | Ventas, inventario y distribución",
  description:
    "Conecta ventas, compras, inventario, cobranza y administración en una sola plataforma ERP.",
  canonicalUrl: commercial.canonicalUrl,
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
