import { getCommercialAction } from "../config/commercialConfig";
import { LandingButton } from "./LandingButton";
import { ProductPreview } from "./ProductPreview";
import s from "../styles/landing.module.css";

export function HeroSection() {
  const action = getCommercialAction();

  return (
    <section aria-labelledby="hero-title" className={s.hero} data-hero>
      <div className={s.container}>
        <div className={s.heroGrid}>
          <div className={s.heroCopy}>
            <h1 id="hero-title"><span data-hero-line>De la venta al cierre.</span>{" "}<span data-hero-line>Tu operación, conectada.</span></h1>
            <p className={s.heroDescription} data-hero-lede>Ventas, inventario por ubicación, distribución, cobranza y cierres. Un ERP para coordinar el trabajo real de tu distribuidora.</p>
            <div className={s.heroActions}>
              <LandingButton href={action.href}>{action.label}</LandingButton>
              <LandingButton href={action.kind === "explore" ? "#operation" : "#erp-gallery"} tone="secondary">{action.kind === "explore" ? "Conocer la operación" : "Explorar el ERP"}</LandingButton>
            </div>
          </div>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
