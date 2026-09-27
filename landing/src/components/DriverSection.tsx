import { Camera, CircleDollarSign, MapPin, Navigation } from "lucide-react";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

const driverSignals = [
  { icon: Navigation, label: "Ruta activa" },
  { icon: MapPin, label: "GPS contextual" },
  { icon: Camera, label: "Evidencia" },
  { icon: CircleDollarSign, label: "Cobranza" },
] as const;

export function DriverSection() {
  return (
    <section aria-labelledby="driver-title" className="landing-section landing-driver-section">
      <div className="landing-container landing-driver-layout">
        <LandingReveal className="landing-driver-visual">
          <div className="landing-driver-visual__halo" aria-hidden="true" />
          <div className="landing-phone-frame">
            <div className="landing-phone-frame__speaker" aria-hidden="true" />
            <div className="landing-phone-frame__screen">
              <LandingProductImage
                alt="Captura de la experiencia para repartidores"
                aspectRatio="9 / 16"
                label="Captura de Reparto"
                src={LANDING_IMAGES.driver}
              />
            </div>
            <div className="landing-phone-frame__home" aria-hidden="true" />
          </div>
          <div className="landing-driver-labels" aria-hidden="true">
            {driverSignals.map(({ icon: Icon, label }, index) => (
              <span className={`landing-driver-label landing-driver-label--${index + 1}`} key={label}>
                <Icon size={13} /> {label}
              </span>
            ))}
          </div>
          <p className="landing-phone-caption">Experiencia web para repartidores</p>
        </LandingReveal>

        <LandingReveal className="landing-driver-copy" delay={0.1}>
          <LandingSectionHeading
            description="Una experiencia enfocada en la ruta del día: qué sigue, qué se entregó y qué necesita atención."
            eyebrow="Experiencia para repartidores / en el camino"
            id="driver-title"
            title="La operación también cabe en la ruta."
          />
          <div className="landing-driver-points">
            {driverSignals.map(({ icon: Icon, label }) => (
              <div key={label}>
                <Icon aria-hidden="true" size={17} />
                <strong>{label}</strong>
                <p>
                  {label === "Ruta activa" && "Paradas pendientes y orden aprobado."}
                  {label === "GPS contextual" && "Ubicación de la ruta desde el navegador autenticado."}
                  {label === "Evidencia" && "Foto de entrega y registros permitidos."}
                  {label === "Cobranza" && "Cobros, saldos e incidencias de la jornada."}
                </p>
              </div>
            ))}
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
