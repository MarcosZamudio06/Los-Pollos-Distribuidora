import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LeadStore } from './store';
import { loadLeadConfig } from './config';
import { createReceiver } from './receiver';
import type { LeadDto } from './lead.dto';
const origin = 'http://localhost:5189';
const lead: LeadDto = {
  name: 'Synthetic',
  company: 'Synthetic',
  email: 'lead@example.test',
  phone: '',
  interest: '',
  message: '',
  consent: true,
  website: '',
  source: 'landing-demo',
  consentVersion: 'explicit-v2',
};
const envelope = () => ({
  from: '',
  to: [''],
  reply_to: lead.email,
  subject: 'Synthetic',
  text: '',
  html: '',
});
export const testConfig = () =>
  loadLeadConfig({
    LEAD_MODE: 'local',
    LEAD_DB_PATH: '/tmp/unused/leads.sqlite',
    LEAD_ORIGINS: origin,
    LEAD_PRIVACY_URL: `${origin}/privacy`,
    LEAD_PRIVACY_VERSION: 'explicit-v2',
    LEAD_PRIVACY_APPROVED: 'true',
    LEAD_PROVIDER: 'capture',
    LEAD_RATE_SECRET: 'x'.repeat(32),
  });
describe('001A privacy and rate hardening', () => {
  let dir: string;
  let store: LeadStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lead-001a-'));
    store = new LeadStore(join(dir, 'leads.sqlite'));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it('never returns another key reference or notification state for matching content', () => {
    const key = randomUUID();
    const first = store.accept(key, lead, 'privacy', envelope);
    const job = store.claim()!;
    store.sent(job, 'synthetic-provider-id');
    const second = store.accept(randomUUID(), lead, 'privacy', envelope);
    expect(second.reference).not.toBe(first.reference);
    expect(second.duplicate).toBe(false);
    expect(second.notification).toBe('pending');
    expect(store.accept(key, lead, 'privacy', envelope)).toMatchObject({
      reference: first.reference,
      duplicate: true,
      notification: 'sent',
    });
    expect(store.count()).toBe(2);
  });
  it('does not honor legacy cross-key aliases', () => {
    const first = store.accept(randomUUID(), lead, 'privacy', envelope);
    const db = new DatabaseSync(join(dir, 'leads.sqlite'));
    const row = db
      .prepare('SELECT digest FROM leads WHERE id=?')
      .get(first.reference)!;
    const alias = randomUUID();
    db.prepare('INSERT INTO request_keys VALUES (?,?,?)').run(
      alias,
      first.reference,
      String(row.digest),
    );
    db.close();
    expect(store.accept(alias, lead, 'privacy', envelope).reference).not.toBe(
      first.reference,
    );
  });
  it('accounts for rejected per-source attempts in the global budget and resets at boundary', () => {
    const now = 600001;
    for (let i = 0; i < 5; i++) store.rateLimit('source', now);
    expect(() => store.rateLimit('source', now)).toThrow();
    const db = new DatabaseSync(join(dir, 'leads.sqlite'));
    expect(
      db.prepare("SELECT count FROM rate WHERE bucket='global:1'").get()!.count,
    ).toBe(6);
    db.close();
    expect(() => store.rateLimit('source', 1200000)).not.toThrow();
  });
  it('shares global limits across sources and store connections', () => {
    const other = new LeadStore(join(dir, 'leads.sqlite'));
    try {
      for (let i = 0; i < 100; i++)
        (i % 2 ? other : store).rateLimit(`source-${i}`, 600001);
      expect(() => other.rateLimit('fresh-source', 600001)).toThrow();
    } finally {
      other.close();
    }
  });
  it('returns readable CORS-enabled 429 with exact Retry-After; spoofed forwarding cannot bypass it', async () => {
    const app = await createReceiver(testConfig(), store);
    await app.init();
    const now = jest.spyOn(Date, 'now').mockReturnValue(600001);
    try {
      const send = (i: number) =>
        request(app.getHttpServer())
          .post('/leads')
          .set('Origin', origin)
          .set('X-Forwarded-For', `203.0.113.${i}`)
          .set('Idempotency-Key', randomUUID())
          .send(lead);
      for (let i = 0; i < 5; i++) expect((await send(i)).status).toBe(201);
      const result = await send(6);
      expect(result.status).toBe(429);
      expect(result.headers['access-control-allow-origin']).toBe(origin);
      expect(result.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
      expect(result.headers['retry-after']).toBe('600');
      expect(result.body).toMatchObject({
        accepted: false,
        code: 'LEAD_RATE_LIMITED',
        retryAfterSeconds: 600,
      });
      now.mockReturnValue(1200000);
      expect((await send(7)).status).toBe(201);
    } finally {
      now.mockRestore();
      await app.close();
    }
  });
  it('counts invalid origins too: CORS is not authentication', async () => {
    const app = await createReceiver(testConfig(), store);
    await app.init();
    try {
      for (let i = 0; i < 5; i++)
        expect(
          (
            await request(app.getHttpServer())
              .post('/leads')
              .set('Origin', 'https://untrusted.example.test')
              .send({})
          ).status,
        ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .post('/leads')
            .set('Origin', origin)
            .send({})
        ).status,
      ).toBe(429);
    } finally {
      await app.close();
    }
  });
});
