import { Barcode, CircleDollarSign, MapPin, ReceiptText, Ruler, WalletCards } from "lucide-react";
import { LANDING_IMAGES } from "../config/landingImages";
import { LandingPointerFrame, LandingReveal, LandingSectionHeading } from "./LandingPrimitives";
import { LandingProductImage } from "./LandingProductImage";

const posSignals = [
  { icon: Barcode, label: "Código" },
  { icon: Ruler, label: "KG / pieza" },
  { icon: WalletCards, label: "Crédito" },
  { icon: ReceiptText, label: "Ticket" },
] as const;

const posNotes = [
  "Búsqueda por código de barras, SKU, nombre o QR.",
  "Kilos, piezas y equivalencias aplicables por producto.",
  "Contado, crédito, pagos y cartera en el mismo flujo.",
  "Disponibilidad de la ubicación que realmente vende.",
] as const;

export function PosSection() {
  return (
    <section aria-labelledby="pos-title" className="landing-section landing-pos-section" id="features">
      <div className="landing-container landing-pos-layout">
        <LandingReveal className="landing-pos-copy">
          <LandingSectionHeading
            description="Una caja pensada para capturar con velocidad y confirmar con contexto: producto, cliente, ubicación, documento y cobro en el mismo flujo."
            eyebrow="Comercial / POS"
            id="pos-title"
            title="Vende rápido. Mantén el control."
          />
          <ul className="landing-pos-notes">
            {posNotes.map((note, index) => (
              <li key={note}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{note}</p>
              </li>
            ))}
          </ul>
        </LandingReveal>

        <LandingPointerFrame className="landing-pos-visual" data-pos-visual>
          <div className="landing-pos-visual__header">
            <span>
              <CircleDollarSign aria-hidden="true" size={15} />
              caja / venta
            </span>
            <span>interfaz de demostración</span>
          </div>
          <div className="landing-pos-screen">
            <LandingProductImage
              alt="Captura del punto de venta del ERP"
              aspectRatio="16 / 10"
              label="Captura del POS"
              src={LANDING_IMAGES.pos}
            />
            <div className="landing-pos-screen__footer">
              <span>
                <ReceiptText aria-hidden="true" size={14} />
                Ticket / historial
              </span>
              <span>Vista conceptual</span>
            </div>
          </div>
          <div className="landing-pos-chips" aria-hidden="true">
            {posSignals.map(({ icon: Icon, label }, index) => (
              <span className={`landing-pos-chip landing-pos-chip--${index + 1}`} key={label}>
                <Icon size={14} />
                {label}
              </span>
            ))}
          </div>
          <div className="landing-pos-spotlight" aria-hidden="true" />
          <span className="landing-pos-visual__location" aria-hidden="true">
            <MapPin size={13} /> ubicación activa
          </span>
        </LandingPointerFrame>
      </div>
    </section>
  );
}
