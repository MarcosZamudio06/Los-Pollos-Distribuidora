import { CircleDollarSign, ClipboardList, History, MapPin, WalletCards } from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const financeSteps = [
  ["Venta", "La operación comercial deja contexto."],
  ["Cuenta por cobrar", "El saldo permanece visible."],
  ["Pago", "Cada aplicación conserva su referencia."],
  ["Caja", "El turno puede revisarse."],
  ["Liquidación", "La ruta cierra con evidencia."],
] as const;

const financeRows = [
  ["Cuenta por cobrar", "Saldo pendiente", "Seguimiento"],
  ["Pago registrado", "Aplicado a una cuenta", "Trazable"],
  ["Caja / turno", "Corte operativo", "Revisable"],
  ["Ruta", "Cobros y diferencias", "Liquidable"],
] as const;

export function FinanceSection() {
  return (
    <section aria-labelledby="finance-title" className="landing-section landing-finance-section" data-finance-flow>
      <div className="landing-finance-transition" aria-hidden="true">
        <div className="landing-finance-transition__surface" data-finance-transition-surface />
        <svg preserveAspectRatio="none" viewBox="0 0 900 160">
          <path
            d="M0 94 C180 94 208 30 360 54 S548 142 900 34"
            data-finance-transition-path
            fill="none"
          />
        </svg>
      </div>

      <div className="landing-container" data-finance-content>
        <div className="landing-finance-heading">
          <LandingReveal>
            <LandingSectionHeading
              description="Cartera, pagos, caja y liquidaciones se leen como parte de la misma operación, sin esconder diferencias ni mezclar responsabilidades."
              eyebrow="Cobranza / el pulso se vuelve valor"
              id="finance-title"
              title="El dinero también necesita contexto."
            />
          </LandingReveal>
          <LandingReveal className="landing-finance-heading__mark" delay={0.1}>
            <CircleDollarSign aria-hidden="true" size={28} />
            <span>de la venta al cierre</span>
          </LandingReveal>
        </div>

        <div className="landing-finance-flow">
          <ol className="landing-finance-steps" aria-label="Ciclo financiero operativo">
            {financeSteps.map(([label, detail], index) => (
              <li data-finance-step key={label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </li>
            ))}
          </ol>

          <div className="landing-finance-console">
            <div className="landing-finance-console__header">
              <div>
                <span className="landing-micro-status">CONTROL / CONTEXTO OPERATIVO</span>
                <p>Una lectura que resiste el cierre.</p>
              </div>
              <History aria-hidden="true" size={18} />
            </div>
            <div className="landing-finance-console__rows">
              {financeRows.map(([label, value, status], index) => (
                <div className="landing-finance-row" data-finance-row key={label}>
                  <span className="landing-finance-row__marker" />
                  <div>
                    <strong>{label}</strong>
                    <small>{value}</small>
                  </div>
                  <span>{status}</span>
                  {index === 0 && <WalletCards aria-hidden="true" size={15} />}
                  {index === 1 && <CircleDollarSign aria-hidden="true" size={15} />}
                  {index === 2 && <ClipboardList aria-hidden="true" size={15} />}
                  {index === 3 && <MapPin aria-hidden="true" size={15} />}
                </div>
              ))}
            </div>
            <div className="landing-finance-console__footer">
              <span>con evidencia operativa</span>
              <span>lectura trazable</span>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="landing-finance-exit">
        <div className="landing-finance-exit__surface" data-finance-exit-surface />
        <svg preserveAspectRatio="none" viewBox="0 0 900 150">
          <path
            d="M0 68 C150 68 218 126 350 92 S550 20 690 66 S794 104 900 38"
            data-finance-exit-path
            fill="none"
          />
        </svg>
      </div>
    </section>
  );
}
