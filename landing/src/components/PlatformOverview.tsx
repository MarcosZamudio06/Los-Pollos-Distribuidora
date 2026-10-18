import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

const stages = [
  {
    id: "commercial",
    label: "Comercial",
    title: "La venta se registra una vez.",
    description: "Punto de venta, pedidos y condición de contado o crédito entran a la misma operación.",
    flow: ["Venta", "Cliente", "Pago"],
  },
  {
    id: "operations",
    label: "Operaciones",
    title: "El inventario conserva su ubicación.",
    description: "Compra, recepción, reservas y transferencias mantienen el contexto de cada producto.",
    flow: ["Compra", "Recepción", "Ubicación"],
  },
  {
    id: "distribution",
    label: "Distribución",
    title: "La ruta conecta el pedido con la entrega.",
    description: "Organiza pedidos asignados y registra entregas, incidencias y evidencia en la operación.",
    flow: ["CEDIS", "Ruta", "Entrega"],
  },
  {
    id: "management",
    label: "Gestión",
    title: "La gestión cierra el recorrido.",
    description: "Cobranza, liquidaciones y cierre diario quedan relacionados con la actividad.",
    flow: ["Cobranza", "Revisión", "Cierre"],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    title: "La fiscalidad parte de información ordenada.",
    description: "Ventas, pagos y cierres mantienen su contexto para consulta administrativa y revisión fiscal.",
    flow: ["Ventas", "Pagos", "Revisión fiscal"],
  },
] as const;

export function PlatformOverview() {
  return (
    <section
      id="product"
      className={`${s.section} ${s.platformSection}`}
      aria-labelledby="product-title"
      data-platform-sequence
    >
      <div className={s.container}>
        <SectionHeading
          id="product-title"
          title="Una señal que recorre toda la operación."
          description="Cada área trabaja con el mismo recorrido: de la venta al control, la entrega, la cobranza y la consulta administrativa."
        />
        <div className={s.platformLayout} data-platform-layout>
          <ol id="features" className={s.platformSteps} aria-label="Etapas de la plataforma">
            {stages.map((stage, index) => (
              <li key={stage.id} data-platform-step aria-current={index === 0 ? "step" : undefined}>
                <span className={s.platformStepNumber}>{`0${index + 1}`}</span>{" "}
                <span>{stage.label}</span>
              </li>
            ))}
          </ol>

          <div className={s.platformStage} data-platform-stage>
            <svg className={s.platformThread} aria-hidden="true" viewBox="0 0 1000 42" preserveAspectRatio="none">
              <path d="M0 21 H1000" data-platform-path />
              <circle cx="0" cy="21" r="4" />
              <circle cx="250" cy="21" r="4" />
              <circle cx="500" cy="21" r="4" />
              <circle cx="750" cy="21" r="4" />
              <circle cx="1000" cy="21" r="4" />
            </svg>
            {stages.map((stage) => (
              <article
                key={stage.id}
                className={s.platformPanel}
                aria-labelledby={`platform-${stage.id}-title`}
                aria-hidden="false"
                data-platform-panel
                data-platform-stage-id={stage.id}
              >
                <div className={s.platformPanelCopy}>
                  <h3 id={`platform-${stage.id}-title`}>{stage.title}</h3>
                  <p>{stage.description}</p>
                </div>
                <ol className={s.platformPanelFlow} aria-label={`Recorrido de ${stage.label.toLowerCase()}`}>
                  {stage.flow.map((label, flowIndex) => (
                    <li key={label}>
                      <span>{label}</span>
                      {flowIndex < stage.flow.length - 1 && <span className={s.flowConnector} aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
