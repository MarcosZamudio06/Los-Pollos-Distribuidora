import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { LeadStore } from './store';
import { copyCommercial, purgeCommercial } from './data-ops';
import type { LeadDto } from './lead.dto';
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
describe('private commercial data lifecycle', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lead-ops-'));
    path = join(dir, 'source.sqlite');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const seed = () => {
    const store = new LeadStore(path);
    const receipt = store.accept(
      randomUUID(),
      lead,
      'privacy',
      () => ({
        from: '',
        to: [],
        reply_to: lead.email,
        subject: 'Synthetic',
        text: 'Synthetic private content',
        html: 'Synthetic private content',
      }),
      1000,
    );
    const job = store.claim(1001)!;
    store.capture(job);
    store.failed(job, 1002);
    store.close();
    const db = new DatabaseSync(path);
    const row = db
      .prepare('SELECT digest FROM leads WHERE id=?')
      .get(receipt.reference)!;
    db.prepare('INSERT INTO request_keys VALUES (?,?,?)').run(
      randomUUID(),
      receipt.reference,
      String(row.digest),
    );
    db.close();
    return receipt;
  };
  it('backs up real disk data and restores into a NEW target with retries quarantined', async () => {
    seed();
    const dest = join(dir, 'backup.sqlite');
    const snapshot = await copyCommercial(path, dest, false);
    expect(snapshot.leads).toBe(1);
    const restored = join(dir, 'restored.sqlite');
    await copyCommercial(dest, restored, true);
    const db = new DatabaseSync(restored);
    expect(db.prepare('PRAGMA quick_check').get()).toEqual({
      quick_check: 'ok',
    });
    expect(db.prepare('SELECT state FROM leads').get()!.state).toBe(
      'reconcile',
    );
    expect(
      JSON.parse(
        String(db.prepare('SELECT payload FROM leads').get()!.payload),
      ),
    ).toEqual(lead);
    expect(db.prepare('SELECT count(*) AS n FROM captured_mail').get()!.n).toBe(
      1,
    );
    db.close();
    const original = readFileSync(path);
    await expect(copyCommercial(dest, path, true)).rejects.toThrow();
    expect(readFileSync(path)).toEqual(original);
  });
  it('defaults to dry-run and deletes payload, mail and legacy aliases only with explicit stopped-service acknowledgment', () => {
    const receipt = seed();
    expect(
      purgeCommercial(path, { reference: receipt.reference }),
    ).toMatchObject({ matched: 1, deleted: 0 });
    expect(() =>
      purgeCommercial(path, { reference: receipt.reference }, true, false),
    ).toThrow();
    expect(
      purgeCommercial(path, { reference: receipt.reference }, true, true),
    ).toMatchObject({ matched: 1, deleted: 1 });
    const db = new DatabaseSync(path);
    for (const table of ['leads', 'captured_mail', 'request_keys'])
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n).toBe(0);
    db.close();
    expect(
      readFileSync(path).includes(Buffer.from('Synthetic private content')),
    ).toBe(false);
  });
  it('requires an explicit valid retention cutoff and never touches newer records', () => {
    seed();
    expect(() => purgeCommercial(path, {})).toThrow();
    expect(() => purgeCommercial(path, { before: 'invalid' })).toThrow();
    expect(
      purgeCommercial(path, { before: '1970-01-01T00:00:00.500Z' }, true, true)
        .deleted,
    ).toBe(0);
    expect(
      purgeCommercial(path, { before: '1970-01-01T00:00:02.000Z' }, true, true)
        .deleted,
    ).toBe(1);
  });
  it('rejects noncommercial databases without mutation', async () => {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE unrelated (secret TEXT)');
    db.close();
    const before = readFileSync(path);
    expect(() =>
      purgeCommercial(path, { before: '1970-01-01T00:00:02.000Z' }, true, true),
    ).toThrow();
    await expect(
      copyCommercial(path, join(dir, 'backup.sqlite'), false),
    ).rejects.toThrow();
    expect(readFileSync(path)).toEqual(before);
  });
});
