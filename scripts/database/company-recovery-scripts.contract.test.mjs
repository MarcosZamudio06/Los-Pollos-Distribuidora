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
  assert.match(restore, /write_rehearsal_result\s+failed/u);
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
