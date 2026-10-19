import { KeyRound, ListChecks, MapPinned } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

const safeguards = [
  { title: "Roles y permisos", description: "Delimita las herramientas de cada perfil para que cada persona trabaje con el acceso que le corresponde.", Icon: KeyRound },
  { title: "Contexto de ubicación", description: "Conoce dónde está la mercancía y revisa sus movimientos sin confundir existencias de distintas ubicaciones.", Icon: MapPinned },
  { title: "Trazabilidad operativa", description: "Revisa el origen de una venta, un pago o un movimiento sin perder sus referencias.", Icon: ListChecks },
] as const;

export function SecuritySection() {
  return (
    <section id="security" className={`${s.section} ${s.securitySection}`} aria-labelledby="security-title">
      <div className={s.container}>
        <SectionHeading
          id="security-title"
          title="Confianza en lo que el equipo registra."
          description="Quién puede operar, dónde está la mercancía y qué quedó registrado: controles concretos que puedes revisar en el recorrido del producto."
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
