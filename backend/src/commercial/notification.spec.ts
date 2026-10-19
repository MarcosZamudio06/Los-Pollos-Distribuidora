import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeadStore } from './store';
import { NotificationWorker, notification } from './notification';
import { loadLeadConfig } from './config';
import type { LeadDto } from './lead.dto';
const lead: LeadDto = {
  name: '<img src=x>',
  company: 'Synthetic',
  email: 'lead@example.test',
  phone: '',
  interest: 'erp',
  message: '<script>&"',
  consent: true,
  website: '',
  source: 'landing-demo',
  consentVersion: 'demo-contact-v1',
};
const config = loadLeadConfig({
  LEAD_MODE: 'local',
  LEAD_DB_PATH: '/tmp/unused/leads.sqlite',
  LEAD_ORIGINS: 'http://localhost:5178',
  LEAD_PRIVACY_URL: 'http://localhost:5178/privacy',
  LEAD_PRIVACY_VERSION: 'demo-contact-v1',
  LEAD_PRIVACY_APPROVED: 'true',
  LEAD_PROVIDER: 'capture',
  LEAD_RATE_SECRET: 'x'.repeat(32),
});
describe('durable notification outbox', () => {
  let store: LeadStore;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lead-mail-'));
    store = new LeadStore(join(dir, 'leads.sqlite'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const accept = () =>
    store.accept(
      '12345678-1234-4234-8234-123456789001',
      lead,
      config.privacyUrl,
      (id, date) => notification(lead, id, date, config),
    );
  it('escapes HTML, uses reply-to and includes plain text and unique reference', () => {
    const mail = notification(lead, 'reference', 'date', config);
    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('<script>');
    expect(mail.reply_to).toBe(lead.email);
    expect(mail.text).toContain('reference');
  });
  it('captures exactly once under concurrent workers and survives reopening', async () => {
    accept();
    await Promise.all([
      new NotificationWorker(store, config).tick(),
      new NotificationWorker(store, config).tick(),
    ]);
    expect(store.capturedCount()).toBe(1);
    expect(store.stats()).toEqual([{ state: 'sent', count: 1 }]);
    store.close();
    store = new LeadStore(join(dir, 'leads.sqlite'));
    await new NotificationWorker(store, config).tick();
    expect(store.capturedCount()).toBe(1);
  });
  it('persists failure and retries the immutable envelope with the same provider key', async () => {
    accept();
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'provider-id' }),
      });
    const worker = new NotificationWorker(
      store,
      { ...config, provider: 'resend' },
      send,
    );
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await worker.tick();
    expect(store.stats()).toEqual([{ state: 'pending', count: 1 }]);
    jest.spyOn(Date, 'now').mockReturnValue(now + 120000);
    await worker.tick();
    expect(store.stats()).toEqual([{ state: 'sent', count: 1 }]);
    expect(send.mock.calls[0][1].body).toBe(send.mock.calls[1][1].body);
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      send.mock.calls[1][1].headers['Idempotency-Key'],
    );
  });
  it('does not send twice while provider is in flight across two connections', async () => {
    accept();
    let resolve!: (v: unknown) => void;
    const send = jest.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const other = new LeadStore(join(dir, 'leads.sqlite'));
    try {
      const first = new NotificationWorker(
        store,
        { ...config, provider: 'resend' },
        send,
      ).tick();
      await new NotificationWorker(
        other,
        { ...config, provider: 'resend' },
        send,
      ).tick();
      expect(send).toHaveBeenCalledTimes(1);
      resolve({ ok: true, json: () => Promise.resolve({ id: 'id' }) });
      await first;
    } finally {
      other.close();
    }
  });
  it('recovers crashed leases but stops retries before provider deduplication expires', () => {
    accept();
    const now = Date.now();
    const first = store.claim(now)!;
    expect(first).toBeDefined();
    expect(store.claim(now + 1000)).toBeUndefined();
    const recovered = store.claim(now + 61000)!;
    expect(recovered.id).toBe(first.id);
    expect(recovered.token).not.toBe(first.token);
    expect(store.claim(now + 24 * 3600000)).toBeUndefined();
    expect(store.stats()).toEqual([{ state: 'reconcile', count: 1 }]);
  });
  it('keeps pending when provider HTTP200 lacks an acceptance id', async () => {
    accept();
    const send = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await new NotificationWorker(
      store,
      { ...config, provider: 'resend' },
      send,
    ).tick();
    expect(store.stats()).toEqual([{ state: 'pending', count: 1 }]);
  });
});
