import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("company recovery quiesces only its backend and always restores prior service state", () => {
  const create = read("scripts/database/create-company-recovery-set.sh");
  const common = read("scripts/database/postgres-backup-common.sh");
  const postgres = read("scripts/database/backup-postgres-to-b2.sh");
  const objects = read("scripts/database/backup-object-storage-to-b2.sh");
  const spacePreflight = read("scripts/database/preflight-object-storage-backup-space.sh");
  const compose = read("docker-compose.production.yml");
  const backendMain = read("backend/src/main.ts");
  assert.match(create, /flock -n/u);
  assert.ok(create.includes("backup_compose stop --timeout"));
  assert.ok(
    create.includes('backup_compose start "$COMPANY_RECOVERY_BACKEND_SERVICE"'),
  );
  assert.match(create, /trap .*EXIT/u);
  assert.match(create, /BACKUP_POSTGRES_SERVICE/u);
  assert.match(create, /OBJECT_STORAGE_SERVICE/u);
  assert.ok(common.includes("backup_compose_service_health"));
  assert.ok(common.includes("backup_assert_object_storage_ready"));
  assert.match(
    create,
    /backup_compose_service_health "\$COMPANY_RECOVERY_BACKEND_SERVICE"/u,
  );
  assert.match(
    postgres,
    /backup_compose_service_health "\$BACKUP_POSTGRES_SERVICE"/u,
  );
  assert.ok(
    objects.indexOf("backup_assert_object_storage_ready") <
      objects.indexOf("s3 sync"),
  );
  assert.ok(
    create.indexOf("preflight-object-storage-backup-space.sh") <
      create.indexOf("backup_compose stop --timeout"),
    "local capacity must be checked before entering maintenance",
  );
  assert.ok(
    objects.indexOf("preflight-object-storage-backup-space.sh") <
      objects.indexOf("s3 sync"),
    "capacity must be rechecked before exporting Object Storage",
  );
  assert.match(spacePreflight, /s3api list-objects-v2/u);
  assert.match(spacePreflight, /object_count \* 4096/u);
  assert.match(spacePreflight, /source_bytes \+ \(2 \* archive_upper_bound\)/u);
  assert.match(common, /backup_object_storage_cli s3api head-bucket/u);
  assert.doesNotMatch(
    create,
    /docker compose (?:down|stop .*postgres|stop .*object-storage)/u,
  );
  assert.match(
    create,
    /COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS=\$\{COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS:-120\}/u,
  );
  for (const service of ["postgres", "object-storage", "backend"]) {
    const block = compose.match(
      new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|^volumes:)`, "m"),
    );
    assert.ok(block?.[1].includes("healthcheck:"), `${service} needs a healthcheck`);
  }
  assert.match(compose, /stop_grace_period: 75s/u);
  assert.match(backendMain, /enableShutdownHooks\(\['SIGTERM', 'SIGINT'\]\)/u);
});

test("recovery timestamps bind both components to the same write barrier", () => {
  const create = read("scripts/database/create-company-recovery-set.sh");
  const manifest = read("scripts/database/company-recovery-manifest.mjs");
  assert.match(create, /write_barrier_at/u);
  assert.match(create, /capture_started_at/u);
  assert.match(create, /capture_finished_at/u);
  assert.match(create, /writes_resumed_at/u);
  assert.match(manifest, /recovery_point/u);
});

test("local validated recovery evidence retains exact component manifest keys", () => {
  const create = read("scripts/database/create-company-recovery-set.sh");
  assert.match(create, /"manifest_key": postgres_manifest_key/u);
  assert.match(create, /"manifest_key": object_manifest_key/u);
});

test("retention runs only after the new complete recovery set is remotely verified", () => {
  const create = read("scripts/database/create-company-recovery-set.sh");
  const retention = read("scripts/database/apply-company-recovery-retention.sh");
  const postgres = read("scripts/database/backup-postgres-to-b2.sh");
  const objects = read("scripts/database/backup-object-storage-to-b2.sh");
  const selector = read("scripts/database/company-recovery-retention.mjs");
  const remoteIdentity = create.lastIndexOf(
    'company-recovery-manifest.mjs" verify-identity',
  );
  const retentionRun = create.indexOf('apply-company-recovery-retention.sh');
  const validatedResult = create.indexOf("write_result validated", retentionRun);

  assert.ok(remoteIdentity >= 0 && retentionRun > remoteIdentity);
  assert.ok(validatedResult > retentionRun);
  assert.match(create, /BACKUP_RETENTION_DISABLED=true/u);
  assert.match(create, /BACKUP_RECOVERY_SET_MODE=true/u);
  assert.match(retention, /list-objects-v2/u);
  assert.match(retention, /recovery-sets\//u);
  assert.match(retention, /s3 rm/u);
  assert.match(retention, /postgres\/\$COMPANY_SLUG\//u);
  assert.match(retention, /object-storage\/\$COMPANY_SLUG\//u);
  assert.match(selector, /RECOVERY_RETENTION_COMPONENT_MANIFEST_CONFLICT/u);
  assert.match(selector, /expectedRecoverySetKey/u);
  assert.match(postgres, /postgres\/\$COMPANY_SLUG\//u);
  assert.match(postgres, /BACKUP_RECOVERY_SET_MODE/u);
  assert.match(objects, /BACKUP_FAILED_KEEP_COUNT/u);
  assert.match(objects, /failure_stage/u);
  assert.match(objects, /prune_failed_attempts/iu);
});

test("Object Storage preflight and failed component execution cannot emit validated recovery evidence", () => {
  const create = read("scripts/database/create-company-recovery-set.sh");
  const common = read("scripts/database/postgres-backup-common.sh");
  assert.match(common, /head-bucket/u);
  assert.match(create, /failure_stage/u);
  assert.match(create, /status.*failed/u);
  assert.ok(
    create.indexOf('company-recovery-manifest.mjs" verify') <
      create.indexOf('company-recovery-manifest.mjs" create'),
  );
});

test(
  "integration harness exercises cleanup, readiness failures, injected component faults, interruption, and tenant isolation",
  () => {
    const harness = read(
      "scripts/database/test-company-recovery-orchestration.sh",
    );
    for (const scenario of [
      "postgres",
      "object-storage",
      "interrupted",
      "parent-interrupted",
      "postgres-health",
      "backend-health",
      "object-storage-health",
      "object-head",
      "object-head-late",
      "FAKE_AVAILABLE_BYTES=2097152",
      "staging-space preflight to fail",
      "quiesce-stop",
      "company-north",
      "company-south",
    ]) {
      assert.ok(
        harness.includes(scenario),
        `missing integration scenario ${scenario}`,
      );
    }
  }
);

test("successful local result preserves component checksums and recovery-set checksum key", () => {
  const harness = read("scripts/database/test-company-recovery-orchestration.sh");
  assert.match(harness, /data\["postgresql"\]\["sha256"\]/u);
  assert.match(harness, /data\["object_storage"\]\["sha256"\]/u);
  assert.match(harness, /recovery_set_checksum_key/u);
});
