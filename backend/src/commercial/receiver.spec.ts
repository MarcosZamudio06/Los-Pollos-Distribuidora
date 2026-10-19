import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createReceiver } from './receiver';
import { LeadStore } from './store';
import { loadLeadConfig } from './config';

const payload = {
  name: 'Test Person',
  company: 'Synthetic Business',
  email: 'lead@example.test',
  phone: '+52 669 000 0000',
  interest: 'ventas',
  message: '<script>test</script>',
  consent: true,
  website: '',
  source: 'landing-demo',
  consentVersion: 'demo-contact-v1',
};
const origin = 'http://localhost:5178';
const key = '12345678-1234-4234-8234-123456789001';
describe('isolated commercial receiver', () => {
  let dir: string;
  let store: LeadStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lead-test-'));
    store = new LeadStore(join(dir, 'leads.sqlite'));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const config = () =>
    loadLeadConfig({
      LEAD_MODE: 'local',
      LEAD_DB_PATH: '/tmp/unused/leads.sqlite',
      LEAD_ORIGINS: origin,
      LEAD_PRIVACY_URL: `${origin}/privacy`,
      LEAD_PRIVACY_VERSION: 'demo-contact-v1',
      LEAD_PRIVACY_APPROVED: 'true',
      LEAD_PROVIDER: 'capture',
      LEAD_RATE_SECRET: 'x'.repeat(32),
    });
  it('fails closed without privacy approval and forbids production capture', () => {
    expect(() => loadLeadConfig({})).toThrow();
    expect(() =>
      loadLeadConfig({
        ...process.env,
        LEAD_MODE: 'production',
        LEAD_PROVIDER: 'capture',
      }),
    ).toThrow();
  });
  it('durably stores, deduplicates concurrent POSTs and never exposes a public list', async () => {
    const app = await createReceiver(config(), store);
    await app.init();
    try {
      const send = () =>
        request(app.getHttpServer())
          .post('/leads')
          .set('Origin', origin)
          .set('Idempotency-Key', key)
          .send(payload);
      const results = await Promise.all([send(), send()]);
      expect(
        results.every((r) => r.status === 201 && r.body.accepted === true),
      ).toBe(true);
      expect(results[0].body.reference).toBe(results[1].body.reference);
      expect(results.filter((r) => r.body.duplicate)).toHaveLength(1);
      const other = new LeadStore(join(dir, 'leads.sqlite'));
      expect(other.count()).toBe(1);
      other.close();
      expect(
        (await request(app.getHttpServer()).get('/leads').set('Origin', origin))
          .status,
      ).toBe(404);
      expect((await send()).body.notification).toBe('pending');
      const conflict = await request(app.getHttpServer())
        .post('/leads')
        .set('Origin', origin)
        .set('Idempotency-Key', key)
        .send({ ...payload, name: 'Other' });
      expect(conflict.status).toBe(409);
    } finally {
      await app.close();
    }
  });
  it.each([
    { email: 'invalid' },
    { name: '' },
    { company: ' ' },
    { consent: false },
    { website: 'bot' },
    { phone: 'x'.repeat(41) },
    { interest: 'unknown' },
    { message: 'x'.repeat(2001) },
    { consentVersion: 'old' },
  ])('rejects invalid input %j', async (invalid) => {
    const app = await createReceiver(config(), store);
    await app.init();
    try {
      const result = await request(app.getHttpServer())
        .post('/leads')
        .set('Origin', origin)
        .set('Idempotency-Key', key)
        .send({ ...payload, ...invalid });
      expect(result.status).toBe(400);
      expect(result.body.accepted).not.toBe(true);
      expect(store.count()).toBe(0);
      expect(JSON.stringify(result.body)).not.toContain(payload.email);
    } finally {
      await app.close();
    }
  });
  it('never acknowledges a failed durable write and sanitizes error details', async () => {
    const app = await createReceiver(config(), store);
    await app.init();
    const spy = jest.spyOn(store, 'accept').mockImplementation(() => {
      throw new Error('Storage unavailable: lead@example.test');
    });
    try {
      const result = await request(app.getHttpServer())
        .post('/leads')
        .set('Origin', origin)
        .set('Idempotency-Key', key)
        .send(payload);
      expect(result.status).toBe(503);
      expect(result.body.accepted).toBe(false);
      expect(JSON.stringify(result.body)).not.toContain(payload.email);
      expect(store.count()).toBe(0);
    } finally {
      spy.mockRestore();
      await app.close();
    }
  });
  it('rejects unauthorized origins, oversized input, missing key and rate abuse', async () => {
    const app = await createReceiver(config(), store);
    await app.init();
    try {
      const send = (o: string, body: object = payload) =>
        request(app.getHttpServer())
          .post('/leads')
          .set('Origin', o)
          .set('Idempotency-Key', key)
          .set('X-Forwarded-For', '203.0.113.' + Math.ceil(Math.random() * 200))
          .send(body);
      expect((await send('https://evil.example.test')).status).toBe(403);
      expect(
        (await send(origin, { ...payload, message: 'x'.repeat(17000) })).status,
      ).toBe(413);
      expect(
        (
          await request(app.getHttpServer())
            .post('/leads')
            .set('Origin', origin)
            .send(payload)
        ).status,
      ).toBe(400);
      for (let i = 0; i < 5; i++) await send(origin);
      expect((await send(origin)).status).toBe(429);
    } finally {
      await app.close();
    }
  });
});
