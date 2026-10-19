import { useEffect, useRef, useState, type FormEvent } from "react";
import { getCommercialAction, getCommercialConfig } from "../config/commercialConfig";
import { getLandingDemoRequestUrl } from "../config/landingConfig";
import { submitDemoRequest, DemoRequestError, type DemoReceipt } from "../services/demoRequest";
import { LandingButton } from "./LandingButton";
import s from "../styles/landing.module.css";

export function FinalCta() {
  const config = getCommercialConfig();
  const action = getCommercialAction();
  const externalDemo = getLandingDemoRequestUrl();
  const startedAt = useRef(0);
  const inFlight = useRef(false);
  const retry = useRef({ fingerprint: "", key: "" });
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
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
      const lead = {
        name: String(data.get("name") || ""), email: String(data.get("email") || ""),
        company: String(data.get("company") || ""), message: String(data.get("message") || ""),
        phone: String(data.get("phone") || ""), interest: String(data.get("interest") || ""),
        consent: data.get("consent") === "on", website: String(data.get("website") || ""),
      };
      const fingerprint = JSON.stringify(lead);
      if (retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
      const result = await submitDemoRequest(lead, config.endpoint, retry.current.key, config.consentVersion);
      setReceipt(result);
      setStatus("success"); form.reset();
    } catch (error) { setError(error instanceof DemoRequestError ? error.message : "No se confirmó la recepción. Revisa tu conexión e intenta nuevamente."); setStatus("error"); }
    finally { inFlight.current = false; }
  }
  return (
    <section id="demo" className={s.finalCta} aria-labelledby="cta-title" data-final-cta>
      <div className={`${s.container} ${s.finalCtaInner}`}>
        <span id="plans" className={s.anchor} aria-hidden="true" />
        <h2 id="cta-title" data-cta-headline>Conoce el ERP con tu operación en mente.</h2>
        <p className={s.finalCtaDescription}>{action.kind === "explore" ? "Explora cómo se conectan ventas, inventario, entregas y cobranza. Identifica los módulos que tu empresa necesita." : "Cuéntanos qué necesita tu empresa. Revisaremos tu operación para mostrarte cómo el ERP puede ayudarte."}</p>
        {config.canSubmit ? <form className={s.demoForm} onSubmit={submit} aria-busy={status === "loading"}>
          {config.localCapture && <p role="note" className={s.consent}>Modo de prueba local: usa solo datos sintéticos. Los correos se capturan localmente; no se envían al propietario.</p>}
          <label>Nombre completo<input name="name" autoComplete="name" required maxLength={100} disabled={status === "loading"} /></label>
          <label>Correo de contacto<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={status === "loading"} /></label>
          <label>Empresa o negocio<input name="company" autoComplete="organization" required maxLength={160} disabled={status === "loading"} /></label>
          <label>Teléfono o WhatsApp (opcional)<input name="phone" type="tel" autoComplete="tel" maxLength={40} disabled={status === "loading"} /></label>
          <label>Área de interés (opcional)<select name="interest" disabled={status === "loading"} defaultValue=""><option value="">Selecciona un área</option><option value="ventas">Ventas</option><option value="inventario">Inventario</option><option value="logistica">Logística</option><option value="cobranza">Cobranza</option><option value="erp">ERP completo</option></select></label>
          <label>Mensaje o necesidades del negocio (opcional)<textarea name="message" rows={3} maxLength={2000} disabled={status === "loading"} /></label>
          <div className={s.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className={s.consent}><input name="consent" type="checkbox" required disabled={status === "loading"} />
            <span>Autorizo el uso de mis datos para responder esta solicitud. <a href={config.privacyUrl}>Aviso de privacidad</a>.</span>
          </label>
          <button type="submit" className={`${s.button} ${s.primary}`} disabled={status === "loading" || status === "success"}>{status === "loading" ? "Enviando…" : status === "success" ? "Solicitud recibida" : "Solicitar demostración"}</button>
          <div role="status" aria-live="polite" tabIndex={-1} ref={node => { if (node && (status === "success" || status === "error")) node.focus({ preventScroll: true }); }}>
            {status === "success" ? <><strong>¡Solicitud recibida!</strong><p>Gracias por tu interés. Hemos registrado tu solicitud y podremos contactarte mediante los datos proporcionados.</p><p>{receipt?.duplicate ? "Esta solicitud ya estaba registrada. No se creó otra." : receipt?.receipt === "delivered" ? "Solicitud entregada correctamente." : "Solicitud guardada correctamente."} {receipt?.notification !== "sent" ? "La notificación al equipo está pendiente; no necesitas reenviar." : "Notificación enviada al equipo."}</p><small>Referencia: {receipt?.reference}</small></> : status === "error" ? error : ""}
          </div>
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
