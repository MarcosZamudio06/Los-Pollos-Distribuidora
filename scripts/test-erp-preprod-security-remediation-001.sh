#!/usr/bin/env bash
# Own disposable resources only; never reads a workstation dotenv or caller DB URL.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
run="erp-sec001-$(date +%s)-$$"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-sec001.XXXXXX")"
evidence="${SECURITY_EVIDENCE_DIR:-$scratch/evidence}"
mkdir -p "$evidence"
docker_bin="${DOCKER_BIN:-docker}"
pg="$run-pg"; s3="$run-s3"
cleanup() { "$docker_bin" stop "$pg" "$s3" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export NODE_ENV=test CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export JWT_ACCESS_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d
export AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800 AUTH_SESSION_IDLE_TTL_SECONDS=86400 AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS=300
export OBJECT_STORAGE_ACCESS_KEY_ID=security-disposable OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_BUCKET=security-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
export SECURITY_REPOSITORY_ROOT="$repo"
"$docker_bin" version --format '{{.Server.Version}}' > "$evidence/docker-version.txt"
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-preprod-security-remediation-001 --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_USER=sectest -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=security_remediation \
  -p 127.0.0.1::5432 postgis/postgis:16-3.5 > "$evidence/pg-container.txt"
"$docker_bin" run --rm -d --name "$s3" --label task=erp-preprod-security-remediation-001 --tmpfs /data:rw \
  -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data > "$evidence/s3-container.txt"
for n in $(seq 1 60); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U sectest -d security_remediation >/dev/null; then break; fi
  sleep 1
done
pg_port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
s3_port="$("$docker_bin" port "$s3" 9000/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://sectest:$password@127.0.0.1:$pg_port/security_remediation"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$s3_port" OBJECT_STORAGE_PUBLIC_ENDPOINT="http://127.0.0.1:$s3_port"
# Explicit safe suffixes: no node_modules, build outputs, dotenv, keys or credential files.
python3 - "$repo" "$scratch" <<'PY'
from pathlib import Path
import shutil,sys,os,subprocess
source,target=map(Path,sys.argv[1:])
for base in ('backend/src','backend/test','backend/scripts','backend/prisma','shared'):
 for p in (source/base).rglob('*'):
  if p.is_file() and not any(x in p.parts for x in ('node_modules','dist','.git','coverage','secrets','.credentials','.aws','.ssh')) and not p.name.startswith('.env') and p.name != 'credentials.json' and p.suffix in ('.ts','.json','.prisma','.sql','.toml','.cjs'):
   q=target/p.relative_to(source);q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q)
for package in ('backend','frontend'):
 (target/package).mkdir(parents=True,exist_ok=True)
 for name in ('package.json','package-lock.json','tsconfig.json','tsconfig.build.json'):
  p=source/package/name
  if p.exists():shutil.copyfile(p,target/package/name)
# Optional immutable RED source: never changes worktree/index; tests stay current.
baseline=os.environ.get('SECURITY_BASELINE_REF')
if baseline:
 for p in (target/'backend/src').rglob('*.ts'):
  rel=p.relative_to(target).as_posix()
  result=subprocess.run(['git','-C',str(source),'show',f'{baseline}:{rel}'],capture_output=True)
  if result.returncode==0:p.write_bytes(result.stdout)
  elif not rel.endswith('.spec.ts'):p.unlink() # Only our disposable copy, never source.
PY
(cd "$scratch/backend" && npm --script-shell=/bin/sh ci --workspaces=false --ignore-scripts --no-audit --no-fund) > "$evidence/backend-install.log" 2>&1
(cd "$scratch/frontend" && npm --script-shell=/bin/sh ci --workspaces=false --ignore-scripts --no-audit --no-fund) > "$evidence/frontend-install.log" 2>&1
cd "$scratch/backend"
npm --script-shell=/bin/sh exec -- prisma generate --schema prisma/schema.prisma > "$evidence/prisma-generate.log" 2>&1
npm --script-shell=/bin/sh exec -- prisma migrate deploy --schema prisma/schema.prisma > "$evidence/migrations.log" 2>&1
set +e
npm --script-shell=/bin/sh run test:e2e -- --runInBand --runTestsByPath test/security-remediation.e2e-spec.ts "$@" > "$evidence/security-e2e.log" 2>&1
code=$?
set -e
printf 'test_exit=%s\n' "$code" | tee "$evidence/result.txt"
tail -35 "$evidence/security-e2e.log"
printf 'Evidence: %s\nScratch: %s\n' "$evidence" "$scratch"
exit "$code"
