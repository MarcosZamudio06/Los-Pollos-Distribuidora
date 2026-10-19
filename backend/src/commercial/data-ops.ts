import { DatabaseSync, backup } from 'node:sqlite';
import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

function openCommercial(path: string, readOnly = true) {
  if (
    !isAbsolute(path) ||
    !lstatSync(path).isFile() ||
    lstatSync(path).isSymbolicLink()
  )
    throw new Error('Existing regular commercial database required');
  const db = new DatabaseSync(path, { readOnly });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    if (
      JSON.stringify(tables) !==
      JSON.stringify(['captured_mail', 'leads', 'rate', 'request_keys'])
    )
      throw new Error('Not a commercial database');
    // Fail closed on an unrelated SQLite schema without importing tenant configuration.
    db.prepare(
      'SELECT request_key,digest,payload,envelope,privacy_url,state FROM leads LIMIT 0',
    ).all();
    db.prepare('SELECT key,lead_id,digest FROM request_keys LIMIT 0').all();
    if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
      throw new Error('Commercial integrity check failed');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function copyCommercial(
  source: string,
  destination: string,
  restore: boolean,
) {
  const db = openCommercial(source);
  try {
    if (!isAbsolute(destination))
      throw new Error('Absolute new destination required');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    // Exclusive creation: never overwrite a source, existing database or symlink.
    closeSync(openSync(destination, 'wx', 0o600));
    await backup(db, destination);
    const result = openCommercial(destination, false);
    try {
      if (restore) {
        // Restore never resumes old pending mail automatically; reconcile with provider
        // history and the private deletion ledger BEFORE enabling any worker.
        result.exec(
          "UPDATE leads SET state='reconcile', token=NULL, lease_until=0 WHERE state!='sent'",
        );
      }
      const leads = Number(
        result.prepare('SELECT count(*) AS n FROM leads').get()!.n,
      );
      return {
        operation: restore ? 'restore' : 'backup',
        verified: true,
        leads,
        queuedMailQuarantined: restore,
      };
    } finally {
      result.close();
    }
  } finally {
    db.close();
  }
}

type Selection = { before?: string; reference?: string };
export function purgeCommercial(
  path: string,
  selection: Selection,
  apply = false,
  serviceStopped = false,
) {
  if (Boolean(selection.before) === Boolean(selection.reference))
    throw new Error('Choose exactly one approved cutoff or reference');
  let value: string | number;
  if (selection.before) {
    const date = new Date(selection.before);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== selection.before ||
      date.getTime() > Date.now()
    )
      throw new Error('Explicit non-future ISO cutoff required');
    value = date.getTime();
  } else {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        selection.reference || '',
      )
    )
      throw new Error('Valid commercial reference required');
    value = selection.reference!;
  }
  if (apply && !serviceStopped)
    throw new Error(
      'Stop receiver AND workers; explicit acknowledgement required',
    );
  const db = openCommercial(path, !apply);
  const predicate = selection.before ? 'created < ?' : 'id = ?';
  try {
    const matched = Number(
      db
        .prepare(`SELECT count(*) AS n FROM leads WHERE ${predicate}`)
        .get(value)!.n,
    );
    if (!apply)
      return { operation: 'purge', matched, deleted: 0, dryRun: true };
    db.exec(
      'PRAGMA busy_timeout=1000; PRAGMA locking_mode=EXCLUSIVE; PRAGMA secure_delete=ON; BEGIN EXCLUSIVE',
    );
    let deleted: number;
    try {
      db.prepare(
        `DELETE FROM captured_mail WHERE id IN (SELECT id FROM leads WHERE ${predicate})`,
      ).run(value);
      db.prepare(
        `DELETE FROM request_keys WHERE lead_id IN (SELECT id FROM leads WHERE ${predicate})`,
      ).run(value);
      deleted = Number(
        db.prepare(`DELETE FROM leads WHERE ${predicate}`).run(value).changes,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    // Reclaim ordinary SQLite free pages and truncate WAL. This is not a promise
    // of forensic erasure from SSD snapshots, provider history or old backups.
    db.exec('VACUUM');
    const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (Number(checkpoint?.busy || 0))
      throw new Error(
        'Deletion committed; checkpoint incomplete; keep service stopped',
      );
    return { operation: 'purge', matched, deleted, dryRun: false };
  } finally {
    db.close();
  }
}
