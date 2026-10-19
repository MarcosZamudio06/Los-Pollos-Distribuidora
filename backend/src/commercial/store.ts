import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConflictException, HttpException } from '@nestjs/common';
import type { LeadDto } from './lead.dto';

export type MailEnvelope = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
};
export type Job = {
  id: string;
  envelope: string;
  attempts: number;
  first_attempt: number | null;
  state: string;
  token: string;
};
export class LeadStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, digest TEXT NOT NULL,
        payload TEXT NOT NULL, envelope TEXT NOT NULL, created INTEGER NOT NULL,
        privacy_url TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, first_attempt INTEGER, next_attempt INTEGER NOT NULL DEFAULT 0,
        lease_until INTEGER NOT NULL DEFAULT 0, token TEXT, provider_id TEXT);
      CREATE TABLE IF NOT EXISTS request_keys (key TEXT PRIMARY KEY, lead_id TEXT NOT NULL, digest TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS leads_digest ON leads(digest,created);
      CREATE TABLE IF NOT EXISTS rate (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS captured_mail (id TEXT PRIMARY KEY, envelope TEXT NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  count() {
    return Number(this.db.prepare('SELECT count(*) AS n FROM leads').get()!.n);
  }
  rateLimit(ipHash: string, now = Date.now()) {
    const bucket = Math.floor(now / 600000);
    let limited = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM rate WHERE expires < ?').run(now);
      for (const [id, limit] of [
        [`${ipHash}:${bucket}`, 5],
        [`global:${bucket}`, 100],
      ] as const) {
        const row = this.db
          .prepare(
            'INSERT INTO rate VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
          )
          .get(id, now + 1200000)!;
        limited ||= Number(row.count) > limit;
      }
      // Rejected attempts also consume the global budget. Roll back only storage failures.
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    if (limited)
      throw new HttpException(
        {
          code: 'LEAD_RATE_LIMITED',
          retryAfterSeconds: Math.ceil(((bucket + 1) * 600000 - now) / 1000),
        },
        429,
      );
  }

  accept(
    key: string,
    lead: LeadDto,
    privacyUrl: string,
    envelope: (id: string, date: string) => MailEnvelope,
    now = Date.now(),
  ) {
    const payload = JSON.stringify({
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      interest: lead.interest,
      message: lead.message,
      consent: lead.consent,
      website: lead.website,
      source: lead.source,
      consentVersion: lead.consentVersion,
    });
    const digest = createHash('sha256').update(payload).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // The original random key is the only capability for replay. Never look up by content
      // or honor aliases previously created by cross-key content deduplication.
      const existing = this.db
        .prepare('SELECT id,digest,state FROM leads WHERE request_key=?')
        .get(key);
      if (existing && existing.digest !== digest)
        throw new ConflictException('Idempotency key already used');
      const id = existing ? String(existing.id) : randomUUID();
      if (!existing)
        this.db
          .prepare(
            'INSERT INTO leads(id,request_key,digest,payload,envelope,created,privacy_url) VALUES (?,?,?,?,?,?,?)',
          )
          .run(
            id,
            key,
            digest,
            payload,
            JSON.stringify(envelope(id, new Date(now).toISOString())),
            now,
            privacyUrl,
          );
      this.db.exec('COMMIT');
      return {
        accepted: true as const,
        reference: id,
        receipt: 'stored' as const,
        duplicate: !!existing,
        notification:
          existing?.state === 'sent'
            ? 'sent'
            : existing?.state === 'reconcile'
              ? 'reconciliation_required'
              : 'pending',
      };
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  claim(now = Date.now()): Job | undefined {
    // Provider idempotency expires after 24h. Never resend beyond the conservative 23h horizon.
    this.db
      .prepare(
        "UPDATE leads SET state='reconcile' WHERE state IN ('pending','sending') AND first_attempt IS NOT NULL AND first_attempt<=? AND lease_until<=?",
      )
      .run(now - 23 * 3600000, now);
    const token = randomUUID();
    return this.db
      .prepare(
        `UPDATE leads SET state='sending', token=?, lease_until=?, attempts=attempts+1, first_attempt=COALESCE(first_attempt,?)
      WHERE id=(SELECT id FROM leads WHERE ((state='pending' AND next_attempt<=?) OR (state='sending' AND lease_until<=?)) ORDER BY created LIMIT 1)
      RETURNING id,envelope,attempts,first_attempt,state,token`,
      )
      .get(token, now + 60000, now, now, now) as Job | undefined;
  }
  sent(job: Job, providerId: string) {
    this.db
      .prepare(
        "UPDATE leads SET state='sent',provider_id=?,lease_until=0 WHERE id=? AND token=? AND state='sending'",
      )
      .run(providerId, job.id, job.token);
  }
  failed(job: Job, now = Date.now()) {
    this.db
      .prepare(
        "UPDATE leads SET state='pending',next_attempt=?,lease_until=0 WHERE id=? AND token=? AND state='sending'",
      )
      .run(
        now + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
        job.id,
        job.token,
      );
  }
  capture(job: Job) {
    this.db
      .prepare('INSERT OR IGNORE INTO captured_mail VALUES (?,?)')
      .run(job.id, job.envelope);
  }
  capturedCount() {
    return Number(
      this.db.prepare('SELECT count(*) AS n FROM captured_mail').get()!.n,
    );
  }
  stats() {
    return this.db
      .prepare('SELECT state,count(*) AS count FROM leads GROUP BY state')
      .all();
  }
}
