import { Plus } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

const questions = [
  ["¿Puedo controlar inventario por sucursal?", "Sí. Los saldos y movimientos conservan su ubicación operativa, como una sucursal, un almacén o un centro de distribución. El acceso depende de los permisos del usuario."],
  ["¿Puede manejar ventas a crédito?", "Sí. Las ventas a crédito generan cuentas por cobrar. Puedes registrar pagos o abonos y consultar saldos vencidos. Cada pago de cobranza corresponde a una cuenta."],
  ["¿Qué herramientas tiene el repartidor?", "Puede consultar su ruta, revisar pedidos asignados y registrar entregas, incidencias y evidencias. No se promete navegación giro a giro ni operación offline."],
  ["¿Quién puede acceder al ERP?", "El acceso requiere una cuenta. Los roles y permisos determinan las herramientas disponibles para ventas, almacén, cobranza, reparto y administración."],
  ["¿Qué operaciones encajan?", "Ventas de mostrador, mayoristas e institucionales, sucursales abastecidas por CEDIS y reparto con cobranza. El inventario siempre conserva su ubicación operativa."],
  ["¿Cómo evaluamos la implementación?", "Primero se revisan ubicaciones, usuarios y flujo de ventas. Después se seleccionan los módulos y se valida el recorrido con datos de demostración. Alcance, despliegue, migración, capacitación y condiciones se acuerdan antes de contratar; no hay plazos ni servicios incluidos prometidos en esta página."],
  ["¿Qué depende de configuración?", "El monitoreo necesita posiciones y servicios geoespaciales habilitados. La emisión fiscal necesita configuración del emisor y un proveedor habilitado; las solicitudes administrativas y los tickets no son CFDI. Confirma estas condiciones durante la evaluación."],
  ["¿Cómo se despliega y contrata?", "La landing pública está separada del ERP autenticado. El repositorio contempla despliegue con contenedores; infraestructura, soporte y condiciones comerciales requieren evaluación y acuerdo. No se anuncian precios ni garantías de disponibilidad."],
] as const;

export function FaqSection() {
  return (
    <section id="faq" className={`${s.section} ${s.surface}`} aria-labelledby="faq-title">
      <div className={s.container}>
        <SectionHeading id="faq-title" title="Preguntas antes de decidir." />
        <div className={s.faqList}>
          {questions.map(([question, answer]) => <details key={question}>
            <summary>{question}<Plus aria-hidden="true" size={20} /></summary>
            <p>{answer}</p>
          </details>)}
        </div>
      </div>
    </section>
  );
}
