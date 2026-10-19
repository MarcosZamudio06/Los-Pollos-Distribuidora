import { afterEach, expect, it, vi } from 'vitest';
import { getCommercialConfig, receiverUrl } from '../config/commercialConfig';
import { submitDemoRequest } from '../services/demoRequest';
const lead = { name: 'Synthetic Person', company: 'Synthetic Business', email: 'lead@example.test', phone: '', interest: '', message: '', consent: true, website: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('requires a durable receipt and validates optional commercial fields', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) }); vi.stubGlobal('fetch', fetch);
  await expect(submitDemoRequest(lead, 'https://leads.example.test')).rejects.toThrow();
  for (const extra of [{ phone: 'x'.repeat(41) }, { interest: 'other' }, { email: 'invalid' }]) await expect(submitDemoRequest({ ...lead, ...extra }, 'https://leads.example.test')).rejects.toThrow();
});
it('returns durable acceptance details and reuses retry identity', async () => {
  const result = { accepted: true, reference: '12345678-1234-4234-8234-123456789001', receipt: 'stored', duplicate: true, notification: 'pending' };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result }); vi.stubGlobal('fetch', fetch);
  expect(await submitDemoRequest(lead, 'https://leads.example.test', result.reference)).toEqual(result);
  await submitDemoRequest(lead, 'https://leads.example.test', result.reference);
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetch.mock.calls[1][1].headers['Idempotency-Key']);
});

it('never enables the local test proxy in production', () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_LANDING_LOCAL_LEADS', 'true');
  vi.stubEnv('VITE_LANDING_LEAD_ENDPOINT', '/__lead-local/leads');
  vi.stubEnv('VITE_LANDING_PRIVACY_URL', '/__lead-local/privacy');
  expect(receiverUrl('/__lead-local/leads')).toBe('');
  expect(getCommercialConfig().canSubmit).toBe(false);
});
it('accepts ordinary addresses containing s but rejects embedded whitespace', async () => {
  const result = { accepted: true, reference: '12345678-1234-4234-8234-123456789001', receipt: 'stored', duplicate: false, notification: 'pending' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
  await expect(submitDemoRequest({ ...lead, email: 'sales@example.test' }, 'https://leads.example.test')).resolves.toEqual(result);
  await expect(submitDemoRequest({ ...lead, email: 'sales @example.test' }, 'https://leads.example.test')).rejects.toThrow();
});
