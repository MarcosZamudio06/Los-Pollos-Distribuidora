#!/usr/bin/env sh
set -eu

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

database_url_without_query=${RESTORE_DATABASE_URL%%\?*}
database_name=${database_url_without_query##*/}

case "$database_name" in
  *_restore_drill) ;;
  *)
    printf '%s\n' "Refusing to inspect a database not suffixed with _restore_drill." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "psql is required to verify a restored database." >&2
  exit 1
fi

psql "$RESTORE_DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
SELECT current_database() AS restore_database,
       pg_size_pretty(pg_database_size(current_database())) AS restored_size;

DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NULL THEN
    RAISE EXCEPTION 'Missing Prisma migration history';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Restored database contains an incomplete migration';
  END IF;

  IF to_regclass('public."Sale"') IS NULL
     OR to_regclass('public."InventoryMovement"') IS NULL
     OR to_regclass('public."Payment"') IS NULL
     OR to_regclass('public."CashMovement"') IS NULL THEN
    RAISE EXCEPTION 'Restored database is missing critical ERP/POS tables';
  END IF;
END $$;

SELECT 'Sale' AS relation, count(*) AS rows FROM "Sale"
UNION ALL
SELECT 'InventoryMovement', count(*) FROM "InventoryMovement"
UNION ALL
SELECT 'Payment', count(*) FROM "Payment"
UNION ALL
SELECT 'CashMovement', count(*) FROM "CashMovement";
SQL

printf '%s\n' "Restore verification passed for $database_name."
