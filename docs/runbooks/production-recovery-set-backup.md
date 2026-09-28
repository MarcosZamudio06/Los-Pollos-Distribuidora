# Production recovery-set backup

Production automation now creates a complete PostgreSQL/PostGIS plus Object
Storage recovery set. The retired PostgreSQL-only timer is not a recovery
signal; the monitor reports protection only when every configured production
company has a recent validated recovery set.

The coordinator applies manifest-aware retention only after the new remote
recovery set and both component manifests have passed verification. The
PostgreSQL component's standalone retention stays disabled while the paired
recovery-set policy owns the lifecycle.

Use [Multi-company backup and Disaster Recovery](multi-company-backup-restore.md)
for company-scoped manual runs, restore drills, B2 evidence, failure recovery,
and the incident-gated replacement-host procedure. The restore scripts remain
disposable-target-only; this page does not authorize an in-place production
restore.

## Recovery-set retention

`BACKUP_RETENTION_DAILY`, `BACKUP_RETENTION_WEEKLY`, and
`BACKUP_RETENTION_MONTHLY` default to `14`, `8`, and `6`. They retain the newest
recovery set in each of the newest configured UTC calendar-day, ISO-week, and
calendar-month groups; the newest valid set is retained even when all three
values are zero. Retention is selected per company, not per component file.

Before deleting anything, the coordinator verifies every recognized recovery
set manifest in the configured backup bucket and its PostgreSQL/Object Storage
component manifests. Invalid or missing manifests stop retention without
deletion. It removes a component only when no recovery set left in the bucket
references it. New PostgreSQL component keys are company-scoped; old
unscoped PostgreSQL components are deleted only when the bucket-wide manifest
scan proves no company still references them. Unknown keys are ignored.

The S3 application key therefore needs list, read, write, and delete access to
the configured backup bucket. `BACKUP_FAILED_KEEP_COUNT` (default `1`) also
bounds the local failed PostgreSQL/Object Storage evidence; each retained
Object Storage failure includes a non-secret stage/timestamp record and, when
available, its failed archive.

## Quick installation

1. If the legacy PostgreSQL-only timer was installed, stop and remove it before
   enabling the new timer:

   ```bash
   sudo systemctl disable --now pollos-distribuidor-postgres-backup.timer
   sudo systemctl stop pollos-distribuidor-postgres-backup.service
   sudo rm -f /etc/systemd/system/pollos-distribuidor-postgres-backup.timer \
     /etc/systemd/system/pollos-distribuidor-postgres-backup.service
   sudo systemctl daemon-reload
   ```

2. Install the root-managed environment files described below. Files containing
   credentials must be owned by `root:root`, mode `0600`, and kept outside Git.

   ```bash
   sudo chown root:root /etc/pollos-distribuidor/production.env \
     /etc/pollos-distribuidor/recovery-set-backup.env
   sudo chmod 600 /etc/pollos-distribuidor/production.env \
     /etc/pollos-distribuidor/recovery-set-backup.env
   ```

   In single-company mode, apply the same owner/mode to
   `/etc/pollos-distribuidor/postgres-backup.env` because it contains the B2
   application key.
3. Install and enable the complete recovery-set units:

   ```bash
   sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.service \
     /etc/systemd/system/pollos-distribuidor-recovery-set-backup.service
   sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.timer \
     /etc/systemd/system/pollos-distribuidor-recovery-set-backup.timer
   sudo systemctl daemon-reload
   sudo systemctl enable --now pollos-distribuidor-recovery-set-backup.timer
   ```

4. Run one initial scheduled-path execution and check both units:

   ```bash
   sudo systemctl start pollos-distribuidor-recovery-set-backup.service
   sudo systemctl status pollos-distribuidor-recovery-set-backup.timer
   sudo systemctl status pollos-distribuidor-recovery-set-backup.service
   sudo systemctl list-timers pollos-distribuidor-recovery-set-backup.timer
   ```

Do not leave both timer units enabled. The old PostgreSQL component script is
still used inside the coordinated recovery-set operation; it is no longer
installed as an independent scheduled job.

## Runtime configuration

The service runs as root because it must control Docker Compose and write to
private host backup directories. It loads these systemd environment files;
`production.env` and `recovery-set-backup.env` are required, while the B2 file
is optional in multi-company mode:

| File | Contents | Required permissions |
| --- | --- | --- |
| `/etc/pollos-distribuidor/production.env` | Existing Compose runtime settings and single-company database/Object Storage secrets. | `root:root`, `0600` |
| `/etc/pollos-distribuidor/postgres-backup.env` | B2 endpoint, bucket and credentials for single-company backups; optional in multi-company mode, which resolves backup secrets per tenant. | `root:root`, `0600` if present |
| `/etc/pollos-distribuidor/recovery-set-backup.env` | Mode, private paths and multi-company automation settings below. | `root:root`, `0600` |

The unit expects the repository at `/opt/pollos-distribuidor`. Create the
recovery-specific file outside the checkout; do not copy actual secrets into
`.env.production.example`, the company manifest, systemd unit files, logs, or
container images.

The host needs Docker Engine with the Compose v2 plugin, Bash, `flock`, Node.js,
Python 3, network access to B2, and the pinned AWS CLI image available to
Docker. The dispatcher reports missing host tools before taking the recovery
lock; no cron or dependency is added to the backend image.

### Single-company deployment

Set `COMPANY_SLUG` in `production.env` to the stable, lowercase company slug.
Use these non-secret settings in `recovery-set-backup.env`:

```dotenv
RECOVERY_BACKUP_MODE=single-company
BACKUP_COMPOSE_FILE=/opt/pollos-distribuidor/docker-compose.production.yml
BACKUP_COMPOSE_ENV_FILE=/etc/pollos-distribuidor/production.env
BACKUP_COMPOSE_PROJECT_NAME=pollos-distribuidor
BACKUP_LOCAL_DIR=/var/lib/pollos-distribuidor/postgres-backups
RECOVERY_BACKUP_LOCK_FILE=/run/lock/pollos-distribuidor-recovery-set-backup.lock
```

The dispatcher maps the existing `POSTGRES_*` values to the recovery scripts,
then runs `create-company-recovery-set.sh`. That script takes the company-local
write barrier, verifies and uploads both components, resumes the backend to its
prior state, and publishes the recovery-set manifest only after validation.

### Multi-company deployment

Use one production company manifest, one deployment configuration directory,
and the existing executable secret resolver on each tenant's deployment host.
Recovery scripts need host-local Docker bind-mount paths, so a systemd instance
must not back up companies on remote Docker contexts. Set the local deployment
host reference explicitly. Put credentials required by the resolver in
root-only configuration (not in the manifest or tenant `.env.production`
files). Use these settings in `recovery-set-backup.env`:

```dotenv
RECOVERY_BACKUP_MODE=multi-company
TENANTCTL_MANIFEST_PATH=/etc/pollos-distribuidor/companies.json
TENANTCTL_LOCAL_DEPLOYMENT_HOST_REF=host://production/company-north
TENANTCTL_ENV_DIR=/etc/pollos-distribuidor/tenants
TENANTCTL_RESOLVER_PATH=/usr/local/libexec/pollos-secret-resolver
TENANTCTL_OPERATOR=pollos-systemd-recovery
TENANTCTL_BACKUP_APPROVAL_REF=<approved-ops-reference>
TENANTCTL_AUDIT_LOG=/var/log/pollos-distribuidor/recovery-backup-audit.jsonl
TENANTCTL_BACKUP_TIMEOUT_SECONDS=1800
RECOVERY_BACKUP_LOCK_FILE=/run/lock/pollos-distribuidor-recovery-set-backup.lock
```

Replace the placeholder with the approved standing operational/change reference;
tenantctl requires it for its auditable `backup --apply` operation. Keep the
manifest non-secret and tenant-specific Compose files outside the repository,
root-owned and non-group/world-writable. The dispatcher validates the manifest,
then invokes tenantctl only for the active production company whose
`deploymentHostRef` exactly matches this VPS. The manifest contract requires
deployment host references to be unique. The invocation is company-bound; the
service fails closed if no local company matches, preventing a host from
treating a remote Docker context as a local recovery target.

The `MONITOR_RECOVERY_SET_MODE` value in the monitor environment must also be
`multi-company`, `MONITOR_TENANT_MANIFEST_PATH` must point to the same
non-secret company inventory, and `MONITOR_LOCAL_DEPLOYMENT_HOST_REF` must
identify this VPS. The monitor checks the matching active production company.
Central monitoring should aggregate those per-host reports; this local monitor
does not claim coverage for remote deployment hosts. It does not treat a
PostgreSQL-only result or a recovery set for another company as complete.

## Scheduling and RPO

The timer is persistent and runs at 00:00 and 12:00 UTC
with at most 30 minutes of randomized delay and one minute of timer accuracy.
The service has an eight-hour hard start/runtime limit. Therefore the maximum
age of the previous `write_barrier_at` while the next complete set is being
validated is 12 hours + 31 minutes + 8 hours = 20 hours 31 minutes, below the
default `BACKUP_RPO_HOURS=24` with 3 hours 29 minutes of margin. The monitor
measures RPO age from that write barrier, warns at 21 hours, and becomes
critical at 24 hours. The dispatcher refuses an RPO below the unit's 21-hour minimum; a
smaller RPO requires a reviewed shorter timer interval and a matching service
runtime bound, verified together by the contract test.

This is a measurable scheduling envelope, not a guarantee during a VPS outage,
B2 outage, repeated backup failure, or a restore incident. `Persistent=true`
causes a missed calendar run to be attempted after the host returns; it cannot
back up data while the host is unavailable. Measure actual per-company and
whole-batch durations, keep them below the service timeout, and treat any
failed/late result as an RPO breach until the next validated recovery set.
`BACKUP_RTO_MINUTES` remains a separate restore target and must be verified by
disposable restore drills; the timer does not prove an RTO.

`BACKUP_RPO_HOURS` is also the monitor's maximum recovery-set age, so the
monitoring threshold cannot silently remain at a stale, independent 24-hour
value. If the configured RPO changes, keep the timer interval, service timeout,
minimum-RPO guard, monitor environment, and contract tests aligned.

## Status, logs, and failure recovery

```bash
sudo systemctl status pollos-distribuidor-recovery-set-backup.service
sudo systemctl status pollos-distribuidor-recovery-set-backup.timer
sudo journalctl -u pollos-distribuidor-recovery-set-backup.service -n 200 --no-pager
sudo journalctl -u pollos-distribuidor-recovery-set-backup.service --since today --no-pager
```

The recovery scripts leave non-secret per-company JSON results under
`/var/lib/pollos-distribuidor/<company>/postgres-backups/company-recovery/`
for multi-company deployments, or under
`/var/lib/pollos-distribuidor/postgres-backups/results/company-recovery/` for a
single company. Confirm the newest result is `validated`, both component
statuses are `validated`, the recovery point uses `backend-quiesce`, and the
recovery-set key has the same company slug. Check the monitor report at
`MONITOR_STATE_FILE` and alert webhook for `BACKUP_FAILED`, `BACKUP_MISSING`, or
`BACKUP_STALE`.

After a failure, inspect the service journal and that company's result JSON,
verify PostgreSQL/Object Storage and backend health, correct the cause, then
rerun only the complete service:

```bash
sudo systemctl start pollos-distribuidor-recovery-set-backup.service
```

Do not assemble a recovery point from standalone PostgreSQL/Object Storage
objects. Component objects uploaded before a failure are uncommitted evidence,
not a validated set. The coordinator's cleanup restores a backend it stopped
on ordinary errors and catchable signals. After host power loss or an
uncatchable kill, verify backend health before accepting another recovery set;
systemd cannot run shell cleanup while the host is down.

For restore drills, use only disposable database and Object Storage targets
documented in [the multi-company restore runbook](multi-company-backup-restore.md).
The real restore path is an incident procedure and must never target production
during a drill.
