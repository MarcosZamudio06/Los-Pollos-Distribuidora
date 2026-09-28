# PostgreSQL/PostGIS backup component

This document describes the PostgreSQL component used by the coordinated
recovery-set workflow. It is not a standalone Disaster Recovery schedule and a
PostgreSQL-only result does not prove that Object Storage can be recovered.
Production automation must use
[`production-recovery-set-backup.md`](production-recovery-set-backup.md).
For full-set verification and Disaster Recovery boundaries, use the
[`multi-company backup and Disaster Recovery runbook`](multi-company-backup-restore.md).
PostgreSQL remains private inside Docker; the component enters the healthy
`postgres` service with `docker compose exec` and sends the archive to
Backblaze B2 through its S3-compatible API.

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
BACKUP_FAILED_KEEP_COUNT=1
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

## Component behavior

`create-company-recovery-set.sh` invokes the PostgreSQL component only after
preflighting the tenant's PostgreSQL/Object Storage services and pausing the
backend write path. The component:

1. checks required B2 variables, the Docker Compose file, service health, and
   available disk space;
2. runs `pg_dump --format=custom --compress=6 --no-owner --no-acl` inside the
   private `postgres` service;
3. rejects an empty or unreadable archive;
4. uploads the dump and a checksum manifest to B2;
5. verifies both remote objects with `head-object`, downloads the dump again,
   and compares byte size and SHA-256;
6. in standalone PostgreSQL mode, applies PostgreSQL-only retention after that
   validation. Recovery-set mode disables this component retention and lets
   the complete-set coordinator manage the paired lifecycle; and
7. records a non-secret local result under the backup result directory and
   deletes temporary files only after successful validation.

The standalone deterministic object layout is:

```text
postgres/YYYY/MM/YYYY-MM-DDTHH-MM-SSZ.dump
postgres/YYYY/MM/YYYY-MM-DDTHH-MM-SSZ.manifest.json
```

The manifest contains the key, archive format, database name, byte size, and
SHA-256. It does not contain endpoints or credentials. Recovery-set mode uses
`postgres/<company-slug>/YYYY/MM/<timestamp>-<run-id>.dump` and records the
company slug in the component manifest to prevent cross-company key
collisions. If upload or validation fails, `BACKUP_FAILED_KEEP_COUNT` bounds
failed PostgreSQL and Object Storage evidence under their local `failed`
directories.

## Retention policy

Retention is a union of windows, so a copy is retained when it is the newest
copy for any configured daily, ISO-week, or calendar-month group. The newest
valid dump is always retained, even when all windows are zero. Only matching
deterministic `.dump` objects and their manifests are candidates for deletion;
unrecognized objects are left untouched.

The defaults are 14 daily, 8 weekly, and 6 monthly windows. Set the variables
explicitly for the required RPO and compliance policy. A retention failure
returns a failed job even though the already-validated newest backup remains
in B2. For recovery-set mode, see
[`production-recovery-set-backup.md`](production-recovery-set-backup.md): the
paired coordinator retains whole sets and deletes unreferenced components only
after validating all recognized recovery manifests in the bucket.

## Deprecated PostgreSQL-only automation

The former `pollos-distribuidor-postgres-backup.timer` and matching service
were removed because they could create a fresh database dump while leaving
Object Storage at another point in time. If they were installed on a VPS,
disable and remove them as part of deploying the complete recovery-set units;
the migration commands are in
[`production-recovery-set-backup.md`](production-recovery-set-backup.md).
Do not enable the old 24-hour timer as a compatibility path.

## Manual verification of the latest valid backup

The safest PostgreSQL component check is a restore drill, not only an object
listing. This check verifies only the database component and is not a
substitute for the disposable full recovery-set drill in the
[multi-company recovery runbook](multi-company-backup-restore.md). To inspect
the latest database object without changing the production database, use a
drill-only target:

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

Emergency recovery requires an incident/change owner to approve the affected
company, target, downtime window, and rollback plan. The repository's restore
scripts enforce disposable targets; they are not the production import path.
The incident-gated replacement-host process and current production-restore
tooling boundary are documented in the
[`multi-company backup and Disaster Recovery runbook`](multi-company-backup-restore.md).

1. Quiesce/contain writes and public routing for this company. This Compose
   stack has no built-in maintenance page; do not imply that stopping the API
   leaves a maintenance page active.
2. Select and verify the company-matched complete recovery set, not a standalone
   PostgreSQL component. If the damaged database remains readable, take a
   separate pre-restore snapshot without modifying it.
3. Run a disposable restore drill first. The component-only drill below does
   not validate Object Storage or DB-to-object references.
4. Continue only with a separately reviewed DBA import into a new isolated
   replacement database. Do not restore over the active production database,
   invoke this drill with a production `RESTORE_DATABASE_NAME`, or use `--clean`.
5. Verify Prisma/schema compatibility, PostGIS, critical tables, and the
   complete-set storage-reference checks before starting the application.
6. Start services and switch only this company's routing after readiness and
   business smoke checks pass. Preserve the old data target and sanitized
   incident evidence until recovery is accepted.

## Credential rotation

1. Create a replacement B2 application key with the same bucket scope and
   minimum permissions.
2. Update the root-only `postgres-backup.env` file atomically, without
   committing or echoing it.
3. Run one coordinated recovery-set backup and a disposable full recovery-set
   drill with the replacement key.
4. Confirm the new object and result JSON, then revoke the old key in B2.
5. Record the rotation date and next review date without recording the secret.

## RPO/RTO

`BACKUP_RPO_HOURS` and `BACKUP_RTO_MINUTES` apply to the complete company
recovery workflow, not this PostgreSQL component alone. The production
recovery-set runbook defines the schedule envelope and uses the same RPO as the
monitor threshold. The RTO includes B2 download, both component restores,
Prisma compatibility checks, and application readiness; measure it with
disposable full recovery-set drills.
