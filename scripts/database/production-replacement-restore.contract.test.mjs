import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("replacement import is separate and never invokes destructive drill cleanup or traffic cutover", () => {
  const script = read("scripts/database/restore-company-production-replacement.sh");
  assert.match(script, /RESTORE_CONFIRMATION/u);
  assert.match(script, /if \[\[ "\$apply" != true \]\]; then/u);
  assert.match(script, /RESTORE_REPLACEMENT_COMPOSE_PROJECT/u);
  assert.match(script, /RESTORE_REPLACEMENT_HOST_REF/u);
  assert.match(script, /RESTORE_REPLACEMENT_DATABASE_NAME.*_replacement/u);
  assert.match(script, /mte-replacement-/u);
  assert.doesNotMatch(script, /dropdb|DROP DATABASE|pg_restore[^\n]*--clean|s3 sync[^\n]*--delete|s3 rm|s3 rb|caddy reload|cloudflare|route53/iu);
  assert.doesNotMatch(script, /restore-company-recovery-set\.sh|restore-postgres-from-b2\.sh|restore-object-storage-from-b2\.sh/u);
});

test("all archive and target guards precede replacement creation", () => {
  const script = read("scripts/database/restore-company-production-replacement.sh");
  const identity = script.indexOf("verify-identity");
  const completeSet = script.indexOf('company-recovery-manifest.mjs" verify --manifest');
  const compatibility = script.indexOf("stage=release_schema_preflight");
  const target = script.indexOf("stage=target_preflight");
  const mutation = script.indexOf("stage=postgres_restore");
  assert.ok(identity >= 0 && completeSet > identity && compatibility > completeSet);
  assert.ok(target > compatibility && mutation > target);
  assert.match(script, /pg_restore --list/u);
  assert.match(script, /s3api list-buckets/u);
  assert.match(script, /READY_FOR_CUTOVER/u);
  assert.match(script, /traffic_cutover_performed': False/u);
});

test("disposable runtime exercises replacement and corruption without B2", () => {
  const runtime = read("scripts/database/test-disaster-recovery-runtime.sh");
  const compose = read("scripts/database/dr-replacement.compose.yml");
  const workflow = read(".github/workflows/quality-gate.yml");
  assert.match(runtime, /dr-replacement\.compose\.yml/u);
  assert.match(runtime, /restore-company-production-replacement\.sh/u);
  assert.match(runtime, /reference-failed\.json/u);
  assert.match(runtime, /smoke-failed\.json/u);
  assert.match(runtime, /replacement-ready\.json/u);
  assert.match(compose, /replacement-storage:/u);
  assert.doesNotMatch(compose, /ports:/u);
  assert.match(workflow, /production-replacement-restore\.contract\.test\.mjs/u);
});

test("disposable replacement scenarios pin recovery keys before same-day retention", () => {
  const runtime = read("scripts/database/test-disaster-recovery-runtime.sh");
  const ready = runtime.indexOf('replacement_result="$WORK/replacement-ready.json"');
  const smoke = runtime.indexOf("# A failed final smoke cannot issue READY_FOR_CUTOVER");
  const retention = runtime.indexOf("export BACKUP_RETENTION_DAILY=2");
  const broken = runtime.indexOf("# A self-consistent recovery set can still contain a broken DB-to-object reference.");
  const end = runtime.indexOf("python3 - \"$create_result\" \"$restore_result\"");

  assert.ok(ready >= 0 && smoke > ready && broken > smoke && retention > broken && end > retention);
  assert.match(runtime.slice(ready, smoke), /RESTORE_RECOVERY_SET_KEY="\$recovery_key"[\s\S]*?restore-company-production-replacement\.sh" --apply/u);
  assert.match(runtime.slice(smoke, retention), /RESTORE_RECOVERY_SET_KEY="\$recovery_key"[\s\S]*?restore-company-production-replacement\.sh" --apply/u);
  assert.match(runtime.slice(broken, end), /RESTORE_RECOVERY_SET_KEY="\$bad_recovery_key"[\s\S]*?restore-company-production-replacement\.sh" --apply/u);
  assert.match(runtime.slice(smoke, retention), /cp "\$WORK\/smoke-failed\.json" "\$EVIDENCE_DIR\/replacement-smoke-failed\.json"/u);
  assert.match(runtime.slice(ready, smoke), /cp "\$replacement_result" "\$EVIDENCE_DIR\/replacement-ready\.json"/u);
  assert.match(runtime.slice(broken, end), /cp "\$WORK\/reference-failed\.json" "\$EVIDENCE_DIR\/replacement-reference-failed\.json"/u);
  assert.doesNotMatch(runtime.slice(retention, end), /RESTORE_RECOVERY_SET_KEY="\$recovery_key"/u);
});

test("disposable cleanup reports test and cleanup outcomes independently", () => {
  const runtime = read("scripts/database/test-disaster-recovery-runtime.sh");
  const cleanup = runtime.slice(runtime.indexOf("cleanup() {"), runtime.indexOf("trap cleanup EXIT"));
  assert.match(cleanup, /test_status/u);
  assert.match(cleanup, /cleanup_status/u);
  assert.match(cleanup, /targets_removed/u);
  assert.match(cleanup, /for project in "\$PROJECT" "\$REPLACEMENT_PROJECT"/u);
  assert.match(cleanup, /ps -aq --filter "label=com\.docker\.compose\.project=\$project"/u);
  assert.match(cleanup, /network ls -q --filter "label=com\.docker\.compose\.project=\$project"/u);
  assert.match(cleanup, /if \[\[ "\$cleanup_status" == failed && "\$exit_status" == 0 \]\]/u);
  assert.match(cleanup, /local exit_status=\$\?/u);
  assert.match(cleanup, /if \(\( exit_status != 0 \)\); then[\s\S]*?test_status=failed/u);
  assert.match(cleanup, /elif \[\[ -n "\$containers" \]\]; then[\s\S]*?targets_removed=false/u);
  assert.match(cleanup, /elif \[\[ -n "\$networks" \]\]; then[\s\S]*?targets_removed=false/u);
  assert.match(cleanup, /"\$test_status" "\$cleanup_status" "\$PROJECT" "\$targets_removed" > "\$EVIDENCE_DIR\/cleanup\.json"/u);
  assert.match(cleanup, /exit "\$exit_status"/u);
  assert.doesNotMatch(cleanup, /targets_removed[^\n]*\$\(\[\[ "\$status" == 0 \]\]/u);
});
