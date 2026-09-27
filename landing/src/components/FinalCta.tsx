import { ArrowDownRight, CheckCircle2, Layers3, Mail, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LANDING_CONFIG, LANDING_BRAND } from "../config/landingConfig";
import { LandingMagnetic, LandingReveal } from "./LandingPrimitives";

type FinalCtaProps = {
  initialInterest?: string;
};

export function FinalCta({ initialInterest = "" }: FinalCtaProps) {
  const [isReady, setIsReady] = useState(false);
  const [interest, setInterest] = useState<string | null>(null);
  const selectedInterest = interest ?? initialInterest;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO LANDING DEMO INTEGRATION: connect this UI-only form to the future commercial lead service.
    setIsReady(true);
  }

  return (
    <section aria-labelledby="demo-title" className="landing-cta" data-final-cta id="demo">
      <div className="landing-cta__atmosphere" aria-hidden="true" />
      <svg aria-hidden="true" className="landing-cta__signal" preserveAspectRatio="none" viewBox="0 0 900 280">
        <path d="M0 210 C150 210 168 58 300 82 S420 264 544 186 S690 42 900 62" data-cta-signal-path fill="none" />
      </svg>
      <div className="landing-container landing-cta__inner">
        <LandingReveal className="landing-cta__copy">
          <p className="landing-eyebrow landing-eyebrow--hero">La señal llega a un sistema conectado</p>
          <h2 id="demo-title">Convierte tu operación en una forma más clara de trabajar.</h2>
          <p>
            Ventas, inventario, sucursales, cobranza, distribución y administración trabajando
            sobre una misma plataforma.
          </p>
          <div className="landing-cta__chips">
            <span>Configurable</span>
            <span>Multiempresa</span>
            <span>Operación real</span>
          </div>
          <LandingMagnetic className="landing-text-link landing-text-link--light" href={LANDING_CONFIG.erpLoginUrl}>
            Ingresar al ERP
            <ArrowDownRight aria-hidden="true" size={17} />
          </LandingMagnetic>
        </LandingReveal>

        <LandingReveal className="landing-demo-form-card" delay={0.1}>
          <div className="landing-demo-form-card__header">
            <span className="landing-micro-status">DEMO / HABLEMOS DE TU OPERACIÓN</span>
            <p>Cuéntanos dónde empieza tu operación.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="demo-name">
              <span>Nombre</span>
              <div className="landing-input-wrap">
                <UserRound aria-hidden="true" size={16} />
                <input id="demo-name" name="name" placeholder="Tu nombre" required type="text" />
              </div>
            </label>
            <label htmlFor="demo-email">
              <span>Correo de trabajo</span>
              <div className="landing-input-wrap">
                <Mail aria-hidden="true" size={16} />
                <input id="demo-email" name="email" placeholder="tu@empresa.com" required type="email" />
              </div>
            </label>
            <label htmlFor="demo-interest">
              <span>¿Qué estás buscando?</span>
              <div className="landing-input-wrap">
                <Layers3 aria-hidden="true" size={16} />
                <select
                  id="demo-interest"
                  name="interest"
                  onChange={(event) => setInterest(event.target.value)}
                  required
                  value={selectedInterest}
                >
                  <option value="">Selecciona una opción</option>
                  <option value="ERP Operación">ERP Operación</option>
                  <option value="ERP Fiscal">ERP Fiscal</option>
                  <option value="ERP 360">ERP 360</option>
                  <option value="ERP Corporativo">ERP Corporativo</option>
                  <option value="Aún no lo sé">Aún no lo sé</option>
                </select>
              </div>
            </label>
            <button className="landing-button landing-button--accent landing-button--full" type="submit">
              Solicitar demostración
              <ArrowDownRight aria-hidden="true" size={17} />
            </button>
          </form>
          {isReady && (
            <p aria-live="polite" className="landing-demo-form-card__status" role="status">
              <CheckCircle2 aria-hidden="true" size={16} />
              Solicitud preparada para {selectedInterest}. El envío se habilitará próximamente.
            </p>
          )}
          <p className="landing-demo-form-card__note">
            {LANDING_BRAND.productName} prepara la solicitud en esta interfaz; la conexión con el
            servicio comercial se habilitará próximamente.
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
