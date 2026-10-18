import { publicUrl } from "./publicUrl.ts";
export { publicUrl } from "./publicUrl.ts";
export function getCommercialConfig() {
  const endpoint = publicUrl(import.meta.env.VITE_LANDING_LEAD_ENDPOINT);
  const privacyUrl = publicUrl(import.meta.env.VITE_LANDING_PRIVACY_URL);
  const erpUrl = publicUrl(import.meta.env.VITE_ERP_APP_URL);
  return {
    endpoint, privacyUrl, canSubmit: Boolean(endpoint && privacyUrl),
    loginUrl: erpUrl ? `${erpUrl.replace(/\/+$/, "")}/login` : "",
    canonicalUrl: publicUrl(import.meta.env.VITE_LANDING_CANONICAL_URL),
    socialImage: publicUrl(import.meta.env.VITE_LANDING_SOCIAL_IMAGE),
    termsUrl: publicUrl(import.meta.env.VITE_LANDING_TERMS_URL),
  };
}

/** Resolve one truthful public action for every commercial entry point. */
export function getCommercialAction() {
  const config = getCommercialConfig();
  const hostedDemo = publicUrl(import.meta.env.VITE_LANDING_DEMO_REQUEST_URL);
  if (config.canSubmit || hostedDemo) return { label: "Solicitar demostración", href: "#demo", kind: "demo" } as const;
  const email = import.meta.env.VITE_LANDING_CONTACT_EMAIL?.trim() || "";
  // No query strings, control characters or injected mail headers.
  if (/^[a-zA-Z0-9.!#$%&'*+/=_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(email)) {
    return { label: "Contactar por correo", href: `mailto:${encodeURIComponent(email).replace("%40", "@")}`, kind: "email" } as const;
  }
  return { label: "Explorar el ERP", href: "#erp-gallery", kind: "explore" } as const;
}
