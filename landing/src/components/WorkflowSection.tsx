import { useState } from "react";
import { ProductCapture } from "./ProductCapture";
import { SectionHeading } from "./SectionHeading";
import type { ProductImageKey } from "../config/productModules";
import s from "../styles/landing.module.css";

const stages: { label: string; title: string; detail: string; image: ProductImageKey; caption: string }[] = [
  { label: "Venta", title: "El punto de partida es una venta.", detail: "Ubicación, productos, cliente, condición comercial y pagos conservan su relación. La captura muestra una venta en preparación, no una operación confirmada.", image: "pos", caption: "POS real · dos partidas en carrito y turno sin abrir." },
  { label: "Inventario", title: "La mercancía conserva su ubicación.", detail: "Existencias, reservas, suministros y devoluciones mantienen su contexto operativo. Una sucursal recibe suministros desde su CEDIS padre, no compras externas directas.", image: "cedis", caption: "Contexto administrativo de CEDIS y sucursales; no es una captura de saldos de inventario." },
  { label: "Ruta", title: "El pedido encuentra su recorrido.", detail: "Agrupa pedidos confirmados y asigna conductor y vehículo. La planeación geoespacial depende de coordenadas y servicios habilitados; no equivale a tráfico en vivo.", image: "fleet", caption: "Planificador administrativo de rutas con cero paradas cargadas y sin distancia ni duración calculadas; no es seguimiento de flota ni una entrega comercial." },
  { label: "Entrega", title: "Lo ocurrido en ruta queda relacionado.", detail: "El repartidor registra el resultado, las incidencias y las evidencias del pedido conforme a sus permisos. No se promete funcionamiento offline.", image: "driverStop", caption: "Vista móvil real de un traslado CEDIS en ruta: no una entrega a cliente confirmada. La llegada requiere GPS reciente; no registra cobros ni movimientos de inventario." },
  { label: "Cobranza", title: "Un pago. Una cuenta por cobrar.", detail: "Cada pago de cobranza se aplica a una sola cuenta. Consulta saldos y vencimientos sin confundir una entrega con un cobro ni una venta con un ingreso recibido.", image: "collections", caption: "Resumen de cobranza del dashboard real · valores de demostración." },
  { label: "Cierre", title: "La jornada termina con una revisión.", detail: "Ventas, pagos y diferencias se revisan por ubicación. El cierre diario no sustituye la liquidación de una ruta ni oculta faltantes o sobrantes.", image: "closing", caption: "Vista real de turnos y cierre diario; estados conservados de la captura aprobada." },
];

export function WorkflowSection() {
  const [index, setIndex] = useState(0);
  const [instant, setInstant] = useState(false);
  const current = stages[index];
  return <section id="operation" className={`${s.section} ${s.operationSection}`} aria-labelledby="operation-title" data-operation-story>
    <div className={s.container}>
      <SectionHeading id="operation-title" title="Cada movimiento conserva su contexto." description="Un recorrido de ejemplo: no toda venta requiere entrega ni toda entrega implica un cobro. Cada área conserva su responsabilidad." />
      <ol className={s.operationSteps} aria-label="Recorrido de la operación">{stages.map((stage, item) => <li key={stage.label}>
        <button type="button" aria-pressed={item === index} aria-controls="workflow-detail" onClick={event => { setInstant(event.detail === 0); setIndex(item); }}>
          <span aria-hidden="true">{`0${item + 1}`}</span>{stage.label}
        </button>
      </li>)}</ol>
      <div className={s.operationRail} aria-hidden="true"><span style={{ transform: `scaleX(${(index + 1) / stages.length})` }} data-instant={instant || undefined} /></div>
      <div id="workflow-detail" data-workflow-detail className={s.operationDetail}>
        <div className={s.operationCopy}><h3>{current.title}</h3><p>{current.detail}</p><p className={s.operationHint}>Selecciona una etapa para conocer su contexto.</p></div>
        <ProductCapture key={current.label} image={current.image} title={current.label} caption={current.caption} instant={instant} />
      </div>
    </div>
  </section>;
}
