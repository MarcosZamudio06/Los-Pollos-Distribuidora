import { publicUrl } from "../config/commercialConfig";
export type DemoRequest = { name: string; email: string; company: string; message: string; consent: boolean; website: string };
export async function submitDemoRequest(lead: DemoRequest, endpoint: string) {
  if (!publicUrl(endpoint) || lead.website || !lead.consent ||
    !lead.name.trim() || !lead.company.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) ||
    lead.name.length > 100 || lead.company.length > 160 || lead.email.length > 254 || lead.message.length > 2000) {
    throw new Error("Revisa los datos y el consentimiento antes de enviar.");
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST", credentials: "omit", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, name: lead.name.trim(), company: lead.company.trim(), email: lead.email.trim(), source: "landing-demo", consentVersion: "demo-contact-v1" }),
    });
    if (!response.ok) throw new Error("No se recibió la solicitud. Intenta de nuevo más tarde.");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("accepted" in result) || result.accepted !== true) {
      throw new Error("El servicio no confirmó la recepción. Intenta de nuevo más tarde.");
    }
  } finally { window.clearTimeout(timeout); }
}
