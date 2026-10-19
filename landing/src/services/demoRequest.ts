import { receiverUrl } from "../config/commercialConfig";
export type DemoRequest = { name: string; email: string; company: string; phone?: string; interest?: string; message: string; consent: boolean; website: string };
export type DemoReceipt = { accepted: true; reference: string; receipt: "stored" | "delivered"; duplicate: boolean; notification: "pending" | "sent" | "reconciliation_required" };
export async function submitDemoRequest(lead: DemoRequest, endpoint: string, requestKey: string = crypto.randomUUID(), consentVersion = "demo-contact-v1"): Promise<DemoReceipt> {
  if (!receiverUrl(endpoint) || lead.website || !lead.consent ||
    !lead.name.trim() || !lead.company.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim()) ||
    lead.name.length > 100 || lead.company.length > 160 || lead.email.length > 254 || lead.message.length > 2000 ||
    (lead.phone || "").length > 40 || !/^[0-9+() .-]*$/.test(lead.phone || "") ||
    !["", "ventas", "inventario", "logistica", "cobranza", "erp"].includes(lead.interest || "") ||
    [lead.name, lead.company, lead.email, lead.phone || ""].some(value => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
    throw new Error("Revisa los datos y el consentimiento antes de enviar.");
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST", credentials: "omit", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify({ ...lead, phone: lead.phone || "", interest: lead.interest || "", name: lead.name.trim(), company: lead.company.trim(), email: lead.email.trim(), source: "landing-demo", consentVersion }),
    });
    if (!response.ok) throw new Error("No se recibió la solicitud. Intenta de nuevo más tarde.");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("accepted" in result) || result.accepted !== true ||
      !("reference" in result) || typeof result.reference !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(result.reference.replaceAll("-", "_")) ||
      !("receipt" in result) || !["stored", "delivered"].includes(String(result.receipt)) ||
      !("duplicate" in result) || typeof result.duplicate !== "boolean" ||
      !("notification" in result) || !["pending", "sent", "reconciliation_required"].includes(String(result.notification))) {
      throw new Error("El servicio no confirmó un registro duradero. Intenta de nuevo más tarde.");
    }
    return result as DemoReceipt;
  } finally { window.clearTimeout(timeout); }
}
