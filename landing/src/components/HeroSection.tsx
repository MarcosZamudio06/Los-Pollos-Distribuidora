import { Activity, ArrowDownRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { LANDING_BRAND } from "../config/landingConfig";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingMagnetic, LandingPointerFrame } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

export function HeroSection() {
  return (
    <section
      aria-labelledby="landing-hero-title"
      className="landing-hero"
      data-hero
      id="landing-top"
    >
      <div className="landing-hero__atmosphere" aria-hidden="true" />
      <div className="landing-container landing-hero__inner">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow landing-eyebrow--hero" data-hero-eyebrow>
            <span className="landing-live-dot" />
            {LANDING_BRAND.descriptor} · multiempresa
          </p>
          <h1 id="landing-hero-title">
            <span data-hero-line>Todo tu negocio.</span>
            <span className="landing-hero__headline-accent" data-hero-line>
              Una sola plataforma.
            </span>
          </h1>
          <p className="landing-hero__lede" data-hero-lede>
            Conecta ventas, inventario, compras, cobranza, sucursales, distribución y fiscalidad
            en una operación que todos pueden entender.
          </p>
          <div className="landing-hero__actions" data-hero-actions>
            <LandingMagnetic className="landing-button landing-button--dark" href="#demo">
              Solicitar demostración
              <span aria-hidden="true" className="landing-arrow">↗</span>
            </LandingMagnetic>
            <a className="landing-button landing-button--outline" href="#product">
              Ver la plataforma
              <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.7} />
            </a>
          </div>
          <div aria-label="Principios de la plataforma" className="landing-hero__proof">
            <span>
              <CheckCircle2 aria-hidden="true" size={15} />
              Datos por ubicación
            </span>
            <span>
              <ShieldCheck aria-hidden="true" size={15} />
              Acceso por rol
            </span>
            <span>
              <Activity aria-hidden="true" size={15} />
              Visibilidad operativa
            </span>
          </div>
        </div>

        <LandingPointerFrame className="landing-hero__visual" data-hero-visual>
          <div className="landing-hero__visual-label">
            <span>El pulso de tu operación</span>
            <span className="landing-micro-status">Vista conceptual</span>
          </div>
          <div className="landing-hero__screen">
            <div className="landing-window-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <small>signal / dashboard</small>
            </div>
            <LandingProductImage
              alt="Captura del dashboard principal del ERP"
              aspectRatio="16 / 10"
              label="Captura del Dashboard"
              priority
              src={LANDING_IMAGES.heroDashboard}
            />
            <div className="landing-hero__signal-card" aria-hidden="true">
              <span className="landing-signal-card__pulse" data-hero-pulse />
              <span>señal activa</span>
              <strong>venta → inventario → entrega</strong>
            </div>
            <div className="landing-hero__screen-caption">
              <span>Una lectura común para equipos distintos.</span>
              <span>Captura real próximamente</span>
            </div>
          </div>
          <div className="landing-hero__float-panel" aria-hidden="true">
            <span>01 / operación</span>
            <strong>Conectada por diseño</strong>
            <i />
          </div>
          <svg
            aria-hidden="true"
            className="landing-hero__signal"
            preserveAspectRatio="none"
            viewBox="0 0 600 260"
          >
            <path
              d="M20 224 C88 224 88 168 148 168 S208 74 268 116 S326 210 386 156 S450 62 580 44"
              data-hero-signal-path
              fill="none"
            />
            <circle cx="386" cy="156" r="6" />
          </svg>
        </LandingPointerFrame>
      </div>

      <div className="landing-container landing-signal-strip" aria-label="Áreas conectadas">
        <span>Comercial</span>
        <i aria-hidden="true" />
        <span>Operaciones</span>
        <i aria-hidden="true" />
        <span>Distribución</span>
        <i aria-hidden="true" />
        <span>Gestión</span>
        <i aria-hidden="true" />
        <span>Fiscal</span>
      </div>
    </section>
  );
}
