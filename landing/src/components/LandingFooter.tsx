import { ArrowUp } from "lucide-react";
import { LANDING_BRAND } from "../config/landingConfig";
import { getCommercialConfig } from "../config/commercialConfig";
import s from "../styles/landing.module.css";

export function LandingFooter() {
  const config = getCommercialConfig();
  return (
    <footer className={s.footer}>
      <div className={`${s.container} ${s.footerInner}`}>
        <a className={s.footerBrand} href="#landing-top">
          <span aria-hidden="true" className={s.brandMark}><i /><i /><i /></span>
          <span>{LANDING_BRAND.productName}</span>
        </a>
        <p className={s.legalNote}>Ventas · Inventario · Operación · Administración</p>
        {config.privacyUrl && <a href={config.privacyUrl}>Privacidad</a>}
        {config.termsUrl && <a href={config.termsUrl}>Términos</a>}
        <a className={s.footerBack} href="#main-content">Volver arriba <ArrowUp aria-hidden="true" size={14} /></a>
      </div>
    </footer>
  );
}
