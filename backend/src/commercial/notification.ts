import type { LeadDto } from './lead.dto';
import type { LeadConfig } from './config';
import { LeadStore, type MailEnvelope } from './store';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function notification(
  lead: LeadDto,
  id: string,
  received: string,
  config: LeadConfig,
): MailEnvelope {
  const fields = [
    ['Nombre', lead.name],
    ['Empresa', lead.company],
    ['Correo', lead.email],
    ['Teléfono', lead.phone || 'No proporcionado'],
    [
      'Área de interés',
      ({
        ventas: 'Ventas',
        inventario: 'Inventario',
        logistica: 'Logística',
        cobranza: 'Cobranza',
        erp: 'ERP completo',
      }[lead.interest] as string) || 'No indicada',
    ],
    ['Mensaje', lead.message || 'No proporcionado'],
    ['Fecha de recepción', received],
    ['Origen', 'Landing pública'],
    ['Referencia', id],
  ];
  const intro = 'Nueva persona interesada en el ERP.';
  return {
    from: config.from,
    to: [config.to],
    reply_to: lead.email,
    subject: 'Nueva solicitud de demostración — ERP',
    text: `${intro}\n\n${fields.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nResponder: ${lead.email}`,
    html: `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#1c1e1b;color:#f7f3ea;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:24px"><h1 style="color:#fff;font-size:24px">${intro}</h1>${fields.map(([label, value]) => `<p style="overflow-wrap:anywhere;white-space:pre-wrap"><strong>${label}:</strong><br>${escapeHtml(value)}</p>`).join('')}<p><a style="color:#d6ad60" href="mailto:${encodeURIComponent(lead.email)}">Responder por correo</a></p></main></body></html>`,
  };
}
export class NotificationWorker {
  private running = false;
  constructor(
    private readonly store: LeadStore,
    private readonly config: LeadConfig,
    private readonly send: typeof fetch = fetch,
  ) {}
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const job = this.store.claim();
      if (!job) return;
      try {
        if (this.config.provider === 'capture') {
          this.store.capture(job);
          this.store.sent(job, `capture:${job.id}`);
          return;
        }
        const result = await this.send('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `landing-lead/${job.id}`,
          },
          body: job.envelope,
        });
        const body: unknown = await result.json();
        if (
          !result.ok ||
          !body ||
          typeof body !== 'object' ||
          !('id' in body) ||
          typeof body.id !== 'string' ||
          !body.id
        )
          throw new Error('Notification unconfirmed');
        this.store.sent(job, body.id);
      } catch {
        this.store.failed(job);
      }
    } finally {
      this.running = false;
    }
  }
}
