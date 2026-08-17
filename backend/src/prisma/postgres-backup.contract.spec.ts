import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const productionCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.production.yml'),
  'utf8',
);
const environmentExample = readFileSync(
  resolve(repositoryRoot, '.env.example'),
  'utf8',
);
const backupScript = readFileSync(
  resolve(repositoryRoot, 'scripts/database/backup-postgres-to-b2.sh'),
  'utf8',
);
const restoreScript = readFileSync(
  resolve(repositoryRoot, 'scripts/database/restore-postgres-from-b2.sh'),
  'utf8',
);
const verifyScript = readFileSync(
  resolve(repositoryRoot, 'scripts/database/verify-restored-database.sh'),
  'utf8',
);
const backupRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/postgres-backup-b2.md'),
  'utf8',
);
const systemdService = readFileSync(
  resolve(
    repositoryRoot,
    'docs/runbooks/systemd/pollos-distribuidor-postgres-backup.service',
  ),
  'utf8',
);
const systemdTimer = readFileSync(
  resolve(
    repositoryRoot,
    'docs/runbooks/systemd/pollos-distribuidor-postgres-backup.timer',
  ),
  'utf8',
);

describe('PostgreSQL/PostGIS B2 backup contract', () => {
  it('keeps PostgreSQL private and healthy in the production Compose topology', () => {
    const postgresService = productionCompose.match(
      /^ {2}postgres:\n([\s\S]*?)(?=^ {2}[a-zA-Z0-9_-]+:|^volumes:)/m,
    )?.[0];

    expect(postgresService).toBeDefined();
    expect(postgresService).toContain('postgis/postgis:16-3.5-alpine');
    expect(postgresService).toContain('pg_isready');
    expect(postgresService).not.toContain('ports:');
  });

  it('uses a separate S3-compatible backup credential contract', () => {
    for (const variable of [
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_REGION',
      'BACKUP_S3_BUCKET',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'BACKUP_RETENTION_DAILY',
      'BACKUP_RETENTION_WEEKLY',
      'BACKUP_RETENTION_MONTHLY',
      'BACKUP_MIN_FREE_BYTES',
      'BACKUP_RPO_HOURS',
      'BACKUP_RTO_MINUTES',
    ]) {
      expect(environmentExample).toContain(`${variable}=`);
    }

    expect(backupScript).not.toContain('OBJECT_STORAGE_');
    expect(restoreScript).not.toContain('OBJECT_STORAGE_');
    expect(backupRunbook).toContain('Do not reuse `OBJECT_STORAGE_*`');
  });

  it('creates and validates deterministic custom-format archives before cleanup', () => {
    expect(backupScript).toContain('--format=custom');
    expect(backupScript).toContain('--compress=6');
    expect(backupScript).toContain('pg_restore --list');
    expect(backupScript).toContain('head-object');
    expect(backupScript).toContain('backup_sha256');
    expect(backupScript).toContain('"database": "$BACKUP_POSTGRES_DATABASE"');
    expect(backupScript).toContain('backup_check_disk_space');
    expect(backupScript).toContain('postgres/$year/$month/$timestamp.dump');
    expect(backupScript).toContain('select-postgres-backup-retention.py');
    expect(backupScript).toContain('BACKUP_FAILED_KEEP_COUNT');
    expect(backupScript).toContain('rm -rf -- "$temp_dir"');
  });

  it('guards restore drills from production and records cleanup after verification', () => {
    expect(restoreScript).toContain(
      '"$RESTORE_DATABASE_NAME" == "$RESTORE_PRODUCTION_DATABASE_NAME"',
    );
    expect(restoreScript).toContain(
      '"$RESTORE_DATABASE_NAME" != *_restore_drill',
    );
    expect(restoreScript).toContain('refusing to overwrite it');
    expect(restoreScript).toContain('verify-restored-database.sh');
    expect(restoreScript).toContain('manifest_database_value');
    expect(restoreScript).toContain('cleanup_status=pending');
    expect(restoreScript).toContain('cleanup_status=passed');
    expect(restoreScript).toContain('dropdb --if-exists');
    expect(restoreScript).not.toContain('DROP DATABASE');
  });

  it('verifies PostGIS, Prisma migration history, and critical ERP/POS tables', () => {
    expect(verifyScript).toContain("extname = 'postgis'");
    expect(verifyScript).toContain('postgis_full_version()');
    expect(verifyScript).toContain('public."_prisma_migrations"');
    for (const table of [
      'Sale',
      'InventoryMovement',
      'Payment',
      'CashMovement',
    ]) {
      expect(verifyScript).toContain(`public."${table}"`);
    }
    expect(verifyScript).toContain('_restore_drill');
  });

  it('uses a host systemd timer rather than a backend-container cron', () => {
    expect(systemdService).toContain(
      'ExecStart=/opt/pollos-distribuidor/scripts/database/backup-postgres-to-b2.sh',
    );
    expect(systemdService).toContain(
      'EnvironmentFile=/etc/pollos-distribuidor/postgres-backup.env',
    );
    expect(systemdTimer).toContain('OnCalendar=*-*-* 02:30:00');
    expect(systemdTimer).not.toContain('cron');
  });

  it('keeps operational scripts executable without storing secrets', () => {
    for (const relativePath of [
      'scripts/database/backup-postgres-to-b2.sh',
      'scripts/database/restore-postgres-from-b2.sh',
      'scripts/database/verify-restored-database.sh',
    ]) {
      expect(
        statSync(resolve(repositoryRoot, relativePath)).mode & 0o111,
      ).toBeTruthy();
    }

    expect(backupScript).not.toMatch(/printf[^\n]*(SECRET|ACCESS_KEY)/);
    expect(restoreScript).not.toMatch(/printf[^\n]*(SECRET|ACCESS_KEY)/);
  });
});
