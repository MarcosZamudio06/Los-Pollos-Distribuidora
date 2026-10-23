import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CEDIS_CAPTURE_STEPS, PRODUCT_MODULES } from "../config/productModules";
import { ProductCapture } from "./ProductCapture";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

export function ProductGallery() {
  const [compactTabs, setCompactTabs] = useState(() => typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 767px)").matches);
  const [index, setIndex] = useState(() => {
    const found = typeof window === "undefined" ? -1 : PRODUCT_MODULES.findIndex(module => `#module-tab-${module.id}` === window.location.hash);
    return found < 0 ? 0 : found;
  });
  const [instant, setInstant] = useState(false);
  const [cedisCaptureIndex, setCedisCaptureIndex] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = PRODUCT_MODULES[index];
  const cedisCapture = cedisCaptureIndex === null ? undefined : CEDIS_CAPTURE_STEPS[cedisCaptureIndex];
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const updateOrientation = () => setCompactTabs(media.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateOrientation);
      return () => media.removeEventListener("change", updateOrientation);
    }
    media.addListener(updateOrientation);
    return () => media.removeListener(updateOrientation);
  }, []);
  function select(next: number, keyboard = false) {
    setInstant(keyboard);
    setIndex(next);
    // Keep deep links accurate so returning to the same category also works.
    if (window.location.hash.startsWith("#module-tab-")) {
      history.replaceState(null, "", `#module-tab-${PRODUCT_MODULES[next].id}`);
    }
    if (keyboard) {
      tabs.current[next]?.focus();
      tabs.current[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
  }
  useEffect(() => {
    const followFragment = () => {
      const next = PRODUCT_MODULES.findIndex(module => `#module-tab-${module.id}` === window.location.hash);
      if (next < 0) return;
      setInstant(true);
      setIndex(next);
      tabs.current[next]?.focus({ preventScroll: true });
      tabs.current[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    };
    window.addEventListener("hashchange", followFragment);
    return () => window.removeEventListener("hashchange", followFragment);
  }, []);
  function keySelect(event: KeyboardEvent<HTMLButtonElement>) {
    let next: number;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % PRODUCT_MODULES.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index + PRODUCT_MODULES.length - 1) % PRODUCT_MODULES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PRODUCT_MODULES.length - 1;
    else return;
    event.preventDefault();
    select(next, true);
  }
  return <section id="erp-gallery" className={`${s.section} ${s.explorerSection}`} aria-labelledby="gallery-title">
    <div className={s.container}>
      <span id="product" className={s.anchor} /><span id="features" className={s.anchor} />
      <SectionHeading id="gallery-title" title="Elige un área. Conoce la operación." description="¿Qué necesitas coordinar? Revisa las pantallas y el alcance de cada área para identificar los módulos que encajan con tu operación." />
      <div className={s.explorerLayout}>
        <div className={s.explorerRail}>
          <div role="tablist" aria-label="Módulos del ERP" aria-orientation={compactTabs ? "horizontal" : "vertical"} className={s.explorerTabs}>
            {PRODUCT_MODULES.map((module, item) => <button key={module.id} ref={element => { tabs.current[item] = element; }} type="button" role="tab"
              id={`module-tab-${module.id}`} aria-controls="module-panel" aria-selected={index === item} tabIndex={index === item ? 0 : -1}
              onKeyDown={keySelect} onClick={event => select(item, event.detail === 0)}>{module.label}</button>)}
          </div>
          <p className={s.explorerRailNote}>Pantallas del entorno aprobado. Sin datos de clientes presentados como resultados.</p>
        </div>
        <div id="module-panel" role="tabpanel" tabIndex={0} aria-labelledby={`module-tab-${current.id}`} className={s.explorerPanel}>
          <div className={s.explorerPanelHeading}>
            <div><span className={s.moduleGroup}>{current.group}</span><h3>{current.title}</h3></div>
            <div className={s.modulePaging}><button type="button" aria-label="Módulo anterior" onClick={event => select((index + PRODUCT_MODULES.length - 1) % PRODUCT_MODULES.length, event.detail === 0)}><ArrowLeft size={18} /></button><button type="button" aria-label="Módulo siguiente" onClick={event => select((index + 1) % PRODUCT_MODULES.length, event.detail === 0)}><ArrowRight size={18} /></button></div>
          </div>
          <p className={s.moduleDetail}>{current.detail}</p>
          {current.id === "cedis" && <div className={s.cedisCaptureOptions} role="group" aria-label="Capturas del flujo CEDIS">
            {CEDIS_CAPTURE_STEPS.map((capture, captureIndex) => <button
              key={capture.id}
              type="button"
              data-cedis-capture={capture.id}
              aria-pressed={cedisCaptureIndex === captureIndex}
              onClick={() => setCedisCaptureIndex(captureIndex)}
            >{capture.label}</button>)}
          </div>}
          <ProductCapture
            key={`${current.id}-${cedisCapture?.id ?? "overview"}`}
            image={cedisCapture?.image ?? current.image}
            title={cedisCapture?.label ?? current.label}
            caption={cedisCapture?.caption ?? current.note}
            instant={instant}
          />
        </div>
      </div>
    </div>
  </section>;
}
