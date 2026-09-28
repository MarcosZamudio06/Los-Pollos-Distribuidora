import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("company restore verifies identity and every artifact before creating disposable targets", () => {
  const restore = read("scripts/database/restore-company-recovery-set.sh");
  const identity = restore.indexOf("verify-identity");
  const firstComponentDownload = restore.indexOf(
    '"s3://$BACKUP_S3_BUCKET/$postgres_manifest_key"',
  );
  const fullVerification = restore.indexOf(
    '--postgres-manifest "$postgres_manifest"',
  );
  const postgresMutation = restore.indexOf(
    'bash "$SCRIPT_DIR/restore-postgres-from-b2.sh"',
  );
  const objectMutation = restore.indexOf(
    'bash "$SCRIPT_DIR/restore-object-storage-from-b2.sh"',
  );

  assert.ok(identity >= 0);
  assert.ok(firstComponentDownload > identity);
  assert.ok(fullVerification > firstComponentDownload);
  assert.ok(postgresMutation > fullVerification);
  assert.ok(objectMutation > postgresMutation);
  assert.match(restore, /RESTORE_DATABASE_NAME.*_restore_drill/u);
  assert.match(restore, /RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE=true/u);
  assert.doesNotMatch(
    restore,
    /RESTORE_MIN_FREE_BYTES=\$\{RESTORE_MIN_FREE_BYTES:-1048576\}/u,
  );
  assert.match(restore, /restore_status=failed/u);
  assert.ok(restore.includes("if (( result_written == 0 ));"));
  assert.ok(restore.includes("if ! write_rehearsal_result; then"));
  assert.match(restore, /"failure_stage"/u);
});

test("object restore accepts only regular files and directories from a verified archive", () => {
  const restore = read("scripts/database/restore-object-storage-from-b2.sh");
  assert.match(restore, /member\.issym\(\)\s*or\s*member\.islnk\(\)/u);
  assert.match(restore, /member\.isdir\(\)\s*or\s*member\.isfile\(\)/u);
  assert.match(
    restore,
    /checksum_file=\$\{RESTORE_OBJECT_STORAGE_CHECKSUM_FILE:-\$work_dir\/object-manifest\.sha256\}/u,
  );
});

test("cross-checks actual restored rows against the disposable Object Storage bucket", () => {
  const schema = read("backend/prisma/schema.prisma");
  const restore = read("scripts/database/restore-object-storage-from-b2.sh");
  const companyRestore = read("scripts/database/restore-company-recovery-set.sh");
  const verifier = read("scripts/database/recovery-storage-reference-verifier.mjs");

  assert.match(schema, /model CompanyBranding \{[\s\S]*?logoObjectKey\s+String\?[\s\S]*?logoMimeType\s+String\?/u);
  assert.match(schema, /model DeliveryEvidence \{[\s\S]*?storageKey\s+String\?[\s\S]*?mimeType\s+String\?[\s\S]*?sha256\s+String\?[\s\S]*?sizeBytes\s+Int\?/u);
  assert.match(schema, /model FiscalArtifact \{[\s\S]*?status\s+FiscalArtifactStatus[\s\S]*?storageKey\s+String[\s\S]*?mimeType\s+String[\s\S]*?byteSize\s+BigInt\?[\s\S]*?sha256\s+String\?/u);
  assert.match(restore, /FROM "DeliveryEvidence"[\s\S]*?"storageKey" IS NOT NULL/u);
  assert.match(restore, /FROM "FiscalArtifact"[\s\S]*?"status" = 'AVAILABLE'/u);
  assert.match(restore, /FROM "CompanyBranding"[\s\S]*?"logoObjectKey" IS NOT NULL/u);
  assert.match(restore, /'logoMimeType', "logoMimeType"/u);
  assert.match(restore, /'sizeBytes', "sizeBytes"/u);
  assert.match(restore, /'byteSize', "byteSize"::text/u);

  const archiveDiff = restore.indexOf("diff -r -- \"$work_dir/data\" \"$work_dir/verify\"");
  const databaseQuery = restore.indexOf('FROM "DeliveryEvidence"');
  const verifierRun = restore.indexOf('recovery-storage-reference-verifier.mjs" verify');
  assert.ok(archiveDiff >= 0 && databaseQuery > archiveDiff && verifierRun > databaseQuery);
  assert.match(restore, /--bucket "\$RESTORE_OBJECT_STORAGE_TARGET_BUCKET"/u);
  assert.match(restore, /--dbname="\$RESTORE_DATABASE_NAME"/u);
  assert.match(restore, /RESTORE_DATABASE_NAME.*_restore_drill/u);
  assert.match(restore, /RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE.*true/u);
  assert.match(verifier, /EXPECTED_SHA256_MISMATCH/u);
  assert.match(verifier, /EXPECTED_SIZE_MISMATCH/u);
  assert.match(verifier, /MIME_TYPE_MISMATCH/u);
  assert.match(restore, /--entrypoint \/bin\/sh/u);

  assert.match(companyRestore, /RESTORE_DEFER_TARGET_CLEANUP=true/u);
  assert.match(companyRestore, /RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK=true/u);
  assert.match(companyRestore, /reference_checks\.get\("delivery_evidence"/u);
  assert.match(companyRestore, /reference_checks\.get\("fiscal_artifacts"/u);
  assert.match(companyRestore, /reference_checks\.get\("company_branding"/u);
  assert.match(companyRestore, /"storage_reference_failure_codes": reference_result\.get\("failure_codes", \[\]\)/u);
  assert.doesNotMatch(companyRestore, /"checks":\s*\[/u);

  const workflow = read(".github/workflows/quality-gate.yml");
  assert.ok(workflow.includes("scripts/database/recovery-storage-reference-verifier.test.mjs"));
});

test("PostgreSQL drill can defer disposable database cleanup only for parent cross-validation", () => {
  const restore = read("scripts/database/restore-postgres-from-b2.sh");

  assert.match(restore, /RESTORE_DEFER_TARGET_CLEANUP=\$\{RESTORE_DEFER_TARGET_CLEANUP:-false\}/u);
  assert.match(restore, /RESTORE_TARGET_CREATED_MARKER_FILE is required/u);
  assert.match(restore, /RESTORE_DATABASE_NAME.*_restore_drill/u);
  assert.match(restore, /target_created=0[\s\S]*parent full-set drill owns final cleanup/u);
  assert.match(restore, /postgres\/\$COMPANY_SLUG\//u,
    "the drill must accept company-scoped backup keys created by the recovery-set coordinator");
});

test("the mandatory CI gate executes the real disposable disaster-recovery harness", () => {
  const workflow = read(".github/workflows/quality-gate.yml");
  const harness = read("scripts/database/test-disaster-recovery-runtime.sh");
  assert.match(workflow, /needs: \[[^\]]*disaster-recovery\]/u);
  assert.match(workflow, /bash scripts\/database\/test-disaster-recovery-runtime\.sh/u);
  assert.match(workflow, /systemd-analyze verify/u);
  for (const required of [
    "prisma migrate deploy",
    "create-company-recovery-set.sh",
    "restore-company-recovery-set.sh",
    "restore-object-storage-from-b2.sh",
    "corruption_cases_rejected",
    "compose down --volumes",
  ]) {
    assert.ok(harness.includes(required), `DR runtime harness is missing ${required}`);
  }
});

test("disposable DR waits for the published host PostgreSQL socket before Prisma", () => {
  const harness = read("scripts/database/test-disaster-recovery-runtime.sh");
  const publish = harness.indexOf("port=$(compose port postgres 5432");
  const readiness = harness.indexOf('if ! wait_for_host_postgres "$port"; then');
  const migrate = harness.indexOf("prisma migrate deploy");

  assert.ok(publish >= 0, "the PostgreSQL port must come from Compose");
  assert.ok(readiness > publish, "host readiness must follow port discovery");
  assert.ok(migrate > readiness, "Prisma must run only after host readiness");
  assert.match(harness, /socket\.create_connection\(\("127\.0\.0\.1", port\), timeout=/u);
  assert.match(harness, /time\.monotonic\(\) \+ (?:60|75|90)/u);
  assert.match(harness, /except OSError:/u);
  assert.match(harness, /time\.sleep\(min\(0\.25, remaining\)\)/u);
  assert.match(harness, /compose ps[\s\S]*compose port postgres 5432[\s\S]*compose logs --tail=100 postgres/u);
  assert.doesNotMatch(harness, /\bsleep 10\b/u);
});

test("the disposable fiscal fixture includes the complete active sale application chain", () => {
  const seed = read("scripts/database/dr-disposable-seed.sql");
  for (const table of [
    '"Customer"',
    '"SaleItem"',
    '"SaleDocument"',
    '"BillingRequest"',
    '"BillingRequestSaleDocument"',
    '"BillingRequestSaleItem"',
    '"Invoice"',
    '"InvoiceSaleDocument"',
    '"InvoiceSaleItemApplication"',
    '"FiscalArtifact"',
  ]) {
    assert.match(seed, new RegExp(`INSERT INTO ${table}`, "u"));
  }
  assert.match(seed, /BEGIN;[\s\S]*COMMIT;/u);
  assert.match(seed, /status, "requestedAt", "reviewedAt", "reviewedByUserId", "updatedAt"\) VALUES[\s\S]*'APPROVED'/u);
  assert.match(seed, /status, "createdByUserId", "updatedAt"\) VALUES[\s\S]*'ACTIVE'/u);
  assert.match(seed, /'dr-billing-document', 'dr-billing-request', 'dr-sale-document'/u);
  assert.match(seed, /'dr-invoice-document', 'dr-invoice', 'dr-sale-document', 'dr-billing-document'/u);
  assert.match(seed, /'dr-invoice-item', 'dr-invoice-document', 'dr-sale-item'/u);
  assert.match(seed, /'dr-fiscal-artifact', 'dr-invoice', 'PDF', 'AVAILABLE'/u);
});

test("recovery set records immutable releases, schema, timestamps, sizes and checksums", () => {
  const helper = read("scripts/database/company-recovery-manifest.mjs");
  const create = read("scripts/database/create-company-recovery-set.sh");
  for (const field of [
    "company_slug",
    "release_digests",
    "schema_state",
    "created_at",
    "validated_at",
    "size_bytes",
    "sha256",
  ]) {
    assert.ok(helper.includes(field), `missing recovery field ${field}`);
  }
  assert.match(create, /backup-object-storage-to-b2\.sh/u);
  assert.match(create, /backup-postgres-to-b2\.sh/u);
  assert.match(create, /BACKUP_RETENTION_DISABLED=true/u);
});

test("postgres backup component manifest records its deterministic manifest key", () => {
  const backup = read("scripts/database/backup-postgres-to-b2.sh");
  assert.match(
    backup,
    /"manifest_key": "\$manifest_key"/u,
  );
});

test("object restore does not pass unsupported only-show-errors to bucket create or remove", () => {
  const restore = read("scripts/database/restore-object-storage-from-b2.sh");

  const commands = restore.replace(/\\\r?\n/gu, " ");
  assert.doesNotMatch(
    commands,
    /\bs3 mb\b[^\n;&|]*--only-show-errors\b/u,
  );

  assert.doesNotMatch(
    commands,
    /\bs3 rb\b[^\n;&|]*--only-show-errors\b/u,
  );
});
