import { LANDING_BRAND } from "../config/landingConfig";
import { useId, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { getProductCapture, type ProductImageKey } from "../config/productModules";
import s from "../styles/landing.module.css";

type Props = { image: ProductImageKey; title: string; caption: string; priority?: boolean; instant?: boolean };

export function ProductCapture({ image, title, caption, priority = false, instant = false }: Props) {
  const capture = getProductCapture(image);
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null);
  const [failedFullSrc, setFailedFullSrc] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const available = Boolean(capture.src) && failedPreviewSrc !== capture.src;

  function closeZoom() {
    dialog.current?.close();
    setZoomed(false);
    trigger.current?.focus();
  }
  function previewImageFailed() {
    setFailedPreviewSrc(capture.src);
    if (dialog.current?.open) closeZoom();
  }

  return <figure className={s.evidenceFrame} data-portrait={capture.portrait || undefined} data-instant={instant || undefined} data-missing={!capture.src || undefined}>
    <div className={s.evidenceToolbar}>
      <span>{title}</span>
      {available && <button ref={trigger} type="button" aria-label={`Ampliar captura de ${title}`} onClick={() => {
        setZoomed(true);
        dialog.current?.showModal();
      }}><Maximize2 size={16} aria-hidden="true" /><span>Ampliar</span></button>}
    </div>
    <div className={s.evidenceCanvas}>
      {available ? <img key={capture.src} src={capture.src} alt={`Captura real de ${LANDING_BRAND.productName}: ${title}`} width={capture.width} height={capture.height}
        loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={previewImageFailed} />
        : <div className={s.evidenceUnavailable} role="status">
          <p>{capture.src ? "No se pudo cargar esta captura." : "Esta vista no tiene una captura disponible."}</p>
          <p>El alcance del módulo permanece visible. No se muestra una interfaz simulada.</p>
          {capture.src && <button type="button" onClick={() => setFailedPreviewSrc(null)}>Reintentar captura</button>}
        </div>}
    </div>
    <figcaption className={s.evidenceCaption}>{caption}</figcaption>
    <dialog ref={dialog} className={s.captureDialog} aria-labelledby={`${id}-title`} data-lenis-prevent
      onCancel={event => { event.preventDefault(); closeZoom(); }} onClose={() => { setZoomed(false); trigger.current?.focus(); }}>
      <div className={s.evidenceToolbar}><h3 id={`${id}-title`}>{title}</h3><button ref={closeButton} type="button" aria-label="Cerrar captura ampliada" onClick={closeZoom}><X size={20} aria-hidden="true" /></button></div>
      {zoomed && (failedFullSrc === capture.full
        ? <div className={`${s.captureZoomCanvas} ${s.evidenceUnavailable}`} role="status">
          <p>No se pudo cargar la ampliación de esta captura.</p>
          <p>La captura previa permanece disponible al cerrar esta vista.</p>
          <button type="button" aria-label="Reintentar captura ampliada" onClick={() => {
            closeButton.current?.focus();
            setFailedFullSrc(null);
          }}>Reintentar ampliación</button>
        </div>
        : <div className={s.captureZoomCanvas}><img src={capture.full} alt={`Captura ampliada de ${LANDING_BRAND.productName}: ${title}`} width={capture.fullWidth} height={capture.fullHeight} onError={() => setFailedFullSrc(capture.full)} /></div>)}
      <p className={s.evidenceCaption}>{caption}</p>
    </dialog>
  </figure>;
}
