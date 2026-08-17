# PostgreSQL/PostGIS backup and restore drill

This runbook protects the local PostGIS database used by the Architecture A
single-host deployment. PostgreSQL remains private inside Docker; the backup
job runs on the host, enters the running `postgres` service with
`docker compose exec`, and sends the completed archive to Backblaze B2 through
its S3-compatible API.

The implementation uses a digest-pinned AWS CLI container
(`amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7`)
only for S3 operations. The database container supplies `pg_dump`, `pg_restore`, `psql`,
and `createdb`. No backup dependency or credential is added to the backend
image.

The Ubuntu host needs Docker Engine/Compose, Bash, and Python 3. The Postgres
service must be running and healthy before a backup or drill starts.

## Required runtime configuration

Copy the backup variables to a root-readable host file such as
`/etc/pollos-distribuidor/postgres-backup.env`. Keep this file outside Git and
limit it to root (`chmod 600`). Do not reuse `OBJECT_STORAGE_*` credentials.

```dotenv
BACKUP_S3_ENDPOINT=https://s3.<b2-region>.backblazeb2.com
BACKUP_S3_REGION=<b2-region>
BACKUP_S3_BUCKET=<backup-bucket>
BACKUP_S3_ACCESS_KEY_ID=<backup-application-key-id>
BACKUP_S3_SECRET_ACCESS_KEY=<backup-application-key>
BACKUP_RETENTION_DAILY=14
BACKUP_RETENTION_WEEKLY=8
BACKUP_RETENTION_MONTHLY=6
BACKUP_MIN_FREE_BYTES=1073741824
BACKUP_RPO_HOURS=24
BACKUP_RTO_MINUTES=60
```

The B2 application key should be restricted to the backup bucket and the
operations required by this flow: list, read, write, and delete for retention.
Use a separate read/list-only key for restore-only operators when practical.
The scripts never print these values or put them in an image.

`BACKUP_MIN_FREE_BYTES` is a preflight safety margin, not a dump-size
estimate. Increase it to at least twice the largest expected compressed dump
when the verification download is enabled (the default behavior).

## Backup behavior

Run from the repository root after the production Postgres service is healthy:

```bash
./scripts/database/backup-postgres-to-b2.sh
```

The script:

1. checks required B2 variables, the Docker Compose file, service health, and
   available disk space;
2. runs `pg_dump --format=custom --compress=6 --no-owner --no-acl` inside the
   private `postgres` service;
3. rejects an empty or unreadable archive;
4. uploads the dump and a checksum manifest to B2;
5. verifies both remote objects with `head-object`, downloads the dump again,
   and compares byte size and SHA-256;
6. applies retention only after that validation; and
7. records a non-secret local result under the backup result directory and
   deletes temporary files only after successful validation.

The deterministic object layout is:

```text
postgres/YYYY/MM/YYYY-MM-DDTHH-MM-SSZ.dump
postgres/YYYY/MM/YYYY-MM-DDTHH-MM-SSZ.manifest.json
```

The manifest contains the key, archive format, database name, byte size, and
SHA-256. It does not contain endpoints or credentials. If upload or validation
fails, the newest failed dump is retained under the configured local `failed`
directory for diagnosis; older failed dumps are removed so a broken remote
does not fill the VPS disk.

## Retention policy

Retention is a union of windows, so a copy is retained when it is the newest
copy for any configured daily, ISO-week, or calendar-month group. The newest
valid dump is always retained, even when all windows are zero. Only matching
deterministic `.dump` objects and their manifests are candidates for deletion;
unrecognized objects are left untouched.

The defaults are 14 daily, 8 weekly, and 6 monthly windows. Set the variables
explicitly for the required RPO and compliance policy. A retention failure
returns a failed job even though the already-validated newest backup remains
in B2.

## Automatic execution with systemd

This repository provides templates under `docs/runbooks/systemd/`. Install
them on the VPS without adding cron to the backend container:

```bash
sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-postgres-backup.service \
  /etc/systemd/system/pollos-distribuidor-postgres-backup.service
sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-postgres-backup.timer \
  /etc/systemd/system/pollos-distribuidor-postgres-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now pollos-distribuidor-postgres-backup.timer
sudo systemctl start pollos-distribuidor-postgres-backup.service
sudo systemctl status pollos-distribuidor-postgres-backup.timer
```

The templates assume the repository is deployed at
`/opt/pollos-distribuidor`, and that `/etc/pollos-distribuidor/production.env`
contains the normal Compose runtime variables while
`postgres-backup.env` contains only the backup variables. Adapt those paths
before enabling the timer. Inspect failures with:

```bash
sudo journalctl -u pollos-distribuidor-postgres-backup.service -n 100 --no-pager
```

The timer is daily at 02:30 with a 30-minute randomized delay. Change the
timer cadence if the configured `BACKUP_RPO_HOURS` requires a shorter interval.

## Manual verification of the latest valid backup

The safest check is a restore drill, not only an object listing. To inspect
the latest object and its checksum without changing a database, use the
restore script with a drill-only target:

```bash
RESTORE_DATABASE_NAME=pollo_distribucion_restore_drill \
  ./scripts/database/restore-postgres-from-b2.sh
```

The script refuses an empty bucket, zero-byte archive, missing manifest,
checksum mismatch, missing production database, existing target database, or
any target that is not suffixed `_restore_drill`. It creates the target with
`template0`, restores the custom archive, runs
`scripts/database/verify-restored-database.sh`, checks PostGIS and critical
Prisma/ERP tables, records the drill result, and only then drops the temporary
database. A failed drill result is kept locally; a failed downloaded archive
is retained in the restore failure directory.

The result JSON is non-secret and includes the backup key, target database,
verification status, cleanup status, and failure stage. A result with
`"status": "passed"` and `"cleanup": "passed"` is the evidence for a
successful drill.

## Emergency restoration

An emergency restore is a separate, reviewed incident procedure. Do not point
the restore-drill script at production and do not use `--clean` against the
production database.

1. Stop application writes and put the frontend/backend into maintenance.
2. Confirm the selected B2 object and manifest checksum using a read-only
   operator key.
3. Take a final pre-restore snapshot if the damaged database is still
   readable.
4. Restore into a newly created production database with `pg_restore` from
   the verified custom archive, using `--no-owner --no-acl --exit-on-error`.
5. Run Prisma migration/status checks and the same PostGIS/critical-table
   verification before switching `DATABASE_URL`.
6. Deploy/restart the one-shot migration and backend sequence only after the
   restored schema is reviewed, then run application readiness and business
   smoke checks.
7. Preserve the archive, manifest, command output, and incident result for the
   retention period.

The production database name must never be supplied as
`RESTORE_DATABASE_NAME`; the drill guard is intentionally stricter than an
emergency procedure. Emergency restoration requires an administrator to
confirm the target database and change window.

## Credential rotation

1. Create a replacement B2 application key with the same bucket scope and
   minimum permissions.
2. Update the root-only `postgres-backup.env` file atomically, without
   committing or echoing it.
3. Run one manual backup and a restore drill with the replacement key.
4. Confirm the new object and result JSON, then revoke the old key in B2.
5. Record the rotation date and next review date without recording the secret.

## RPO/RTO

`BACKUP_RPO_HOURS` and `BACKUP_RTO_MINUTES` are explicit operational targets,
not automatic guarantees. The effective RPO is the timer interval plus its
delay and the time since the last validated upload. The effective RTO includes
B2 download, archive restore, Prisma compatibility checks, and application
readiness. Review the targets after measuring a real dump and restore drill.
