import { SectionHeading } from "./SectionHeading";
import { ProductCapture } from "./ProductCapture";
import s from "../styles/landing.module.css";

export function LogisticsSection() {
  return <section id="logistics" className={`${s.section} ${s.distributionSection}`} aria-labelledby="logistics-title">
    <div className={s.container}>
      <SectionHeading id="logistics-title" title="La operación también llega a la calle." description="Planeación, pedidos asignados y resultados de entrega conservan sus referencias. La evidencia es parte del trabajo, no una pantalla de adorno." />
      <div className={s.distributionLayout}>
        <ProductCapture image="routePlanner" title="Ruta y pedidos asignados" caption="Captura administrativa real. No representa una aplicación nativa, una sesión del repartidor ni seguimiento en vivo." />
        <div className={s.distributionCopy}>
          <h3>Del pedido asignado a la entrega registrada.</h3>
          <p>Una ruta relaciona conductor, vehículo y pedidos. Las entregas conservan estado, incidencias y evidencias para revisión.</p>
          <p>El monitoreo depende de posiciones y servicios habilitados. No se promete tráfico en vivo ni operación offline.</p>
          <a href="#module-tab-driver">Conocer el alcance para repartidores</a>
          <ProductCapture image="driver" title="Repartidor · vista móvil" caption="Sesión web real con traslado CEDIS asignado. El transporte no confirma inventario ni registra una cobranza; no es una aplicación nativa." />
        </div>
      </div>
    </div>
  </section>;
}
