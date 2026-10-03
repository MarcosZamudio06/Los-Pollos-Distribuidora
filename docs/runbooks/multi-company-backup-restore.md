# Multi-company backup and Disaster Recovery runbook

This is the operator procedure for a complete company recovery point: PostgreSQL/PostGIS plus that company's Object Storage, captured behind one backend write barrier and stored in external B2. A PostgreSQL-only dump is not a complete recovery point.

For timer configuration and the full systemd environment contract, see [Production recovery-set backup](production-recovery-set-backup.md). For PostgreSQL component details, see [PostgreSQL/PostGIS backup component](postgres-backup-b2.md). This runbook is the operational path for company selection, restore drills, and incident recovery.

## Safety boundary: drill versus production recovery

| Operation | Target | Safe use |
| --- | --- | --- |
| Restore drill | A new database whose name ends in `_restore_drill` and a generated `mte-restore-<company>-...` Object Storage bucket | Repeatable, auditable, and cleaned up by the drill scripts. Use this for routine verification. |
| Emergency production recovery | A replacement host and newly provisioned, company-isolated production resources | Only after an incident/change owner explicitly opens a recovery window and approves the target and cutover. Never point a drill at production. |

**Replacement restore is separate from drills and cutover.** `restore-company-production-replacement.sh` imports a selected complete set into a new, isolated replacement PostgreSQL database and Object Storage bucket. It never drops a database, deletes bucket contents, or changes routing. The `_restore_drill` scripts still use disposable targets and cleanup; never use them for replacement recovery.

## Disposable runtime drill

On a Linux host with Docker Compose and the backend npm dependencies installed, run
`bash scripts/database/test-disaster-recovery-runtime.sh`. The harness creates a
unique Compose project with production-compatible PostGIS and two separate
SeaweedFS S3 endpoints. It applies actual Prisma migrations, seeds a delivery
evidence object and a non-PAC fiscal fixture, invokes the production recovery-set
and restore scripts, checks restored data and cross-references, rejects corrupted
components and a mismatched company, then removes its containers and network.
It never accepts production endpoints or credentials; all values are set inside
the harness to disposable fixtures. Set `DR_EVIDENCE_DIR` to a private directory
to retain `dr-runtime.json` and `cleanup.json`; without it the measured JSON is
printed and temporary files are removed. The required Quality Gate job runs
this harness on Linux and executes `systemd-analyze verify` on the backup and
monitor units. Contract tests alone are not a substitute for a successful job.

`dr-runtime.json` records the write barrier, recovery-set completion, restore
milestones, quiesce and backup durations, exercise RTO, and the remaining margin
under a 24-hour RPO. These numbers describe only the small disposable fixture.
Repeat the drill against representative production volume and actual replacement
infrastructure before claiming a production RTO. Until the separate fail-closed
production recovery executor is implemented and its cutover proven, the
production-recovery readiness decision remains **NO_GO**.

## Recovery invariants

- Select one lowercase `COMPANY_SLUG` and one matching recovery-set manifest. The key must begin `recovery-sets/<company-slug>/`; a mismatched company must fail before target mutation.
- Each company has its own database, Object Storage service/bucket, backup bucket and credentials, Compose project, local result directory, and restore target. Never share these across companies.
- In multi-company deployments, run host-local backup/restore operations on the company's deployment host. Its `deploymentHostRef` must uniquely match the local host; do not rely on remote Docker contexts for bind-mounted recovery files.
- Do not alter Prisma schema or add a tenant discriminator for recovery. Company isolation is provided by independent deployment/data planes.
- A set is usable only after its recovery manifest, PostgreSQL component, Object Storage component, sizes, SHA-256 values, company identity, and write-barrier timestamps have all been verified.
- Secrets are supplied by root-only files or the configured secret resolver. Never put them in Git, company manifests, audit JSONL, logs, shell arguments, monitoring alerts, or images.

## Root-only configuration

The systemd backup unit runs as root and reads the following files. Keep them outside the repository. The examples below create or permission files without printing or replacing their contents; use `sudoedit` or the approved secret manager to edit them.

```bash
sudo install -d -o root -g root -m 0700 /etc/pollos-distribuidor
sudo touch /etc/pollos-distribuidor/production.env \
  /etc/pollos-distribuidor/postgres-backup.env \
  /etc/pollos-distribuidor/recovery-set-backup.env
sudo chown root:root /etc/pollos-distribuidor/production.env \
  /etc/pollos-distribuidor/postgres-backup.env \
  /etc/pollos-distribuidor/recovery-set-backup.env
sudo chmod 0600 /etc/pollos-distribuidor/production.env \
  /etc/pollos-distribuidor/postgres-backup.env \
  /etc/pollos-distribuidor/recovery-set-backup.env
sudoedit /etc/pollos-distribuidor/production.env
sudoedit /etc/pollos-distribuidor/postgres-backup.env
sudoedit /etc/pollos-distribuidor/recovery-set-backup.env
sudo stat -c '%U:%G %a %n' /etc/pollos-distribuidor/*.env
```

| File | Single-company content | Multi-company content |
| --- | --- | --- |
| `production.env` | Compose runtime configuration and the company's database/Object Storage credentials. | Required systemd environment file; keep tenant-specific non-secret Compose configuration in the external tenant directory. Resolve tenant secrets through the resolver. |
| `postgres-backup.env` | B2 S3 endpoint, region, bucket, application key ID and secret key, plus retention/RPO/RTO settings. | Optional for the timer when every tenant resolves its own backup credentials. |
| `recovery-set-backup.env` | `RECOVERY_BACKUP_MODE=single-company`, Compose paths/project, local backup path and lock path. | `RECOVERY_BACKUP_MODE=multi-company`, manifest path, local `deploymentHostRef`, tenant env directory, resolver, operator/audit settings, and lock path. |

For multi-company mode, keep `/etc/pollos-distribuidor/companies.json` and each `/etc/pollos-distribuidor/tenants/<company-slug>/.env.production` outside Git and not group/world-writable. The tenant env files contain non-secret `KEY=VALUE` configuration only; secret values come from the executable resolver configured by the manifest. Protect the resolver and its authentication material with root ownership and the host's secret-management policy. The B2 key must be scoped to the selected company's backup bucket and permit list/read/write/delete because the complete-set retention job needs deletion access.

Do not run `cat`, `env`, `systemctl show ... Environment`, shell tracing (`set -x`), or `docker inspect` to inspect environment values. To check permissions, use only `stat` as above. A missing or inaccessible required file should fail closed; do not copy credentials into `.env.production.example`, unit files, manifests, or commands.

## Install and enable the automatic timer

Install the complete recovery-set units from the deployed checkout. If the retired PostgreSQL-only timer is installed, disable it first; do not leave it enabled alongside the complete-set timer.

```bash
# Run these two commands only when the legacy units are installed.
sudo systemctl disable --now pollos-distribuidor-postgres-backup.timer
sudo systemctl stop pollos-distribuidor-postgres-backup.service

sudo install -o root -g root -m 0644 \
  /opt/pollos-distribuidor/docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.service \
  /etc/systemd/system/pollos-distribuidor-recovery-set-backup.service
sudo install -o root -g root -m 0644 \
  /opt/pollos-distribuidor/docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.timer \
  /etc/systemd/system/pollos-distribuidor-recovery-set-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now pollos-distribuidor-recovery-set-backup.timer
```

Run one immediate complete backup through the same service path, then confirm the timer is armed:

```bash
sudo systemctl start pollos-distribuidor-recovery-set-backup.service
sudo systemctl status pollos-distribuidor-recovery-set-backup.timer --no-pager
sudo systemctl status pollos-distribuidor-recovery-set-backup.service --no-pager
sudo systemctl list-timers pollos-distribuidor-recovery-set-backup.timer
```

The service requires Docker, runs as root with `UMask=0077`, uses `flock` to prevent concurrent scheduled runs, and has an eight-hour timeout. It uses the checked-out scripts and does not run cron inside the backend. In multi-company mode, the timer selects exactly one active production company assigned to this local deployment host. Install/enable the timer on every company deployment host; do not assume one host can safely back up remote Docker contexts.

## Run a manual complete backup

### Single-company

The safest manual trigger uses the installed service, which loads the root-only files and invokes the same coordinated recovery-set script as the timer:

```bash
sudo systemctl start pollos-distribuidor-recovery-set-backup.service
```

Do not call `backup-postgres-to-b2.sh` or `backup-object-storage-to-b2.sh` separately and treat their outputs as a recovery set.

### Multi-company

Run from the selected company's deployment host with the same external manifest, tenant configuration directory, and resolver used by systemd. Replace the placeholders before execution. `--reason` must be an approved ticket/change reference; `--apply` and `--confirm` make this an auditable operation.

```bash
COMPANY_SLUG='<company-slug>'
CHANGE_REF='<approved-ticket-reference>'
sudo /opt/pollos-distribuidor/scripts/multi-company/tenantctl backup \
  --manifest /etc/pollos-distribuidor/companies.json \
  --company "$COMPANY_SLUG" \
  --env-dir /etc/pollos-distribuidor/tenants \
  --resolver /usr/local/libexec/pollos-secret-resolver \
  --operator pollos-manual-backup \
  --audit-log /var/log/pollos-distribuidor/tenantctl-audit.jsonl \
  --apply --reason "$CHANGE_REF" --confirm
```

The `--company` value must be active, production, and assigned to this VPS. Never use a batch/all-company operation from a host whose local Docker/file paths do not cover every selected company. Do not run another backup or restore drill for the same company concurrently.

## Automatic schedule and RPO

The timer runs at 00:00 and 12:00 UTC with up to 30 minutes randomized delay, one minute accuracy, `Persistent=true`, and an eight-hour service timeout. The maximum age of the prior recovery point while the next full set is being validated is `12h + 30m + 1m + 8h = 20h31m`, leaving 3h29m margin under the default `BACKUP_RPO_HOURS=24`. The monitor measures from `recovery_point.write_barrier_at`, warns at 21 hours, and becomes critical at the configured 24-hour RPO deadline. Do not change the RPO without aligning the timer, timeout, dispatcher minimum-RPO guard, and monitor settings.

This is a scheduling envelope, not a guarantee during VPS/B2 outages or repeated failures. `Persistent=true` retries a missed calendar activation after host recovery; it cannot back up while a host is unavailable. The PostgreSQL-only timer is not a fallback and is not a complete protection signal.

## Interpret results and check B2

The local recovery result is non-secret JSON. The default paths are:

- Single-company: `/var/lib/pollos-distribuidor/postgres-backups/results/company-recovery/`.
- Multi-company: `/var/lib/pollos-distribuidor/<company-slug>/postgres-backups/company-recovery/`.

Choose the newest result for the exact company and inspect only that result file:

```bash
COMPANY_SLUG='<company-slug>'
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo 'Invalid company slug' >&2
  exit 2
fi
RESULT_DIR="/var/lib/pollos-distribuidor/${COMPANY_SLUG}/postgres-backups/company-recovery"
RESULT_FILE=$(sudo ls -1t "$RESULT_DIR"/*.json | head -n 1)
sudo python3 -m json.tool "$RESULT_FILE"
```

For single-company mode, set `RESULT_DIR=/var/lib/pollos-distribuidor/postgres-backups/results/company-recovery` instead, then run the same selection/inspection commands.

Accept it only when all of the following are true:

- top-level `status` is `validated` and `company_slug` is the intended company;
- `components.postgresql` and `components.object_storage` are both `validated`;
- `recovery_point.method` is `backend-quiesce`, component capture timestamps fall within its barrier, and backend restoration is `restored` or `preexisting-stopped` as expected;
- `recovery_set_key` has the expected company prefix and `retention.status` is `applied`;
- the service exit status is successful and the monitoring result is healthy for that company.

For a failed result, start with `failure_stage`, `cleanup_stage`, component statuses, `backend_restoration`, and timestamps. A partial upload, component manifest, or local archive is not a valid recovery point.

In the B2 console, use the bucket configured for this company and confirm the result's recovery-set manifest plus its `.sha256` sibling exist under `recovery-sets/<company-slug>/`. Confirm the PostgreSQL and Object Storage component keys/manifests referenced by that recovery manifest also exist under their company prefixes. The console listing proves existence only: it does not prove byte integrity or a coherent point. The backup scripts perform upload/readback and SHA-256/size checks; a disposable restore drill is the end-to-end recovery evidence. Never put B2 endpoints, bucket names, key IDs, or credentials in public alerts; keep operational evidence access-controlled.

Object Storage export retains the current compatible `s3 sync` → `tar.gz` → upload/readback flow. Before quiescing the ERP, the coordinator inventories source object sizes and checks that local free space covers the working copy, a conservative archive upper bound (gzip expansion, tar entries, and headers), the remote checksum-verification download, and the configured reserve. The component script repeats this preflight immediately before export. Plan the recovery volume for this calculated peak; the configured minimum free-space reserve alone is not a backup-size estimate.

## Quiesce, maintenance, and cleanup behavior

The coordinator checks PostgreSQL health/`pg_isready`, Object Storage health/`head-bucket`, and backend health before mutation. It acquires a company-local lock, then gracefully stops only that company's `backend` Compose service. It captures both components while that backend is down, restores the backend to its prior running/stopped state, verifies its health when it was running, and only then publishes the complete recovery-set manifest and applies retention.

PostgreSQL, Object Storage, frontend, and Caddy are not stopped. This stack has no maintenance-page switch: the frontend/Caddy may remain reachable while API requests fail during the short backup barrier. Schedule a low-traffic window and notify users. Do not perform a deploy, migration, secret rotation, or another backup/restore operation for the same company during the barrier.

EXIT and catchable signal cleanup attempts to restore a backend that the job stopped. If any stage fails, no `validated` recovery-set manifest is published. A power loss or uncatchable kill cannot run the shell trap; after host recovery, check the backend and all stateful service health before reopening ERP writes or retrying. If `backend_restoration` is failed, restore service state using the normal tenant deployment procedure and verify health before accepting writes.

## Retention and local failed artifacts

Configure `BACKUP_RETENTION_DAILY`, `BACKUP_RETENTION_WEEKLY`, and `BACKUP_RETENTION_MONTHLY`; defaults are 14 daily, 8 ISO-weekly, and 6 calendar-monthly recovery points. Selection retains the newest complete set in each configured window and always preserves the newest valid set. PostgreSQL component-only retention is disabled inside the coordinator; the recovery set owns component lifecycle.

Retention runs only after the new full set has validated. It verifies recognized recovery/component manifests and checksums before deletion, fails closed on invalid/missing manifests, ignores unknown objects, and never deletes a component referenced by any retained recovery set (including another company). Do not delete B2 objects manually or run component retention against a recovery-set bucket. The B2 key needs list/read/write/delete permissions for the configured bucket.

`BACKUP_FAILED_KEEP_COUNT` (default `1`) bounds local failed PostgreSQL/Object Storage component evidence. Recovery result JSON and restore-drill evidence are operational records; monitor local free space and failed-attempt accumulation, then use the retention policy established by operations rather than deleting evidence ad hoc.

## Restore drills (disposable targets only)

Run a complete restore drill for every company at least monthly; the monitor warns when the latest valid drill is older than 35 days. A routine `tenantctl restore-drill` first creates a fresh complete recovery set, then restores both components to disposable targets and verifies the database-to-object references before cleanup. For multi-company mode:

```bash
COMPANY_SLUG='<company-slug>'
CHANGE_REF='<approved-ticket-reference>'
sudo /opt/pollos-distribuidor/scripts/multi-company/tenantctl restore-drill \
  --manifest /etc/pollos-distribuidor/companies.json \
  --company "$COMPANY_SLUG" \
  --env-dir /etc/pollos-distribuidor/tenants \
  --resolver /usr/local/libexec/pollos-secret-resolver \
  --operator pollos-restore-drill \
  --audit-log /var/log/pollos-distribuidor/tenantctl-audit.jsonl \
  --apply --reason "$CHANGE_REF" --confirm
```

This multi-company command drills the newly created set, not an older selected key. For a single-company deployment, `restore-company-recovery-set.sh` drills the selected existing recovery-set key. Run it only under a root systemd execution context that loads the three root-only environment files. Replace all placeholders with the company's actual database name, Compose project, and recovery-set key:

```bash
sudo systemd-run --wait --pipe --collect \
  --property=WorkingDirectory=/opt/pollos-distribuidor \
  --property=UMask=0077 \
  --property=EnvironmentFile=/etc/pollos-distribuidor/production.env \
  --property=EnvironmentFile=/etc/pollos-distribuidor/postgres-backup.env \
  --property=EnvironmentFile=/etc/pollos-distribuidor/recovery-set-backup.env \
  --setenv='RESTORE_DATABASE_NAME=<database>_restore_drill' \
  --setenv='RESTORE_RECOVERY_SET_KEY=recovery-sets/<company-slug>/<timestamp>-<run-id>.manifest.json' \
  --setenv='BACKUP_UPLOAD_NETWORK=<compose-project>_app_network' \
  --setenv='COMPANY_RECOVERY_RESULT_DIR=/var/lib/pollos-distribuidor/postgres-backups/restore-drills' \
  /usr/bin/bash scripts/database/restore-company-recovery-set.sh
```

The full-set script rejects a production database name or mismatched company before target mutation. It downloads and verifies the recovery manifest and both component archives, restores PostgreSQL into the `_restore_drill` database and Object Storage into a generated `mte-restore-<company>-...` bucket, performs the cross-check, then cleans both disposable targets. Do not substitute production database or bucket names. Treat cleanup failure as drill failure and do not mark the run healthy until target cleanup is verified.

The database/object verifier checks `CompanyBranding.logoObjectKey`, `DeliveryEvidence.storageKey`, and `AVAILABLE` `FiscalArtifact.storageKey` references when present. It requires referenced objects to exist in the company-matched disposable bucket and compares restored bytes with persisted SHA-256/size fields and relevant MIME metadata when those fields exist. A missing, corrupt, wrong-size, wrong-checksum, wrong-company, or relevant metadata mismatch fails the drill. A table-existence check alone is not evidence of reference integrity.

For a PostgreSQL-component-only drill, see [Manual verification in the PostgreSQL component runbook](postgres-backup-b2.md#manual-verification-of-the-latest-valid-backup). That check does not prove Object Storage recovery. Object Storage restoration is exercised by the full-set drill; do not run its internal component script directly or point it at a production bucket.

The multi-company restore result is written under `/var/lib/pollos-distribuidor/<company-slug>/postgres-backups/restore-drills/`; the single-company command above writes under its configured `COMPANY_RECOVERY_RESULT_DIR` (default: `<RESTORE_LOCAL_DIR>/results`). Accept only `status: "passed"`, matching company/recovery-set key, `disposable_targets_cleanup: "cleaned"`, successful PostgreSQL/PostGIS and Object Storage checks, `storage_reference_integrity` passed, and every applicable reference check actually executed. `not_run`, missing, failed, or corrupt JSON is not a successful drill.

## Recovery after partial failure

1. Check the service journal and newest company-local result JSON; do not print or copy environment values.
2. If backup failed before a validated recovery manifest exists, treat all uploaded component artifacts as incomplete. Do not assemble them manually. Confirm PostgreSQL/Object Storage/backend health and absence of another same-company lock before retrying the **complete** service.
3. If backend restoration failed, keep ERP writes closed until the normal deployment procedure restores and verifies the backend.
4. If a restore drill failed, preserve its non-secret result. If cleanup is failed/unknown, verify the recorded database and generated disposable bucket identities before any operator cleanup; never use a wildcard or production resource name.
5. A retention failure means the new set may already be validated but cleanup did not complete. Do not manually delete objects. Correct B2 list/read/write/delete access or invalid-manifest cause, then follow the recovery-set retention procedure; keep the valid recovery point.
6. After correction, rerun a complete backup or restore drill and wait for its result/monitor check. Do not treat a successful PostgreSQL component alone as recovery protection.

Useful service diagnostics:

```bash
sudo systemctl status pollos-distribuidor-recovery-set-backup.service --no-pager
sudo journalctl -u pollos-distribuidor-recovery-set-backup.service -n 200 --no-pager
sudo systemctl start pollos-distribuidor-recovery-set-backup.service
sudo systemctl status pollos-distribuidor-monitor.timer --no-pager
```

## Emergency production recovery, including total VPS loss

This is a separate incident path, not a restore drill. A destructive action against a production resource is prohibited unless an incident commander/change owner explicitly approves the company, selected recovery set, target, downtime window, rollback plan, and operator. Prefer rebuilding on **new isolated resources** and cutting over only after validation; never restore over an active database or bucket as an initial recovery action.

### Incident procedure

1. Open the incident and record an approved incident/change reference, affected `COMPANY_SLUG`, incident start UTC, declared RPO/RTO, and decision owner. For a partially available host, close ingress/writes for that company and verify the backend is quiesced before any production cutover. This stack has no built-in maintenance page.
2. Select a `recovery-sets/<company-slug>/...manifest.json` from that company's B2 bucket. Verify the manifest/checksum and exact tenant identity. Record the selected key and `recovery_point.write_barrier_at`; do not select component keys independently.
3. Provision a replacement VPS, Docker/Compose, the approved immutable application images, company-specific Caddy/TLS/DNS configuration, and the external root-only configuration/secrets. Do not depend on old VPS-local archives, result files, container layers, or secrets.
4. Build a new isolated company deployment with fresh PostgreSQL and Object Storage targets. Confirm the target database/bucket/Compose project are new and belong only to this company. Keep ERP backend and public routing disabled.
5. Run a disposable full-set restore drill against the selected recovery point where the supported single-company selected-key path is available. The current multi-company `tenantctl restore-drill` always creates and drills a fresh set; it has no option to select an older key, so do not claim that it validates a chosen historical set. Confirm archive SHA-256/size, schema/release compatibility, PostgreSQL/PostGIS, Object Storage, storage references, and disposable-target cleanup.
6. Run `scripts/database/restore-company-production-replacement.sh` first without arguments for a no-mutation preflight, then with `--apply` and the exact confirmation token after incident approval. See the separate replacement procedure below. It refuses existing or original targets, incompatible release/schema fingerprints, invalid/corrupt sets, and missing confirmation before target mutation. A failed import retains new targets for analysis and leaves routing closed.
7. Accept only its `READY_FOR_CUTOVER` evidence after PostGIS, critical tables, exact migration history, object SHA-256/size/MIME/reference checks, replacement health, and approved isolated smoke script pass. The external smoke script must check backend/frontend/Caddy and business behavior without opening public routing or writing to old resources. A data-only smoke is insufficient for a real incident.
8. **Separate cutover hold point:** the restore command does not change DNS, Caddy, or application routing. After explicit incident-owner approval of the evidence and rollback plan, a separate deployment/change procedure routes only that company to the replacement services. Resume writes only after health and smoke checks pass. Keep the old host/volumes or damaged resources isolated and unchanged until the incident owner accepts the recovery and rollback plan.
9. Preserve the incident timeline, selected set key, result JSON, sanitized command outcomes, measured RPO/RTO, cleanup state, and approvals. Do not attach secrets, raw environment files, or credential-bearing logs.

### Replacement production import (new infrastructure only)

Use a new Compose project whose name ends in `-replacement`, a database ending in `_replacement`, and a new bucket named `mte-replacement-<company>-<YYYYMMDDHHMMSS>-<unique-number>`. The new project/network and Object Storage endpoint must differ from the original deployment. Keep the replacement backend/public ingress closed until the import and isolated smoke finish. The target PostgreSQL service and Object Storage server may exist, but the target database and bucket must **not** exist.

The protected replacement Compose env file must contain exactly one each of `RECOVERY_TARGET_ROLE=replacement`, `RECOVERY_COMPANY_SLUG=<company>`, and `RECOVERY_HOST_REF=<replacement-host-ref>`. The executor rejects missing, duplicate, or mismatched markers; the host reference must differ from the declared original host reference.

Load credentials from root-only external secret management, never from command-line arguments or Git. Set the following in that protected process environment:

| Group | Required variables |
| --- | --- |
| Selection and approval | `COMPANY_SLUG`, `RESTORE_RECOVERY_SET_KEY`, `RESTORE_INCIDENT_REF`, `RESTORE_INCIDENT_DECLARED_AT` (UTC), `RESTORE_CONFIRMATION` for apply only |
| Original identity | `RESTORE_PRODUCTION_DATABASE_NAME`, `RESTORE_PRODUCTION_BUCKET`, `RESTORE_PRODUCTION_S3_ENDPOINT`, `RESTORE_PRODUCTION_COMPOSE_PROJECT`, `RESTORE_ORIGINAL_HOST_REF` |
| New identity | `RESTORE_REPLACEMENT_DATABASE_NAME`, `RESTORE_REPLACEMENT_BUCKET`, `RESTORE_REPLACEMENT_COMPOSE_PROJECT`, `RESTORE_REPLACEMENT_HOST_REF`, `RESTORE_REPLACEMENT_COMPOSE_FILE`, `RESTORE_REPLACEMENT_COMPOSE_ENV_FILE`, `RESTORE_REPLACEMENT_NETWORK`, `RESTORE_REPLACEMENT_POSTGRES_PASSWORD`, `RESTORE_REPLACEMENT_S3_ENDPOINT`, `RESTORE_REPLACEMENT_S3_REGION`, `RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID`, `RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY` |
| Backup source | `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`; optional `BACKUP_UPLOAD_NETWORK` only when it belongs to the replacement host |
| Compatibility and smoke | `RESTORE_APPROVED_BACKEND_DIGEST`, `RESTORE_APPROVED_FRONTEND_DIGEST`, `RESTORE_APPROVED_SCHEMA_SHA256`, `RESTORE_HEALTH_SMOKE_SCRIPT`, `RESTORE_HEALTH_SMOKE_SHA256`, `RESTORE_TRAFFIC_CLOSED_SCRIPT`, `RESTORE_TRAFFIC_CLOSED_SHA256` |

The approved digests/schema SHA and script SHA-256 values must come from the immutable replacement release/change record, **not** merely be copied from the recovery manifest to make the check pass. The smoke and closed-traffic scripts must be approved, executable, non-symlink local files. The closed-traffic script must inspect the actual DNS/Caddy/ingress boundary, not merely return success; it runs before mutation and again before ready-for-cutover. The smoke script runs only after data verification and must validate the isolated app. Never let either script change routing or write to original resources. The operator is responsible for verifying the actual deployed images match the approved digests.

```bash
bash scripts/database/restore-company-production-replacement.sh
# Expect: PREFLIGHT_PASSED_NO_MUTATION; inspect the selected set and target identities.
# After change-owner approval, set RESTORE_CONFIRMATION to the exact value below
# through protected configuration, not a shell history entry:
# RESTORE:<company>:<incident-ref>:<replacement-compose-project>
bash scripts/database/restore-company-production-replacement.sh --apply
```

The result JSON defaults to `RESTORE_LOCAL_DIR/<timestamp>-<pid>.json` (or `RESTORE_RESULT_FILE`). It records stage timestamps, source recovery point, observed RPO, partial RTO through ready-for-cutover, checks, and `READY_FOR_CUTOVER` or `FAILED`; it omits endpoints and secrets. Protect it as incident evidence. A failure never cleans the new targets automatically: inspect them before any separately approved cleanup. The script does not provide a cutover command.

### Total VPS loss checklist

- Confirm the B2 recovery bucket and secret/configuration management are external to the failed VPS and accessible to the incident team.
- Rebuild the operating system and host dependencies; restore root-owned configuration from the approved external source, not from Git or an image.
- In multi-company mode, install the non-secret company manifest, local deployment-host binding, protected tenant config, and secret resolver. Restore only the company assigned to this replacement host.
- Reinstall the recovery/monitor systemd units after the ERP data recovery and cutover plan are approved. `Persistent=true` may run a missed backup after boot; disable the timer until the restored company is healthy and the first post-recovery full set can complete safely.
- Do not start backend/migrations against an empty replacement database and then restore over it. Keep the application unavailable until the approved import and compatibility checks are complete.

## Per-company recovery checklist

For every company, record separately:

- company slug, deployment host reference, Compose project, production database name, Object Storage bucket, and B2 backup bucket;
- latest validated recovery-set key/checksum, component keys, `write_barrier_at`, and result status;
- monthly full-set drill status, reference-integrity checks, cleanup status, and actual RTO evidence;
- root-only config/secret-manager references and responsible operator, never the secret values;
- retention values and monitor state for that company's deployment host.

Never reuse another company's recovery key, B2 credential, database, bucket, or local target. A recovery-set company mismatch is a hard stop even if all checksums are valid.

## Credential rotation (B2)

1. Create a replacement B2 application key scoped to the company's backup bucket and required list/read/write/delete operations. For restore-only personnel, prefer a separate read/list-only identity where the operating procedure permits it.
2. Update the secret-manager version/resolver reference for multi-company mode, or update `/etc/pollos-distribuidor/postgres-backup.env` through the approved root-only editor/secret-management path for single-company mode. Do not paste the value into a terminal command, ticket, Git file, or unit.
3. Keep both keys valid during the short verification window. Trigger one complete recovery-set backup, then a disposable full-set drill using the replacement credential path. Confirm remote readback and all checks.
4. Revoke the old key only after both operations pass. Record rotation date, key reference (not key material), operator, and next review date in the approved credential register.
5. If the new credential fails, retain the old key until repaired; do not relax bucket isolation or retention permissions.

## Measure RPO and RTO

Current configured objectives are `BACKUP_RPO_HOURS=24` (warning at 21 hours) and `BACKUP_RTO_MINUTES=60`. The 60-minute RTO is an objective, not a demonstrated guarantee until a full replacement-target drill measures it for each company. A normal restore drill exercises the data path but does not by itself measure replacement-VPS build time.

- **Measured RPO:** for an incident, `incident_detected_at_utc - selected_recovery_point.write_barrier_at`. For a routine drill, record `drill_started_at_utc - selected_recovery_point.write_barrier_at` as the maximum recovery-point age simulated by that drill. The 24-hour target is met only while a complete validated point is no older than 24 hours.
- **Measured RTO:** `service_ready_at_utc - incident_declared_at_utc`. `service_ready_at` is after both restores, company/reference-integrity validation, backend health, business smoke checks, and approved traffic cutover. Include host replacement/provisioning time for a total-VPS-loss drill; do not start the clock only at `pg_restore`.
- Record each company separately. At minimum run a full-set disposable drill monthly and a replacement-host/tabletop drill quarterly; the monitor's 35-day warning makes a longer gap in full-set evidence visible. Revisit the 60-minute objective if measured end-to-end restore time exceeds it.

| Company | Recovery-set key | Incident/drill start UTC | `write_barrier_at` UTC | RPO age | Service-ready UTC | RTO minutes | Reference checks | Cleanup | Operator |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- | --- |
| `<company-slug>` | `<recovery-set-key>` | `<UTC timestamp>` | `<UTC timestamp>` | `<minutes>` | `<UTC timestamp>` | `<minutes>` | `<passed/failed>` | `<cleaned/failed>` | `<operator-id>` |

Store the completed record with restricted incident evidence. Never count a failed/partial set, an unclean drill, or a PostgreSQL-only restore as a successful RPO/RTO exercise.

## Representative Replacement Drill — BACKUP-PROD-011

**Hold point: `READY_FOR_CUTOVER`, never production cutover.** This procedure
measures each company independently, using synthetic data scaled from an
approved operational measurement. It does not remove the historical **NO_GO**;
that decision belongs to BACKUP-PROD-012 after satisfactory audited evidence.
The small `Disposable Disaster Recovery runtime` remains a regression test,
not proof of production RTO. Its approximately 21/70-second fixture timings
must not be used as a production commitment.

### Required inputs, before launching expensive work

| Input | Authority / refusal |
| --- | --- |
| Audited SHA | Explicit 40-character release commit; record both release SHA and harness SHA. The manual workflow checks out that same SHA. |
| Approved images | The successful `Release Images` run and its `release-digests-<sha>` artifact, backed by a successful Quality Gate for that SHA. The harness retrieves it from GitHub, inspects registry manifests and verifies deployed image IDs/RepoDigests. A syntax-valid digest is not approval. |
| Release configuration | `OBJECT_STORAGE_PUBLIC_ORIGIN` must be the operator-approved canonical HTTPS origin. A failed publication means `APPROVED_RELEASE_IMAGES_UNAVAILABLE`. Do not bypass validation, build substitute local images, or invent an origin. |
| Volume profile | Copy `scripts/database/replacement-volume-profile.template.json` and replace every null with an actual operator measurement. Missing source/metrics means `REPRESENTATIVE_VOLUME_NOT_AVAILABLE`, not completion. |
| Synthetic recovery set | Prepare a separate synthetic source and export it with `create-company-recovery-set.sh`. Keep the set within 24 hours of the simulated incident's write barrier. Do not rewrite a real production manifest to label it synthetic. |
| Disposable host | Fresh, dedicated Docker daemon on a disposable host, no existing containers, local Unix Docker context, and `BENCHMARK_HOST_ROLE=disposable-benchmark`. No current production host, remote Docker context or arbitrary Compose file. |

The profile is non-secret: company slug, measurement timestamp and opaque evidence
reference, database bytes, exact counts for Product/Customer/Sale/SaleItem/
InventoryMovement/Payment/CashMovement/DeliveryEvidence/Invoice/FiscalArtifact,
object count, total/largest object bytes, increasing size bands, approved image
references and `target_rto_minutes=60`. For each size band record `max_bytes`,
`count` and `total_bytes`; counts/bytes must reconcile with the totals. Bands
are non-overlapping, with an inclusive upper bound. Export aggregates only,
not names, emails, object keys, XML, credentials or raw operational rows.

Use an authorized read-only operational session to measure
`pg_database_size(current_database())` and `count(*)` for those tables, and an
authorized Object Storage inventory to measure all object sizes. Preserve the
restricted measurement report outside Git/CI and put only its opaque reference
in `volume_source.evidence_ref`. The harness cannot independently authenticate
these operational measurements: the incident/change owner must review their
source and freshness. **No operational access means no representative PASS.**

### Prepare the synthetic set

Use only a dedicated source database ending in `_benchmark_source`, source bucket
`mte-benchmark-source-<company>-<unique>`, and B2 benchmark bucket
`mte-benchmark-backup-<company>-<unique>`. Migrate the source using the approved
backend image, then seed synthetic ERP business chains with valid constraints.
`dr-disposable-seed.sql` illustrates evidence/fiscal relationships, but its tiny
volume and `not-a-login-hash` are **not** suitable for this application smoke.
Provide a usable synthetic ADMIN login (`@example.test`) before the backup,
using the approved image's `bootstrap:production` with protected
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` configuration. Do not bootstrap over
the restored target or substitute a SQL-only final smoke.

Scale the synthetic rows AND database bytes; arbitrary padding alone fails.
Generate synthetic branding, delivery evidence and fiscal-artifact bytes with
valid MIME/size/SHA references, a mixture of small/large objects and the measured
size distribution. Never copy production PII, CFDI/XML, customer images or keys.
The fixed representativeness envelope is ±20% on database bytes, every table
count, object count/bytes/largest size and every size band's count/bytes. This
envelope does not change the 60-minute RTO objective.

Copy `replacement-synthetic-dataset.template.json` and supply the synthetic
source identities, actual recovery-set key, reviewed schema-state fingerprint,
restored product ID/SKU and synthetic branding SHA-256. `schema_state_sha256`
is the recovery tool's normalized migration-history fingerprint, **not** the
hash of `schema.prisma`. The release image also runs read-only
`prisma migrate status`; pending/incompatible migrations block the smoke.
This task supplies a consumer harness, not an automatic production-data exporter
or domain-scale seed generator. Fixture preparation remains explicit.

### Run on the freshly provisioned disposable host

Inject benchmark-only read credentials into `BACKUP_S3_ENDPOINT/REGION/BUCKET/
ACCESS_KEY_ID/SECRET_ACCESS_KEY`; inject the actual synthetic source endpoint
in `BENCHMARK_SOURCE_S3_ENDPOINT`, its opaque original host identity in
`BENCHMARK_ORIGINAL_HOST_REF`, and the fixture login in
`BENCHMARK_FIXTURE_EMAIL/PASSWORD` (16–128 random base64url-safe characters).
Do not put their values on command lines,
in Git or in artifacts. `GH_TOKEN`, when needed, is read-only Actions/package
access. `BACKUP_DOCKER_BIN` may select the installed Docker binary; the harness
does not repair the host or change its credential configuration.

Read-only dependency check (always nonzero without a complete benchmark):

```bash
python3 scripts/database/representative-replacement-benchmark.py --check \
  --audited-sha "$APPROVED_RELEASE_SHA" --evidence-dir "$NEW_PREFLIGHT_EVIDENCE_DIR"
```

Before provisioning a replacement host, the operator/provider must record the
incident timestamp. Use the provider's measured provisioning evidence, not a
manually asserted successful result. Its non-secret JSON contract is:

```text
kind: disposable-host
role: disposable-benchmark
host_ref: unique opaque replacement identity
original_host_ref: BENCHMARK_ORIGINAL_HOST_REF
incident_declared_at: UTC incident timestamp
provisioning_started_at: UTC actual provider start, at/after the incident
infrastructure_ready_at: UTC actual provider completion
evidence_ref: opaque reference to reviewed provider evidence
status: provider-observed passed
```

The harness checks timestamp ordering and identities, not the provider's
external attestation. Review that evidence independently. Once the new host
is ready, execute the checked-out harness there, with its provider receipt:

```bash
python3 scripts/database/representative-replacement-benchmark.py --apply \
  --audited-sha "$APPROVED_RELEASE_SHA" --company "$COMPANY_SLUG" \
  --volume-profile "$VOLUME_PROFILE_FILE" --dataset "$SYNTHETIC_DATASET_FILE" \
  --map-data "$PREPARED_PUBLIC_MAP_DATA_DIR" \
  --incident-declared-at "$INCIDENT_DECLARED_AT" \
  --host-provisioning "$REVIEWED_PROVIDER_RECEIPT_FILE" \
  --evidence-dir "$NEW_COMPANY_EVIDENCE_DIR"
```

Map data must contain the existing TileServer configuration's public
`rendering/mexico.pmtiles` and `rendering/fonts`. It is mounted read-only;
frontend/TileServer/backend use approved release digests. This benchmark's
business smoke scope is product reading and branding readback; it does not
prove map routing/geocoding workload performance or actual DNS/Caddy cutover.
PostGIS/SeaweedFS/AWS CLI use the reviewed repository pins, verified remotely
and recorded separately. All image pulls happen inside the incident clock.

Without a reviewed provider receipt, the harness still measures isolated
container provisioning on the existing host, but returns `NOT_REPRESENTATIVE`
(`HOST_PROVISIONING_NOT_INCLUDED`) even if every data/application check passes.
Do not present a hosted CI runner's pre-existing VM as measured replacement-VPS
provisioning. No arbitrary provisioning hooks are executed by this harness.

### Timeline, smoke, cleanup and acceptance

The timeline records incident declaration → replacement provisioning start →
infrastructure ready → restore start → restore complete → verification complete
→ `READY_FOR_CUTOVER`. The total is `ready_for_cutover_at - incident_declared_at`,
including the external host receipt, image pulls, readiness, downloads, database
creation/PostGIS/full restore, Object Storage restore/readback, migration history,
release checks, cross-references, backend/frontend startup, HTTP smoke and final
closed-traffic verification. This is **RTO to the hold point**, distinct from the
service-ready-after-cutover incident metric above. RPO uses the manifest's
`recovery_point.write_barrier_at`; a point older than 24 hours is refused before
database/bucket creation. `finished_at` is never the recovery point.

The mandatory HTTP smoke performs readiness, fixture login/authenticated `/me`,
restored product ID/SKU read, products listing, application-issued signed branding
URL readback with checksum, frontend HTML and frontend-to-backend readiness.
It prints only booleans, never response bodies, tokens or signed URLs. Login
creates an isolated session; it does not mutate business history. Ingress
checks inspect the actual internal Docker network, every container's networks
and port bindings, and resolved Compose configuration. There are no published
ports, Caddy or DNS actions. All original replacement-executor guards remain.

Every execution allocates a unique project/DB/bucket and refuses existing targets.
Teardown runs independently on success, failure and handled signals. It removes
only the owned project and data volumes, verifies containers/networks/volumes
are absent, and removes private work/config/archives. DB/bucket deletion is
proved through removal of their dedicated containers AND data volumes, not a
delete request to an external database or bucket. Failed cleanup blocks success;
do not hide it behind the main result. Abrupt power loss/SIGKILL still requires
operator cleanup using the exact recorded project identity, never production.

Preserve only sanitized evidence: `benchmark.json`,
`replacement-benchmark-<company>.json`, `smoke.json`, `cleanup.json`,
`release-digests.json`, `volume-profile.json`, and, when executed,
`observed-volume.json`, `replacement-ready.json` and `host-provisioning.json`.
Results are `PASSED_RTO_OBJECTIVE`, `EXCEEDED_RTO_OBJECTIVE`,
`NOT_REPRESENTATIVE` or `BLOCKED`; only the first exits zero. Missing prerequisites
record `not_run` cleanup/smoke, not fabricated successful checks.

The manual `Representative Replacement Drill` workflow is isolated from the
normal Quality Gate's heavy runtime. Configure its protected `dr-benchmark`
environment with the `DR_BENCHMARK_*` variable/secret names listed in the YAML,
using benchmark-only buckets/credentials and audited non-secret input paths.
It records the explicit SHA and uploads evidence with `always()`. Hosted-runner
results deliberately cannot close the VPS-provisioning P2; use the disposable
host procedure above for acceptance. The normal gate runs only the inexpensive
new contracts and retains its existing `Disposable Disaster Recovery runtime`.

Acceptance requires at least one independently audited company with approved
images, measured representative volume, provider provisioning included, both
real restores, real application smoke, cross-references, measured RPO/RTO,
`READY_FOR_CUTOVER`, and cleanup passed. Never change the objective merely to
pass, and do not retire **NO_GO** before BACKUP-PROD-012.
