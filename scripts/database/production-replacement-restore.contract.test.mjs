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
  assert.match(runtime, /dr-replacement\.compose\.yml/u);
  assert.match(runtime, /restore-company-production-replacement\.sh/u);
  assert.match(runtime, /reference-failed\.json/u);
  assert.match(runtime, /smoke-failed\.json/u);
  assert.match(runtime, /replacement-ready\.json/u);
  assert.match(compose, /replacement-storage:/u);
  assert.doesNotMatch(compose, /ports:/u);
});
