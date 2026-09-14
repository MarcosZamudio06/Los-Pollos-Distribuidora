# Tenant deployment manifest

The tenant manifest is a non-secret inventory for independently hosted company
data planes. It is optional to the ERP build and runtime. The tenantctl
operator CLI consumes it outside the ERP application.

## Quick path

Use a protected operational workspace and a provider-owned secret resolver.
The checked-in example is safe test data, not a real deployment target.
Create the artifact parent directory on the deployment host first; it must be
outside the repository, and the final directory name must match the manifest
slug.

Set the deployment operator identity before invoking tenantctl. The optional
audit path must also be outside the repository and on a directory not writable
by other users.

~~~bash
export TENANTCTL_OPERATOR=operations-engineer
# Optional override; otherwise the log is $HOME/.tenantctl/audit.jsonl.
export TENANTCTL_AUDIT_LOG=/var/lib/tenantctl/audit.jsonl

scripts/multi-company/tenantctl validate \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-file /etc/tenantctl/company-north.env \
  --resolver /usr/local/libexec/company-secret-resolver

scripts/multi-company/tenantctl provision \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-file /etc/tenantctl/company-north.env \
  --resolver /usr/local/libexec/company-secret-resolver \
  --output-dir /etc/pollos/tenants/company-north \
  --dry-run

# Apply only after reviewing the plan.
scripts/multi-company/tenantctl provision \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-file /etc/tenantctl/company-north.env \
  --resolver /usr/local/libexec/company-secret-resolver \
  --output-dir /etc/pollos/tenants/company-north \
  --apply --reason CHG-4821 --confirm

# Inventory is read-only and does not resolve secrets.
scripts/multi-company/tenantctl list \
  --manifest docker/multi-company/tenant.example.json

# Batch status uses one external config per tenant, in manifest order.
scripts/multi-company/tenantctl status \
  --manifest docker/multi-company/tenant.example.json \
  --env-dir /etc/tenantctl/production \
  --resolver /usr/local/libexec/company-secret-resolver

# A production batch migration requires a successful canary first.
scripts/multi-company/tenantctl migrate \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-dir /etc/tenantctl/production \
  --resolver /usr/local/libexec/company-secret-resolver \
  --canary --apply --reason CHG-4821 --confirm

scripts/multi-company/tenantctl migrate \
  --manifest docker/multi-company/tenant.example.json \
  --env-dir /etc/tenantctl/production \
  --resolver /usr/local/libexec/company-secret-resolver \
  --apply --reason CHG-4821 --confirm

# Run backup and restore-drill on that company's deployment host.
scripts/multi-company/tenantctl backup \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-file /etc/tenantctl/company-north.env \
  --resolver /usr/local/libexec/company-secret-resolver \
  --apply --reason CHG-4821 --confirm

scripts/multi-company/tenantctl restore-drill \
  --manifest docker/multi-company/tenant.example.json \
  --company company-north \
  --env-file /etc/tenantctl/company-north.env \
  --resolver /usr/local/libexec/company-secret-resolver \
  --apply --reason CHG-4821 --confirm
~~~

`--operator` can be used instead of `TENANTCTL_OPERATOR`. It is an audit
identity, not an authentication mechanism; host/provider RBAC remains the
authorization boundary. Every tenant command appends a `started` and terminal
result record for each attempted tenant to the external JSONL log; tenants
skipped by selection or fail-fast receive a terminal `skipped` record. Each
record contains only the operator, tenant slug, command, timestamp, run ID,
target environment, result, duration, and optional ticket reference. The file
is created with mode 0600; an unavailable,
insecure, symlinked, or in-repository audit path blocks the command before any
tenant operation. Command output, resolver responses, environment values, and
credentials are never copied into the audit log.

Run `validate` before `provision`; provision repeats validation immediately
before any mutation. Its order is manifest/target/config and secret-reference
validation, Compose config validation, Caddy render/validation, a generated
Compose config check, immutable image pull, migration, bootstrap, service
start, readiness, and a smoke check through the frontend proxy. A failed
migration or bootstrap aborts before runtime services start. Generated
`.env.production` and `Caddyfile.production` are written only with
`provision --apply`; dry-run performs validation but creates no artifacts.

The artifact directory is created with mode 0700 and generated files with mode
0600. Existing generated artifacts are never silently replaced. To replace
them, review the prior values and pass `--replace-generated-config` together
with `provision --apply`; tenantctl first copies the previous generated files
to a private `.tenantctl-rollback-*` directory. Those copies contain the prior
non-secret configuration and should be retained until the deployment is
accepted.

tenantctl renders and validates the tenant Caddy file but does not install or
reload it. The current Caddy template only substitutes the example site hosts;
it does not yet replace the frontend image's baked Content-Security-Policy.
Do not route a second production domain to a reused frontend digest until the
MTE-003 edge-CSP contract is implemented and verified.

## Manifest contract

Each companies entry has these required fields:

| Field | Meaning | Validation |
| --- | --- | --- |
| slug | Stable deployment identifier; not an ERP tenant ID. | Lowercase DNS-safe slug, unique in the manifest. |
| displayName | Human-readable company label. | Non-empty, at most 120 characters, no control characters. |
| erpHost | Company ERP hostname. | DNS hostname only; no scheme, port, path, wildcard, or credentials. |
| objectStorageHost | Company public Object Storage hostname. | Same hostname rules; unique across ERP and Object Storage hosts. |
| environment | Deployment environment. | development, staging, or production. |
| deploymentHostRef | Opaque external host/target reference. | Non-empty, unique, reference-safe characters. |
| status | Operational lifecycle state. | planned, provisioning, active, suspended, or decommissioned. |
| backupBucket | Exclusive backup namespace for this tenant. | Lowercase bucket-safe name, unique in the manifest. |

secretRefs may contain only external locators under recognized purposes:
database, jwtAccess, jwtRefresh, objectStorage, backup, pac, csd, tls, and
bootstrapAdmin. Accepted schemes are vault://, docker-secret://, aws-sm://,
gcp-sm://, azure-kv://, and op://. The manifest validator rejects raw values,
unknown fields, and duplicate references. Never put passwords, JWT secrets,
B2 keys, PAC credentials, CSD, private keys, or access keys in the manifest.

## External deployment configuration

The --env-file is a materialized, non-secret Compose configuration supplied
by the deployment environment; it is not a copy of .env.production.example.
Keep it outside the repository and not group/world-writable. It uses one
unquoted KEY=VALUE per line, without shell expansion or duplicate keys. The
external config supplies host/context, immutable image, and map settings;
provision, backup, and restore-drill also require the backup endpoint and
region. Batch operations use
`<env-dir>/<tenant-slug>/.env.production` for each manifest entry. Tenantctl
derives the tenant-specific values below and rejects conflicting explicit
values.

| Key | Value or provision handling |
| --- | --- |
| TENANTCTL_DEPLOYMENT_HOST_REF | Exact deploymentHostRef from the selected manifest entry. |
| TENANTCTL_DOCKER_CONTEXT | Explicit existing Docker context resolved for that target. |
| BACKEND_IMAGE, FRONTEND_IMAGE | Approved release images pinned by @sha256 plus 64 hex digits. |
| PHOTON_IMAGE, OSRM_IMAGE, TILESERVER_IMAGE | Approved map images pinned by digest. |
| CORS_ORIGIN | Provision derives exactly https:// plus erpHost; other commands need the matching value. |
| OBJECT_STORAGE_PUBLIC_ENDPOINT | Provision derives exactly https:// plus objectStorageHost; other commands need the matching value. |
| OBJECT_STORAGE_PUBLIC_ORIGIN | Provision derives exactly https:// plus objectStorageHost for the existing frontend contract. |
| OBJECT_STORAGE_BUCKET, MAP_DATA_VERSION, TRUST_PROXY_HOPS | Company-local values required by production Compose. |
| MAP_DATA_DIR | Absolute company-local path on the selected Docker host. |
| BACKUP_S3_ENDPOINT, BACKUP_S3_REGION | HTTPS backup service origin and region; required for provision, backup, and restore-drill. |
| BACKUP_S3_BUCKET, BACKUP_S3_CREDENTIAL_REF | Derived from the selected tenant manifest for provision, backup, and restore-drill; explicit values must match, and bucket names are unique in that manifest. |
| POSTGRES_USER, POSTGRES_DB | Optional for provision; if supplied, must match the derived `postgres` user and tenant database name. |
| FACTURAMA_SECRET_FILE | Required only when CFDI is enabled; absolute private external file path, not a credential value. |

Other non-secret Compose settings may be supplied as needed. COMPOSE_*,
DOCKER_*, direct secret fields, DATABASE_URL, and variable interpolation are
rejected so ambient settings cannot silently redirect a deployment. The
secret-bearing Compose variables must come from the resolver, not this file.
For `provision`, tenantctl derives CORS_ORIGIN and Object Storage public host
values from the manifest; if provided explicitly, they must match. Other
commands require the exact values expected by their existing Compose contract.

## Secret resolver protocol

tenantctl does not embed Vault/AWS/GCP/Azure/1Password credentials or a
provider SDK. It calls the explicitly supplied absolute resolver executable
with the fixed argument resolve, no shell, and a JSON request on stdin:

~~~json
{
  "protocolVersion": 1,
  "command": "provision",
  "company": {
    "slug": "company-north",
    "environment": "production",
    "deploymentHostRef": "host://production/company-north"
  },
  "secretRefs": {
    "database": "vault://production/company-north/database-password",
    "jwtAccess": "vault://production/company-north/jwt-access",
    "jwtRefresh": "vault://production/company-north/jwt-refresh",
    "objectStorage": "vault://production/company-north/object-storage",
    "bootstrapAdmin": "vault://production/company-north/bootstrap-admin"
  }
}
~~~

For `backup` and `restore-drill`, the request uses that command and includes
`secretRefs.backup` from the selected company manifest. The response then
includes the `backup` credential object; it must not be copied into an env file.

The database reference resolves to the PostgreSQL password, not a connection
URL; tenantctl derives `POSTGRES_DB` from the stable slug and the current
Compose file constructs its internal URL. The resolver returns only the
requested values as JSON on stdout, with
protocolVersion 1 and a secrets object. database, jwtAccess, jwtRefresh, and
bootstrapAdmin are strings. objectStorage and backup contain accessKeyId and
secretAccessKey. backup is requested only by backup and restore-drill. For
example, the resolver response for a backup operation is:

~~~json
{
  "protocolVersion": 1,
  "secrets": {
    "database": "<resolved-value>",
    "jwtAccess": "<resolved-value>",
    "jwtRefresh": "<resolved-value>",
    "objectStorage": {
      "accessKeyId": "<resolved-value>",
      "secretAccessKey": "<resolved-value>"
    },
    "backup": {
      "accessKeyId": "<resolved-value>",
      "secretAccessKey": "<resolved-value>"
    }
  }
}
~~~

The resolver executable and its provider identity are trusted operator
configuration. Its stdout/stderr and all Compose and backup-script output are
captured and suppressed; secret values are held only in memory and passed to
Compose or the existing backup script through the child process environment.
They are not added to argv, a generated file, logs, or Git. Base references are
required for validate/status/migrate; bootstrapAdmin is additionally required
for bootstrap/provision; backup is additionally required for backup and
restore-drill. Resolved values must be distinct within one tenant, and manifest
secret references plus backup buckets are unique across tenants. The secret
manager/resolver must ensure that different references never alias the same
cross-tenant credential value; tenantctl cannot compare secret material held by
separate providers or hosts.

For provisioning, tenantctl derives the tenant database name, Compose project,
ERP/CORS and Object Storage host values, backup bucket/reference/project/local
directory, and PAC/CSD references from the manifest. The generated environment
does not contain `DATABASE_URL` or resolved passwords, JWT values, Object
Storage keys, bootstrap passwords, PAC contents, or CSD material. Backup
endpoint/region and company-local map/image settings remain in the external
non-secret config. Backup and restore-drill resolve the external backup
credential reference only for the duration of the existing script invocation;
the resolved keys are not written to generated configuration.

PAC is optional. When `CFDI_ENABLED=true`, the manifest PAC reference must use
`docker-secret://<name>` and the external config must point
`FACTURAMA_SECRET_FILE` to an absolute, private, non-symlink regular file
outside the repository. The optional Compose overlay mounts that file read-only
at `/run/secrets/<name>`; tenantctl never reads or prints its contents. Leave
CFDI disabled when that tenant-scoped secret is not provisioned.

`CSD_CREDENTIAL_REF` is recorded as an external reference only. The current
runtime has no CSD private-key resolver, so this reference does not mount or
activate a CSD credential. Do not put certificate/key bytes in any env file;
enabling a CSD-consuming flow requires a separate runtime design.

Run tenantctl on the dedicated company deployment host, or ensure every bind
mount source exists at the same path on the selected Docker daemon. The CLI
checks that the external target reference matches the manifest and selects an
explicit Docker context, but it cannot prove that two contexts terminate on
different hosts/accounts. Production isolation and target-to-context ownership
remain responsibilities of external host/IAM administration. The current
production Compose also binds Object Storage to loopback port 8333, so do not
provision multiple production companies on one Docker daemon.

## Command safety

| Command | Effect |
| --- | --- |
| list | Emits a safe manifest inventory; it does not resolve credentials or contact deployments. |
| validate | Validates the full manifest, resolves required refs, renders production Compose configuration, and checks every image digest. |
| provision | Writes tenant-local non-secret env/Caddy artifacts, pulls immutable images, migrates, bootstraps, starts, waits on healthchecks, and runs the frontend-proxy smoke check. |
| migrate --company <slug> | Runs the existing one-shot migration service for one selected tenant using its backend image digest. |
| migrate --canary --company <production-slug> | Runs migration for one active production tenant and records private canary evidence tied to its tenant identity and image digests. |
| migrate (batch) | Requires a successful matching canary; preflights all active production tenants, checks the same release digest set, then migrates sequentially in manifest order. The canary tenant is not migrated twice. |
| bootstrap | Runs migration first, then the existing production bootstrap service. It does not rotate the admin password. |
| status | Reads only Docker Compose service state and health; it does not query ERP tables. Batch status selects active tenants. |
| backup | Runs the existing PostgreSQL-to-B2 script with the selected tenant database, unique bucket, and local result directory. |
| restore-drill | Runs the existing guarded PostgreSQL restore script into a unique temporary `_restore_drill` database; the script verifies and removes that target. |

Sensitive commands (`provision`, `migrate`, `backup`, `restore-drill`, and
`bootstrap`) require `--apply --reason <ticket-id> --confirm` to execute.
The ticket reference is restricted to an identifier such as `CHG-4821`; do not
put free-form text or secret material in it. `--dry-run` resolves and validates
applicable configuration and prints the plan without tenant mutations; it does
not require `--reason` or `--confirm`.
provision also validates its rendered Caddy config without writing it. Batch
status, migration, backup, and restore-drill process tenants in manifest order
and emit one JSON result per selected tenant, each containing a shared UUID
`runId`, tenant slug,
derived database name, status, duration, and safe error code. They stop after
the first failed/timed-out tenant by default;
`--continue-on-error` is an explicit batch-only opt-in. `--timeout-seconds`
sets each tenant's timeout independently (default 1800; maximum 86400).
`list` emits the same structured correlation envelope without contacting the
resolver or Docker.

`migrate --canary` requires one selected active production tenant and
`--env-dir`; successful evidence is stored under that external directory with
private permissions. A production migration batch (no `--company`) is blocked
unless that receipt still matches the manifest target and every active
production tenant has the same immutable Compose image digest set. A failed
canary prevents the batch from changing any other tenant. Batch migrations
are sequential, not parallel. Separate tenantctl processes are not coordinated
by a distributed lock; production CI/host automation must serialize migrations
per tenant deployment target. Database passwords must use URL-safe characters
because the current Compose file embeds POSTGRES_PASSWORD in its internal
database URL without encoding.

The existing PostgreSQL backup scripts use host filesystem paths and Docker
bind mounts. Run backup/restore-drill on the tenant deployment host with a
Docker context whose paths are available to both the script and daemon; do not
assume a remote context can access the operator machine's files. Tenantctl
isolates local paths by slug and S3 buckets by manifest, but cannot prove that
a remote bind mount is shared correctly. These commands back up PostgreSQL
only, not Object Storage, and therefore do not create a complete company
recovery set.

## Rollback

`tenantctl` does not automatically roll back a failed migration, bootstrap,
startup, or smoke check. A failed tenant in a migration batch is reported as
failed and later tenants are skipped unless `--continue-on-error` was explicit;
already successful tenants are not migrated down or otherwise rolled back.
It deliberately leaves every tenant Compose project and its volumes intact
and never runs `down -v`; this avoids silently destroying a company database
or Object Storage volume. Keep ERP/Object Storage DNS and Caddy routing on the
previous healthy target until provisioning and the smoke check pass.

1. **Failure before start:** a failed preflight prevents mutation. A failed
   image pull, migration, or bootstrap stops the sequence immediately. Preserve
   tenant volumes and inspect protected host logs. Do not rerun bootstrap with
   a different identity/password or reverse a Prisma migration automatically.
2. **Failure after start:** leave public routing on the previous target. If
   containment is needed, stop only this tenant's Compose project using its
   explicit Docker context/project and generated environment; do not remove
   volumes. Correct the cause, rerun dry-run, then apply after review.
3. **Configuration/routing rollback:** restore the prior `.env.production` and
   `Caddyfile.production` from the matching `.tenantctl-rollback-*` directory
   (or protected config revision), install the Caddy file into that host's
   service-readable configuration path, run `caddy validate`, and reload only
   this tenant's Caddy instance. Restore the prior DNS target if it changed.
   Generated Caddy files are not automatically installed or reloaded by
   tenantctl. Restore the prior secret-reference version too; the referenced
   secret-manager version must remain available to the tenant resolver. Never
   recover by copying raw credentials into the env file.
4. **Application rollback:** restore this tenant's prior approved external
   config revision and the matching `.env.production` snapshot, including only
   its previous immutable image digests. Verify the external config with
   `tenantctl validate`, then run the existing Compose `up -d --no-build
   --pull never` operation for this tenant project. Do not invoke `provision`
   for a digest-only rollback because provision also runs migration and
   bootstrap. The prior image is safe only if compatible with the database's
   current migration state. After explicit operator approval, the existing
   Compose operation has this shape (add the CFDI overlay only if that tenant
   enables CFDI):

   ~~~bash
   docker --context <tenant-docker-context> compose \
     --project-name tenantctl-company-north \
     --project-directory <repository-checkout> \
     --env-file /etc/pollos/tenants/company-north/.env.production \
     --file <repository-checkout>/docker-compose.production.yml \
     up -d --no-build --pull never
   ~~~

   Use the matching tenant slug, context, output path, and approved previous
   digests; never run this against another tenant's project or host.
5. **Data rollback:** never downgrade Prisma migrations. Restore a matching
   company recovery set into a new isolated target, verify company identity,
   checksums, schema status, PostgreSQL/PostGIS, and Object Storage, then switch
   only that company's routing. Existing backup scripts cover PostgreSQL only;
   until the paired recovery-set workflow in MTE-005 exists and is rehearsed, a
   complete production data rollback is **not available**. A PostgreSQL dump is
   not a complete company recovery point.
6. **First-time disposable tenant:** removing containers/volumes is a
   destructive operator action and requires explicit approval plus proof that
   no company data must be retained. `tenantctl` intentionally has no cleanup
   command.

## Scope boundary

- No tenantId or companyId is introduced into Prisma or the ERP domain.
- The CLI uses only docker-compose.production.yml and its existing migration,
  bootstrap, and healthcheck contracts; it has no direct SQL/table access.
- No backend/frontend runtime code or existing business service is required to
  read the manifest.
- The manifest and CLI are operational tooling, not ERP compile inputs.
