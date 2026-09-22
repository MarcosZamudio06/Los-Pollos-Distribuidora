import { Database, Globe2, HardDrive, KeyRound, ShieldCheck } from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const isolationLayers = [
  { icon: Database, label: "Datos" },
  { icon: HardDrive, label: "Archivos" },
  { icon: KeyRound, label: "Credenciales" },
  { icon: Globe2, label: "Dominio + TLS" },
  { icon: ShieldCheck, label: "Backups" },
] as const;

function CompanyPlane({ name, tone }: { name: string; tone: "amber" | "teal" }) {
  return (
    <article className={`landing-company-plane landing-company-plane--${tone}`} data-company-plane>
      <div className="landing-company-plane__heading">
        <span className="landing-company-plane__node" aria-hidden="true" />
        <div>
          <span>plano independiente</span>
          <h3>{name}</h3>
        </div>
      </div>
      <div className="landing-company-plane__layers">
        {isolationLayers.map(({ icon: Icon, label }) => (
          <span data-company-layer key={label}>
            <Icon aria-hidden="true" size={14} />
            {label}
          </span>
        ))}
      </div>
    </article>
  );
}

export function MultiCompanySection() {
  return (
    <section aria-labelledby="multi-company-title" className="landing-section landing-isolation-section">
      <div className="landing-container">
        <LandingReveal>
          <LandingSectionHeading
            description="El crecimiento repite una unidad completa por empresa: cada operación conserva sus datos, archivos, credenciales, dominio y respaldo."
            eyebrow="Multiempresa / separación real"
            id="multi-company-title"
            title="Una plataforma. Dos planos independientes."
          />
        </LandingReveal>

        <div className="landing-isolation-sequence" data-isolation-sequence>
          <div className="landing-isolation-sequence__origin" data-isolation-origin>
            <span className="landing-isolation-sequence__origin-mark">ERP</span>
            <strong>plataforma</strong>
            <small>la señal encuentra su plano</small>
          </div>
          <svg aria-hidden="true" className="landing-isolation-sequence__line" preserveAspectRatio="none" viewBox="0 0 800 220">
            <path d="M400 18 V94" data-isolation-trunk fill="none" />
            <path d="M400 94 C400 126 176 116 176 202" data-isolation-branch fill="none" />
            <path d="M400 94 C400 126 624 116 624 202" data-isolation-branch fill="none" />
          </svg>
          <div className="landing-company-planes">
            <CompanyPlane name="Empresa A" tone="amber" />
            <CompanyPlane name="Empresa B" tone="teal" />
          </div>
          <p className="landing-isolation-sequence__note">
            Misma tecnología para operar; datos, archivos y continuidad separados desde el origen.
          </p>
        </div>
      </div>
    </section>
  );
}
