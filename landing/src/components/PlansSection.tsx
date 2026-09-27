import { ArrowDownRight, Boxes, Building2, FileCheck2, Route, Sparkles } from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const plans = [
  {
    description: "Empieza con una operación comercial que conserva ubicación, contexto y trazabilidad.",
    icon: Boxes,
    items: ["Ventas", "Inventario", "Compras", "Cobranza", "CEDIS"],
    name: "ERP Operación",
    note: "La base para trabajar con claridad.",
    recommended: false,
  },
  {
    description: "Suma el ciclo fiscal a la operación, con habilitación según configuración y proveedor fiscal.",
    icon: FileCheck2,
    items: ["CFDI", "XML y PDF", "REP", "Conciliación"],
    name: "ERP Fiscal",
    note: "Habilitación fiscal según configuración.",
    recommended: true,
  },
  {
    description: "Lleva el mismo hilo hasta la calle: planeación, flota, ruta, entrega y evidencia.",
    icon: Route,
    items: ["Rutas", "GPS contextual", "Flota", "Entregas"],
    name: "ERP 360",
    note: "Para conectar operación y distribución.",
    recommended: false,
  },
  {
    description: "Extiende la plataforma a empresas con planos de datos, infraestructura y continuidad independientes.",
    icon: Building2,
    items: ["Empresas aisladas", "Infraestructura", "Backups"],
    name: "ERP Corporativo",
    note: "Tecnología común. Operaciones separadas.",
    recommended: false,
  },
] as const;

type PlansSectionProps = {
  onSelectPlan: (plan: string) => void;
};

export function PlansSection({ onSelectPlan }: PlansSectionProps) {
  return (
    <section aria-labelledby="plans-title" className="landing-section landing-plans-section" id="plans">
      <div className="landing-container">
        <LandingReveal className="landing-plans-intro">
          <LandingSectionHeading
            description="Empieza con lo que necesitas y amplía la señal sin cambiar de plataforma. Cada etapa agrega capacidad real, no límites artificiales."
            eyebrow="Soluciones / una plataforma que crece contigo"
            id="plans-title"
            title="Elige el siguiente tramo de tu operación."
          />
          <p className="landing-plans-intro__note">
            Cotización personalizada para cada operación, alcance y configuración.
          </p>
        </LandingReveal>

        <ol aria-label="Opciones de ERP" className="landing-plans-list">
          {plans.map(({ description, icon: Icon, items, name, note, recommended }, index) => (
            <li className="landing-plan" key={name}>
              <div className="landing-plan__index" aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={18} strokeWidth={1.7} />
              </div>
              <div className="landing-plan__content">
                <div className="landing-plan__heading">
                  <div>
                    <span className="landing-plan__kicker">{note}</span>
                    <h3>{name}</h3>
                  </div>
                  {recommended && (
                    <span className="landing-plan__recommended">
                      <Sparkles aria-hidden="true" size={13} />
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="landing-plan__description">{description}</p>
                <div className="landing-plan__items">
                  {items.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
              <a
                className="landing-plan__action"
                href="#demo"
                onClick={() => onSelectPlan(name)}
              >
                Solicitar demostración
                <ArrowDownRight aria-hidden="true" size={17} />
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
