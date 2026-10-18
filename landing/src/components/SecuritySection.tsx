import { KeyRound, ListChecks, MapPinned } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

const safeguards = [
  { title: "Roles y permisos", description: "Define qué herramientas utiliza cada perfil del equipo.", Icon: KeyRound },
  { title: "Contexto de ubicación", description: "Consulta inventario y movimientos vinculados a su ubicación operativa.", Icon: MapPinned },
  { title: "Trazabilidad operativa", description: "Ventas, pagos y movimientos conservan sus referencias para revisión.", Icon: ListChecks },
] as const;

export function SecuritySection() {
  return (
    <section id="security" className={`${s.section} ${s.securitySection}`} aria-labelledby="security-title">
      <div className={s.container}>
        <SectionHeading
          id="security-title"
          title="Confianza en lo que el equipo registra."
          description="Controles de acceso y trazabilidad para trabajar con claridad, sin promesas que el producto no necesita."
        />
        <div className={s.securityRows}>
          {safeguards.map(({ title, description, Icon }) => (
            <article key={title}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
