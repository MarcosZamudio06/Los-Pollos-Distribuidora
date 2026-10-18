import { useEffect, useRef, useState, type FormEvent } from "react";
import { getCommercialAction, getCommercialConfig } from "../config/commercialConfig";
import { getLandingDemoRequestUrl } from "../config/landingConfig";
import { submitDemoRequest } from "../services/demoRequest";
import { LandingButton } from "./LandingButton";
import s from "../styles/landing.module.css";

export function FinalCta() {
  const config = getCommercialConfig();
  const action = getCommercialAction();
  const externalDemo = getLandingDemoRequestUrl();
  const startedAt = useRef(0);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  useEffect(() => { startedAt.current = Date.now(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !config.canSubmit) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (Date.now() - startedAt.current < 2000 || data.get("website")) {
      setError("Revisa tus datos antes de enviar."); setStatus("error"); return;
    }
    inFlight.current = true; setStatus("loading");
    try {
      await submitDemoRequest({
        name: String(data.get("name") || ""), email: String(data.get("email") || ""),
        company: String(data.get("company") || ""), message: String(data.get("message") || ""),
        consent: data.get("consent") === "on", website: String(data.get("website") || ""),
      }, config.endpoint);
      setStatus("success"); form.reset();
    } catch { setError("No se confirmó la recepción. Revisa tu conexión e intenta nuevamente."); setStatus("error"); }
    finally { inFlight.current = false; }
  }
  return (
    <section id="demo" className={s.finalCta} aria-labelledby="cta-title" data-final-cta>
      <div className={`${s.container} ${s.finalCtaInner}`}>
        <span id="plans" className={s.anchor} aria-hidden="true" />
        <h2 id="cta-title" data-cta-headline>Conoce el ERP con tu operación en mente.</h2>
        <p className={s.finalCtaDescription}>{action.kind === "explore" ? "Explora cómo se conectan ventas, inventario, entregas y cobranza. Identifica los módulos que tu empresa necesita." : "Cuéntanos cómo vendes, dónde guardas tu inventario y cómo entregas. La evaluación parte de los módulos que tu empresa necesita."}</p>
        {config.canSubmit ? <form className={s.demoForm} onSubmit={submit} aria-busy={status === "loading"}>
          <label>Nombre<input name="name" autoComplete="name" required maxLength={100} disabled={status === "loading"} /></label>
          <label>Correo de contacto<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={status === "loading"} /></label>
          <label>Empresa<input name="company" autoComplete="organization" required maxLength={160} disabled={status === "loading"} /></label>
          <label>¿Qué necesitas organizar?<textarea name="message" rows={3} maxLength={2000} disabled={status === "loading"} /></label>
          <div className={s.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className={s.consent}><input name="consent" type="checkbox" required disabled={status === "loading"} />
            <span>Autorizo el uso de mis datos para responder esta solicitud. <a href={config.privacyUrl}>Aviso de privacidad</a>.</span>
          </label>
          <button type="submit" className={`${s.button} ${s.primary}`} disabled={status === "loading" || status === "success"}>{status === "loading" ? "Enviando…" : status === "success" ? "Solicitud recibida" : "Solicitar demostración"}</button>
          <p role="status" aria-live="polite">{status === "success" ? "El servicio confirmó la recepción de tu solicitud." : status === "error" ? error : ""}</p>
        </form> : externalDemo ? <LandingButton href={externalDemo}>Solicitar demostración</LandingButton> : action.kind === "email" ? <LandingButton href={action.href}>{action.label}</LandingButton> : null}
        <div className={s.heroActions}>
          <LandingButton href="#erp-gallery" tone={action.kind === "explore" ? "primary" : "secondary"}>Explorar el ERP</LandingButton>
          {config.loginUrl && <LandingButton href={config.loginUrl} tone="secondary">Acceso clientes</LandingButton>}
        </div>
        <svg className={s.ctaSignal} aria-hidden="true" viewBox="0 0 1000 200" preserveAspectRatio="none"><path d="M0 164 C198 164 188 32 400 32 S608 168 790 168 S890 82 1000 82" data-cta-signal-path /></svg>
      </div>
    </section>
  );
}
