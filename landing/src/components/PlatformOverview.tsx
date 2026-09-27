import {
  Activity,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Route,
  ShieldCheck,
} from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const platformAreas = [
  {
    icon: CircleDollarSign,
    name: "Comercial",
    kicker: "01 / inicia la señal",
    description: "Convierte cada venta en una señal útil para el resto del negocio.",
    items: ["Ventas POS", "Clientes y crédito", "Políticas comerciales", "Cobranza"],
  },
  {
    icon: Boxes,
    name: "Operaciones",
    kicker: "02 / conserva el contexto",
    description: "Mueve producto con una ubicación y una historia detrás.",
    items: ["Inventario por ubicación", "Compras", "CEDIS y sucursales", "Transferencias"],
  },
  {
    icon: Route,
    name: "Distribución",
    kicker: "03 / lleva la señal",
    description: "Del pedido confirmado a la entrega documentada.",
    items: ["Rutas y pedidos", "GPS de ruta activa", "Evidencias", "Liquidación"],
  },
  {
    icon: ClipboardList,
    name: "Gestión",
    kicker: "04 / lee el pulso",
    description: "Un tablero común para decidir sin perseguir datos.",
    items: ["Dashboard y reportes", "Caja y cierres", "Empleados", "Roles y permisos"],
  },
  {
    icon: ShieldCheck,
    name: "Fiscal",
    kicker: "05 / cierra el ciclo",
    description: "La operación comercial y la responsabilidad fiscal, conectadas.",
    items: ["Solicitudes", "CFDI", "XML y PDF", "Conciliación y remediación"],
  },
] as const;

export function PlatformOverview() {
  return (
    <section
      aria-labelledby="platform-title"
      className="landing-section landing-platform-section"
      data-platform-sequence
      id="product"
    >
      <div className="landing-container">
        <LandingReveal className="landing-editorial-heading">
          <LandingSectionHeading
            description="No es una colección de pantallas aisladas. Es una forma común de trabajar, medir y responder en cada área de la empresa."
            eyebrow="La plataforma / una señal, muchas decisiones"
            id="platform-title"
            title="La operación cambia de estado. El sistema conserva el hilo."
          />
        </LandingReveal>

        <div className="landing-platform-story">
          <aside className="landing-platform-story__rail" aria-label="Etapas de la plataforma">
            <p className="landing-rail-label">Recorrido operativo</p>
            <ol>
              {platformAreas.map(({ name }, index) => (
                <li data-platform-step key={name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{name}</strong>
                </li>
              ))}
            </ol>
            <div className="landing-platform-story__rail-note">
              <Activity aria-hidden="true" size={16} />
              <span>La señal no se corta entre equipos.</span>
            </div>
          </aside>

          <div className="landing-platform-stage" data-platform-stage>
            <div className="landing-platform-stage__orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            {platformAreas.map(({ description, icon: Icon, items, kicker, name }, index) => (
              <article
                aria-labelledby={`platform-panel-${index}`}
                className="landing-platform-panel"
                data-platform-panel
                key={name}
              >
                <div className="landing-platform-panel__meta">
                  <span className="landing-platform-panel__icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span>{kicker}</span>
                </div>
                <h3 id={`platform-panel-${index}`}>{name}</h3>
                <p>{description}</p>
                <div className="landing-platform-panel__items">
                  {items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="landing-platform-panel__footer">
                  <span>estado de la señal</span>
                  <strong>{index === platformAreas.length - 1 ? "trazable" : "en movimiento"}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
