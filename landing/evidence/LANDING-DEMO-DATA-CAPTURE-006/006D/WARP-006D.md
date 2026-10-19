# Back up the existing development database from Warp

Task 006D is blocked before database writes, not before database access. Run from
the repository root in Warp, where Docker already works. No new infrastructure,
schema changes, seeds, login or restore is performed by this block.

Only run against the owner's local, non-customer-shared development deployment.
The runtime checks below additionally require `NODE_ENV=development`, the expected
Compose database host/name, and matching backend/PostgreSQL cluster identities.
Development mode alone cannot establish whether a deployment is shared.

## Identity and local backup

This uses the same `pg_dump` custom format / no-owner / no-ACL and archive-list
checks as `scripts/database/backup-postgres-to-b2.sh`. The production wrapper is
intentionally not invoked: it requires remote storage credentials and uploads,
while this task needs a private local backup of the existing development service.

```bash
bash <<'BASH'
set -euo pipefail
umask 077
test -f docker-compose.yml
backup_dir=$(mktemp -d /tmp/landing-demo-006d-backup.XXXXXX)
printf 'PRIVATE_BACKUP_DIRECTORY=%s\n' "$backup_dir"

# Runtime environment is read inside the existing backend; no .env is printed.
# Explicit read-only transaction; no auth session is created.
docker compose -f docker-compose.yml exec -T backend node <<'NODE' > "$backup_dir/backend-identity.json"
const { PrismaClient } = require('@prisma/client');
(async () => {
  let prisma;
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (process.env.NODE_ENV !== 'development' || url.hostname !== 'postgres' ||
        (url.port || '5432') !== '5432' || url.pathname !== '/pollo_distribucion') {
      throw new Error('Unexpected development target');
    }
    prisma = new PrismaClient();
    const identity = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe("SELECT current_database() AS database, (SELECT system_identifier::text FROM pg_control_system()) AS cluster");
    });
    if (identity.length !== 1 || identity[0].database !== 'pollo_distribucion') {
      throw new Error('Unexpected database identity');
    }
    console.log(JSON.stringify({ nodeEnv: 'development', identity: identity[0] }));
  } catch (_) {
    console.error('BLOCKED_RUNTIME_IDENTITY; diagnostics withheld');
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
})();
NODE

docker compose -f docker-compose.yml exec -T postgres sh -eu -c '
  test "$POSTGRES_DB" = pollo_distribucion
  PGOPTIONS="-c default_transaction_read_only=on" psql --no-psqlrc \
    --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    --command="SELECT json_build_object('\''database'\'',current_database(),'\''cluster'\'',(SELECT system_identifier::text FROM pg_control_system()))"
' > "$backup_dir/postgres-identity.json"

python3 - "$backup_dir" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
backend = json.loads((p / 'backend-identity.json').read_text())
postgres = json.loads((p / 'postgres-identity.json').read_text())
if backend['nodeEnv'] != 'development' or backend['identity'] != postgres:
    raise SystemExit('BLOCKED_IDENTITY_MISMATCH')
print('ACTIVE_BACKEND_DATABASE_IDENTITY_MATCH')
PY

docker compose -f docker-compose.yml exec -T postgres sh -eu -c '
  test "$POSTGRES_DB" = pollo_distribucion
  pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --format=custom --compress=6 --no-owner --no-acl
' > "$backup_dir/postgres.dump"
test -s "$backup_dir/postgres.dump"
docker compose -f docker-compose.yml exec -T postgres \
  pg_restore --list < "$backup_dir/postgres.dump" > "$backup_dir/archive-list.txt"
# Read/decompress the archive without connecting to or restoring any database.
docker compose -f docker-compose.yml exec -T postgres \
  pg_restore --exit-on-error --file=/dev/null < "$backup_dir/postgres.dump"

python3 - "$backup_dir" <<'PY'
import datetime, hashlib, json, pathlib, sys
p = pathlib.Path(sys.argv[1])
dump = p / 'postgres.dump'
digest = hashlib.file_digest(dump.open('rb'), 'sha256').hexdigest()
report = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'database': 'pollo_distribucion', 'sizeBytes': dump.stat().st_size,
    'sha256': digest, 'runtimeIdentityMatch': True,
    'archiveList': 'PASS', 'archiveRead': 'PASS',
    'restoreDrill': 'NOT_RUN', 'databaseWrites': False,
}
(p / 'backup-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
PY
BASH
```

Any failure stops this block. Preserve the private directory, including partial
files; do not treat a partial dump or missing verification JSON as a verified
backup. No retry, deletion, restore or seed is included. Listing/reading an archive
is not an independent restore drill. Retain the verified backup outside the repo;
do not upload its contents, archive list, identities or any credentials to chat.

## Return and continue

Return only the sanitized `backup-verification.json` terminal output and confirm
that this is the owner's local development deployment, not shared with customers.
Do not run either seed. The next agent step is fresh runtime identity/backup
readback, then Inventory first: authenticate, inspect real location balances,
reconcile visible product/location rows against persisted data, and capture.
Reuse the existing catalog and operations only after checking their provenance;
add narrowly named `LANDING-006D` data through real services only when necessary.
Object storage currently reports unavailable, so commercial delivery PHOTO
evidence remains unverified and must not be fabricated.
