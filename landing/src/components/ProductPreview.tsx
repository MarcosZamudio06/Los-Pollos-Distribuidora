import { ProductCapture } from "./ProductCapture";
import s from "../styles/landing.module.css";

export function ProductPreview() {
  return <div id="hero-product" className={s.heroEvidence} data-hero-visual>
    <ProductCapture image="heroDashboard" title="Dashboard" priority caption="Pantalla real del ERP · entorno de demostración. Los valores visibles no representan resultados de clientes. La identidad visible pertenece al entorno capturado." />
  </div>;
}
