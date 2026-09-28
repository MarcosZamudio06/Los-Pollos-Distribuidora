#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/dr-key-check.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
export COMPANY_SLUG=company-north
export BACKUP_POSTGRES_DATABASE=company_north
export RESTORE_PRODUCTION_DATABASE_NAME=company_north
export RESTORE_DATABASE_NAME=company_north_restore_drill
export BACKUP_S3_ENDPOINT=https://s3.example.test
export BACKUP_S3_REGION=us-east-1 BACKUP_S3_BUCKET=dr-example-bucket
export BACKUP_S3_ACCESS_KEY_ID=fixture-access BACKUP_S3_SECRET_ACCESS_KEY=fixture-secret
export BACKUP_COMPOSE_FILE="$work/nonexistent-compose.yml"
export RESTORE_BACKUP_KEY=postgres/company-north/2026/09/2026-09-27T12-00-00Z-123-456.dump

if bash "$SCRIPT_DIR/restore-postgres-from-b2.sh" 2>"$work/accepted.err"; then
  echo 'Restore preflight unexpectedly reached an executable target.' >&2
  exit 1
fi
grep -Fq 'Compose file not found' "$work/accepted.err" || {
  echo 'Company-scoped dump key was rejected before the safe Compose preflight.' >&2
  exit 1
}
if COMPANY_SLUG=company-south bash "$SCRIPT_DIR/restore-postgres-from-b2.sh" \
  2>"$work/rejected.err"; then
  echo 'Another company accepted the scoped dump key.' >&2
  exit 1
fi
grep -Fq 'not a valid company-scoped PostgreSQL backup key' "$work/rejected.err" || {
  echo 'Company mismatch did not fail at key validation.' >&2
  exit 1
}
echo 'PASS: scoped PostgreSQL key accepted only for the selected company'
