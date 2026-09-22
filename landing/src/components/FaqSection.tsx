import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LandingReveal, LandingSectionHeading } from "./LandingPrimitives";

const questions = [
  {
    answer:
      "Sí. El ERP trabaja con ubicaciones operativas como sucursales, almacenes, CEDIS, puntos de venta externos y stock de ruta, con permisos y flujos según el rol.",
    question: "¿El ERP puede utilizarse en varias sucursales?",
  },
  {
    answer:
      "Sí. Cada venta, compra, ajuste, traspaso y saldo de inventario conserva la ubicación operativa correspondiente. No se presenta un stock global como fuente de verdad.",
    question: "¿Puedo controlar ventas e inventario por ubicación?",
  },
  {
    answer:
      "Incluye planeación, optimización de la secuencia de una ruta, GPS de la ruta activa, posiciones de flota, zonas, incidencias, evidencias y liquidación. No incluye tráfico en vivo, navegación giro a giro ni modo offline.",
    question: "¿Cuenta con herramientas para reparto?",
  },
  {
    answer:
      "Sí. Las ventas a crédito generan cuentas por cobrar y el sistema permite registrar pagos o abonos, consultar vencidos y aplicar controles de crédito. Cada pago de cobranza se asocia a una sola cuenta.",
    question: "¿Puede manejar ventas a crédito?",
  },
  {
    answer:
      "Sí, mediante planos de datos independientes por empresa: base de datos, almacenamiento, credenciales, dominio/TLS y respaldos separados. No es un selector multiempresa dentro de una misma base.",
    question: "¿Está preparado para varias empresas?",
  },
  {
    answer:
      "El repositorio incluye solicitudes de facturación, emisión nativa de CFDI, estados fiscales, XML/PDF, conciliación y remediaciones con controles de acceso. La emisión requiere configuración fiscal y un proveedor habilitado.",
    question: "¿Incluye facturación?",
  },
] as const;

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  return (
    <section aria-labelledby="faq-title" className="landing-section landing-faq-section" id="faq">
      <div className="landing-container landing-faq-layout">
        <LandingReveal className="landing-faq-intro">
          <LandingSectionHeading
            description="Respuestas concretas sobre lo que el producto hace hoy y los límites que preferimos dejar claros."
            eyebrow="Preguntas frecuentes"
            id="faq-title"
            title="Antes de hablar de una demo."
          />
          <p className="landing-faq-aside">
            ¿No encuentras tu caso? La demostración puede partir de tu operación real y sus reglas,
            no de una presentación genérica.
          </p>
        </LandingReveal>

        <div className="landing-faq-list">
          {questions.map(({ answer, question }, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;
            return (
              <div className={`landing-faq-item${isOpen ? " is-open" : ""}`} key={question}>
                <button
                  aria-controls={answerId}
                  aria-expanded={isOpen}
                  className="landing-faq-trigger"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  type="button"
                >
                  <span>{question}</span>
                  <ChevronDown aria-hidden="true" size={18} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      className="landing-faq-answer"
                      exit={{ height: 0, opacity: 0 }}
                      id={answerId}
                      initial={{ height: 0, opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p>{answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
