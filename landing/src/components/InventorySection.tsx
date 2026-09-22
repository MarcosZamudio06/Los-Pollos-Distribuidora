import { Boxes, Camera, Navigation, PackageCheck, Route } from "lucide-react";
import type { CSSProperties } from "react";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

const journeySteps = [
  { icon: Boxes, label: "Inventario", detail: "Saldos por ubicación" },
  { icon: PackageCheck, label: "CEDIS", detail: "Recepción y conciliación" },
  { icon: Route, label: "Ruta", detail: "Secuencia aprobada" },
  { icon: Navigation, label: "Chofer", detail: "Parada contextual" },
  { icon: Camera, label: "Entrega", detail: "Evidencia documentada" },
] as const;

const inventoryNotes = [
  "Existencias, mínimos y movimientos consultables por ubicación.",
  "Entradas, salidas, ajustes y traspasos con trazabilidad.",
  "Suministros, recepciones, devoluciones y conciliación.",
  "Kilos, piezas y equivalencias sin sumar dimensiones dos veces.",
] as const;

export function InventorySection() {
  return (
    <section
      aria-labelledby="inventory-title"
      className="landing-section landing-inventory-section"
      data-signal-journey
      id="operation"
    >
      <div className="landing-container">
        <LandingReveal className="landing-inventory-heading">
          <LandingSectionHeading
            description="La existencia no vive en un número global. Vive en la sucursal, el CEDIS, el almacén o la ruta donde realmente está."
            eyebrow="Operación / la señal toma ubicación"
            id="inventory-title"
            title="Del inventario a la entrega, sin perder el contexto."
          />
        </LandingReveal>

        <div className="landing-signal-journey">
          <div className="landing-signal-journey__rail" data-signal-journey-rail aria-hidden="true">
            <svg preserveAspectRatio="none" viewBox="0 0 1000 320">
              <path
                d="M20 236 C132 236 112 74 238 74 S340 262 468 226 S568 72 686 108 S790 274 980 66"
                data-signal-journey-path
                fill="none"
              />
            </svg>
            {journeySteps.map(({ label }, index) => (
              <span
                className="landing-journey-node"
                data-journey-node
                key={label}
                style={{ "--journey-node-index": index } as CSSProperties}
              >
                <i />
                <strong>{label}</strong>
              </span>
            ))}
          </div>

          <ol className="landing-journey-steps">
            {journeySteps.map(({ detail, icon: Icon, label }, index) => (
              <li data-journey-step key={label}>
                <span className="landing-journey-steps__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="landing-journey-steps__icon"><Icon aria-hidden="true" size={17} /></span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ol>

          <div className="landing-signal-journey__visuals">
            <LandingReveal className="landing-journey-shot landing-journey-shot--inventory">
              <LandingProductImage
                alt="Captura del inventario por ubicación"
                aspectRatio="4 / 3"
                label="Captura de Inventario"
                src={LANDING_IMAGES.inventory}
              />
              <p>Inventario / ubicación operativa</p>
            </LandingReveal>
            <LandingReveal className="landing-journey-shot landing-journey-shot--cedis" delay={0.12}>
              <LandingProductImage
                alt="Captura del ciclo de suministro CEDIS"
                aspectRatio="4 / 3"
                label="Captura de CEDIS"
                src={LANDING_IMAGES.cedis}
              />
              <p>CEDIS / recepción y conciliación</p>
            </LandingReveal>
          </div>
        </div>

        <div className="landing-inventory-notes">
          {inventoryNotes.map((note) => <span key={note}>{note}</span>)}
        </div>
      </div>
    </section>
  );
}
