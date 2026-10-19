import { LANDING_BRAND } from "../config/landingConfig";
import { Building2, Layers3, MapPinned } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

const companyLayers = [
  ["Ventas y cobranza", Building2],
  ["Inventario por ubicación", MapPinned],
  ["Equipo y permisos", Layers3],
] as const;

export function CompanySection() {
  return (
    <section id="company" className={`${s.section} ${s.companySection}`} aria-labelledby="company-title" data-isolation-sequence>
      <div className={s.container}>
        <SectionHeading
          id="company-title"
          title="Cada empresa, con su propio contexto."
          description="La plataforma es común; los datos, ubicaciones y accesos permanecen separados en despliegues independientes por empresa. No es un selector de empresas dentro de una misma sesión."
        />
        <div className={s.companyDiagram}>
          <div className={s.companyOrigin} data-isolation-origin>
            <span className="landing-isolation-sequence__origin-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>{LANDING_BRAND.productName}</span>
          </div>
          <svg className={s.companyBranches} aria-hidden="true" viewBox="0 0 1000 180" preserveAspectRatio="none">
            <path d="M500 0 V66" data-isolation-trunk />
            <path d="M500 66 C500 112 245 100 245 180" data-isolation-branch />
            <path d="M500 66 C500 112 755 100 755 180" data-isolation-branch />
          </svg>
          <div className={s.companyPlanes}>
            {["Empresa", "Otra empresa"].map((company, index) => (
              <article className={s.companyPlane} data-company-plane key={`${company}-${index}`} aria-label={`Espacio de ${company.toLowerCase()}`}>
                <h3>{company}</h3>
                <ul>
                  {companyLayers.map(([label, Icon]) => (
                    <li data-company-layer key={label}>
                      <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
