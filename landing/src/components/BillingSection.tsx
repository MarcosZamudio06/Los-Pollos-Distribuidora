import { FileCheck2, FileText, History, ShieldCheck } from "lucide-react";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

const billingSteps = [
  ["Solicitud", FileText],
  ["Emisión", FileCheck2],
  ["Estado", ShieldCheck],
  ["Trazabilidad", History],
] as const;

export function BillingSection() {
  return (
    <section aria-labelledby="billing-title" className="landing-section landing-billing-section">
      <div className="landing-container landing-billing-layout">
        <LandingReveal className="landing-billing-copy">
          <LandingSectionHeading
            description="La emisión fiscal tiene su propio ciclo, permisos y evidencia; no altera la fuente comercial, monetaria ni de inventario."
            eyebrow="Facturación / precisión fiscal"
            id="billing-title"
            title="Un documento también tiene una historia."
          />
          <div className="landing-billing-flow" aria-label="Ciclo de facturación">
            {billingSteps.map(([label, Icon], index) => (
              <span key={label}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <Icon aria-hidden="true" size={16} />
                <strong>{label}</strong>
              </span>
            ))}
          </div>
          <p className="landing-billing-note">
            La emisión depende de la configuración fiscal y del proveedor habilitado para cada
            operación.
          </p>
        </LandingReveal>

        <LandingReveal className="landing-billing-document" delay={0.12}>
          <div className="landing-billing-document__stack" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="landing-billing-document__header">
            <span><FileCheck2 aria-hidden="true" size={15} /> flujo fiscal</span>
            <span>trazable</span>
          </div>
          <LandingProductImage
            alt="Captura del flujo de facturación y CFDI"
            aspectRatio="16 / 10"
            label="Captura de Facturación"
            src={LANDING_IMAGES.billing}
          />
          <div className="landing-billing-document__artifacts">
            <span><FileText aria-hidden="true" size={14} /> XML</span>
            <span><FileText aria-hidden="true" size={14} /> PDF</span>
            <span><ShieldCheck aria-hidden="true" size={14} /> acceso controlado</span>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
