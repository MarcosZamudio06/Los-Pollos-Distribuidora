import { Activity, Camera, FileCheck2, MapPin, PackageCheck, Route, Truck } from "lucide-react";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

const routeSteps = [
  { icon: PackageCheck, label: "Pedido", detail: "confirmado" },
  { icon: Route, label: "Planeación", detail: "secuencia aprobada" },
  { icon: Truck, label: "Unidad", detail: "asignada" },
  { icon: MapPin, label: "Ruta", detail: "en contexto" },
  { icon: Camera, label: "Entrega", detail: "realizada" },
  { icon: FileCheck2, label: "Evidencia", detail: "lista para liquidar" },
] as const;

export function LogisticsSection() {
  return (
    <section
      aria-labelledby="logistics-title"
      className="landing-section landing-logistics-section"
      data-route-sequence
      id="logistics"
    >
      <div className="landing-container">
        <div className="landing-logistics-heading">
          <LandingReveal>
            <LandingSectionHeading
              description="Planifica, asigna, sigue y liquida el reparto con la misma trazabilidad que esperas de una operación comercial."
              eyebrow="Distribución / una ruta que se puede leer"
              id="logistics-title"
              title="La señal sale del almacén y llega hasta la evidencia."
            />
          </LandingReveal>
          <LandingReveal className="landing-logistics-aside" delay={0.1}>
            <Activity aria-hidden="true" size={18} />
            <p>
              Una visualización conceptual del recorrido: no es un mapa en vivo, es la secuencia
              operativa que cada equipo necesita reconocer.
            </p>
          </LandingReveal>
        </div>

        <div className="landing-route-story">
          <div className="landing-route-story__map" data-route-map>
            <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 900 420">
              <path
                d="M68 318 C126 284 140 118 244 148 S322 352 438 280 S514 84 620 124 S694 324 832 84"
                data-route-path
                fill="none"
              />
            </svg>
            {routeSteps.map(({ label }, index) => (
              <span className="landing-route-checkpoint" data-route-checkpoint key={label}>
                <i />
                <strong>{label}</strong>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </span>
            ))}
            <div className="landing-route-story__coordinates" aria-hidden="true">
              <span>operación / ruta activa</span>
              <span>evidencia / liquidación</span>
            </div>
          </div>

          <ol className="landing-route-steps">
            {routeSteps.map(({ detail, icon: Icon, label }) => (
              <li key={label}>
                <span className="landing-route-steps__icon"><Icon aria-hidden="true" size={16} /></span>
                <span><strong>{label}</strong><small>{detail}</small></span>
              </li>
            ))}
          </ol>

          <div className="landing-route-shots">
            <LandingReveal className="landing-route-shot landing-route-shot--planner">
              <div className="landing-route-shot__label"><Route aria-hidden="true" size={14} /> planeador</div>
              <LandingProductImage
                alt="Captura del planeador de rutas"
                aspectRatio="16 / 10"
                className="landing-route-shot__media"
                label="Captura del Planeador de rutas"
                src={LANDING_IMAGES.routePlanner}
              />
            </LandingReveal>
            <LandingReveal className="landing-route-shot landing-route-shot--fleet" delay={0.12}>
              <div className="landing-route-shot__label"><Truck aria-hidden="true" size={14} /> flota operativa</div>
              <LandingProductImage
                alt="Captura del monitoreo de flota"
                aspectRatio="16 / 10"
                className="landing-route-shot__media"
                label="Captura de Flota"
                src={LANDING_IMAGES.fleet}
              />
            </LandingReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
