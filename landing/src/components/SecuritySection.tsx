import {
  ClipboardList,
  History,
  LockKeyhole,
  MapPin,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const securityControls = [
  {
    description: "Sesiones y autenticación como puerta de entrada al ERP.",
    icon: LockKeyhole,
    label: "Autenticación",
  },
  {
    description: "Roles y permisos para separar responsabilidades operativas.",
    icon: ShieldCheck,
    label: "Acceso por rol",
  },
  {
    description: "Las ubicaciones limitan lo que cada equipo puede consultar y operar.",
    icon: MapPin,
    label: "Alcance por ubicación",
  },
  {
    description: "Eventos y operaciones críticas conservan una historia revisable.",
    icon: History,
    label: "Auditoría",
  },
  {
    description: "TLS en el borde y dominios independientes por empresa.",
    icon: ClipboardList,
    label: "HTTPS / TLS",
  },
  {
    description: "Backups y recuperación se consideran parte del plano de cada empresa.",
    icon: PackageCheck,
    label: "Continuidad",
  },
] as const;

export function SecuritySection() {
  return (
    <section aria-labelledby="security-title" className="landing-section landing-security-section" id="security">
      <div className="landing-container landing-security-layout">
        <LandingReveal className="landing-security-intro">
          <LandingSectionHeading
            description="Seguridad no es una etiqueta comercial: es una suma de límites, responsabilidades y evidencia operacional."
            eyebrow="Confianza operacional"
            id="security-title"
            title="Control para operar con claridad."
          />
        </LandingReveal>

        <div className="landing-security-ledger">
          {securityControls.map(({ description, icon: Icon, label }, index) => (
            <LandingReveal delay={index * 0.04} key={label}>
              <article className="landing-security-row">
                <span className="landing-security-row__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="landing-security-row__icon"><Icon aria-hidden="true" size={18} /></span>
                <h3>{label}</h3>
                <p>{description}</p>
              </article>
            </LandingReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
