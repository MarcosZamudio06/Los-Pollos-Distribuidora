import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildCompanyRecoveryRetentionPlan,
  listKnownRecoveryObjectKeys,
  selectRecoverySetRetention,
} from "./company-recovery-retention.mjs";
import { buildCompanyRecoveryManifest } from "./company-recovery-manifest.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const slug = "acme";

function timestampKey(value) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

function recoveryRecord(companySlug, createdAt, suffix, postgresKey, sharedPostgres) {
  const instant = Date.parse(createdAt);
  const before = new Date(instant - 60_000).toISOString();
  const after = new Date(instant + 60_000).toISOString();
  const timestamp = timestampKey(createdAt.replace(/\.\d{3}Z$/u, "Z"));
  const postgres = sharedPostgres ?? {
    format: "postgresql-custom",
    key: postgresKey ?? `postgres/${createdAt.slice(0, 4)}/${createdAt.slice(5, 7)}/${timestamp}.dump`,
    manifest_key: (postgresKey ?? `postgres/${createdAt.slice(0, 4)}/${createdAt.slice(5, 7)}/${timestamp}.dump`).replace(/\.dump$/u, ".manifest.json"),
    created_at: createdAt,
    database: `tenant_${companySlug.replaceAll("-", "_")}`,
    size_bytes: 8,
    sha256: digest(`pg:${companySlug}:${createdAt}`),
  };
  const objects = {
    format: "company-object-storage-tar-v1",
    company_slug: companySlug,
    source_bucket: `${companySlug}-objects`,
    key: `object-storage/${companySlug}/${timestamp}-1-2.tar.gz`,
    manifest_key: `object-storage/${companySlug}/${timestamp}-1-2.tar.gz.manifest.json`,
    created_at: createdAt,
    size_bytes: 9,
    sha256: digest(`objects:${companySlug}:${createdAt}`),
  };
  const postgresRaw = `${JSON.stringify(postgres)}\n`;
  const objectRaw = `${JSON.stringify(objects)}\n`;
  const recoveryPoint = {
    method: "backend-quiesce",
    backend_service: "backend",
    backend_was_running: true,
    quiesce_requested_at: before,
    write_barrier_at: before,
    capture_started_at: before,
    capture_finished_at: after,
    write_barrier_released_at: after,
    writes_resumed_at: after,
  };
  const manifest = buildCompanyRecoveryManifest({
    companySlug,
    database: postgres.database,
    backendDigest: `ghcr.io/example/backend@sha256:${"a".repeat(64)}`,
    frontendDigest: `ghcr.io/example/frontend@sha256:${"b".repeat(64)}`,
    schemaState: [{
      migration_name: "20260913000000_fixture",
      checksum: "c".repeat(64),
      finished_at: createdAt,
    }],
    recoveryPoint,
    postgresManifest: postgres,
    postgresManifestRaw: postgresRaw,
    postgresManifestSha256: digest(postgresRaw),
    objectManifest: objects,
    objectManifestRaw: objectRaw,
    objectManifestSha256: digest(objectRaw),
    createdAt,
  });
  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestKey = `recovery-sets/${companySlug}/${timestamp}-${suffix}.manifest.json`;
  return {
    manifestKey,
    checksumKey: `${manifestKey}.sha256`,
    manifestRaw,
    checksumRaw: `${digest(manifestRaw)}  ${manifestKey.split("/").at(-1)}\n`,
    postgresManifestRaw: postgresRaw,
    objectManifestRaw: objectRaw,
    objectChecksumRaw: `${digest(objectRaw)}  object-storage.manifest.json\n`,
  };
}

function dates(entries) {
  return entries.map(([day, time, suffix]) => recoveryRecord(
    slug,
    `${day}T${time}:00.000Z`,
    suffix,
  ));
}

test("retention keeps the union of newest daily, ISO-week, and calendar-month sets", () => {
  const records = dates([
    ["2026-09-27", "12:00", "1-1"],
    ["2026-09-27", "00:00", "1-2"],
    ["2026-09-26", "12:00", "1-3"],
    ["2026-09-20", "12:00", "1-4"],
    ["2026-09-13", "12:00", "1-5"],
    ["2026-08-31", "12:00", "1-6"],
  ]);

  const plan = selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: records.map(({ manifestKey, manifestRaw }) => ({
      manifestKey,
      manifest: JSON.parse(manifestRaw),
    })),
    daily: 2,
    weekly: 2,
    monthly: 2,
  });

  assert.deepEqual(new Set(plan.retainedRecoverySetKeys), new Set([
    records[0].manifestKey,
    records[2].manifestKey,
    records[3].manifestKey,
    records[5].manifestKey,
  ]));
  assert.deepEqual(new Set(plan.deletedRecoverySetKeys), new Set([
    records[1].manifestKey,
    records[4].manifestKey,
  ]));
});

test("newest valid set remains when all retention windows are zero", () => {
  const records = dates([
    ["2026-09-24", "12:00", "2-1"],
    ["2026-09-25", "12:00", "2-1"],
    ["2026-09-26", "12:00", "2-1"],
  ]);
  const plan = selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: records.map(({ manifestKey, manifestRaw }) => ({
      manifestKey,
      manifest: JSON.parse(manifestRaw),
    })),
    daily: 0,
    weekly: 0,
    monthly: 0,
  });
  assert.deepEqual(plan.retainedRecoverySetKeys, [records[2].manifestKey]);
  assert.equal(plan.deletedRecoverySetKeys.length, 2);
});

test("ISO-week retention crosses UTC year boundaries using ISO week-year", () => {
  const records = [
    recoveryRecord(slug, "2021-01-01T12:00:00.000Z", "2-0"),
    recoveryRecord(slug, "2021-01-03T12:00:00.000Z", "2-1"),
    recoveryRecord(slug, "2021-01-04T00:00:00.000Z", "2-2"),
  ];
  const plan = selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: records.map(({ manifestKey, manifestRaw }) => ({
      manifestKey,
      manifest: JSON.parse(manifestRaw),
    })),
    daily: 0,
    weekly: 2,
    monthly: 0,
  });
  assert.deepEqual(new Set(plan.retainedRecoverySetKeys), new Set([
    records[1].manifestKey,
    records[2].manifestKey,
  ]));
});

test("selector is company-scoped and keeps the newest set among equal timestamps deterministically", () => {
  const target = recoveryRecord(slug, "2026-09-27T12:00:00.000Z", "1-1");
  const tie = recoveryRecord(slug, "2026-09-27T12:00:00.000Z", "1-2");
  const otherCompany = recoveryRecord("beta", "2026-09-27T12:01:00.000Z", "1-3");
  const plan = selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: [target, tie, otherCompany].map(({ manifestKey, manifestRaw }) => ({
      manifestKey,
      manifest: JSON.parse(manifestRaw),
    })),
    daily: 1,
    weekly: 1,
    monthly: 1,
  });
  assert.deepEqual(plan.retainedRecoverySetKeys, [tie.manifestKey]);
  assert.deepEqual(plan.deletedRecoverySetKeys, [target.manifestKey]);
  assert.ok(!plan.retainedRecoverySetKeys.includes(otherCompany.manifestKey));
});

test("selector fails closed on malformed manifests, duplicate keys, and invalid retention counts", () => {
  const valid = recoveryRecord(slug, "2026-09-27T12:00:00.000Z", "1-1");
  const item = { manifestKey: valid.manifestKey, manifest: JSON.parse(valid.manifestRaw) };
  assert.throws(() => selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: [{ ...item, manifest: { ...item.manifest, created_at: "bad" } }],
    daily: 1,
    weekly: 1,
    monthly: 1,
  }), /RECOVERY_RETENTION_SET_INVALID/u);
  assert.throws(() => selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: [item, item],
    daily: 1,
    weekly: 1,
    monthly: 1,
  }), /RECOVERY_RETENTION_SET_DUPLICATE/u);
  assert.throws(() => selectRecoverySetRetention({
    companySlug: slug,
    recoverySets: [item],
    daily: -1,
    weekly: 1,
    monthly: 1,
  }), /RECOVERY_RETENTION_COUNT_INVALID/u);
});

test("plan never deletes a component still referenced by another company's retained set", () => {
  const sharedPostgresKey = "postgres/2026/09/2026-09-20T12-00-00Z.dump";
  const expired = recoveryRecord("acme", "2026-09-20T12:00:00.000Z", "3-1", sharedPostgresKey);
  const newest = recoveryRecord("acme", "2026-09-27T12:00:00.000Z", "3-2");
  const expiredPostgres = JSON.parse(expired.postgresManifestRaw);
  const betaReference = recoveryRecord(
    "beta",
    "2026-09-20T12:00:00.000Z",
    "3-1",
    sharedPostgresKey,
    expiredPostgres,
  );

  const plan = buildCompanyRecoveryRetentionPlan({
    companySlug: "acme",
    expectedRecoverySetKey: newest.manifestKey,
    recoverySets: [expired, newest, betaReference],
    componentManifests: [],
    daily: 1,
    weekly: 1,
    monthly: 1,
  });

  assert.ok(plan.deleteRecoverySetObjects.includes(expired.manifestKey));
  assert.ok(!plan.deleteComponentObjects.includes(sharedPostgresKey));
  assert.ok(plan.deleteComponentObjects.includes(JSON.parse(expired.objectManifestRaw).key));
});

test("orphan cleanup is restricted to valid, company-owned component manifests", () => {
  const latest = recoveryRecord("acme", "2026-09-27T12:00:00.000Z", "4-1");
  const orphanKey = "object-storage/acme/2026-09-01T00-00-00Z-11-22.tar.gz";
  const orphanManifest = {
    format: "company-object-storage-tar-v1",
    company_slug: "acme",
    source_bucket: "acme-objects",
    key: orphanKey,
    manifest_key: `${orphanKey}.manifest.json`,
    created_at: "2026-09-01T00:00:00.000Z",
    size_bytes: 4,
    sha256: digest("orphan"),
  };
  const orphanRaw = `${JSON.stringify(orphanManifest)}\n`;
  const plan = buildCompanyRecoveryRetentionPlan({
    companySlug: "acme",
    expectedRecoverySetKey: latest.manifestKey,
    recoverySets: [latest],
    componentManifests: [{
      kind: "object-storage",
      manifestKey: orphanManifest.manifest_key,
      manifestRaw: orphanRaw,
      checksumRaw: `${digest(orphanRaw)}  orphan.manifest.json\n`,
    }],
    daily: 14,
    weekly: 8,
    monthly: 6,
  });
  assert.ok(plan.deleteComponentObjects.includes(orphanKey));
  assert.ok(plan.deleteComponentObjects.includes(orphanManifest.manifest_key));
  assert.ok(plan.deleteComponentObjects.includes(`${orphanManifest.manifest_key}.sha256`));
  assert.ok(plan.deleteComponentObjects.every((key) => !key.includes("beta")));
});

test("plan fails closed if any known recovery set or component manifest is invalid", () => {
  const latest = recoveryRecord("acme", "2026-09-27T12:00:00.000Z", "5-1");
  const broken = { ...latest, checksumRaw: "0".repeat(64) };
  assert.throws(() => buildCompanyRecoveryRetentionPlan({
    companySlug: "acme",
    expectedRecoverySetKey: latest.manifestKey,
    recoverySets: [broken],
    componentManifests: [],
    daily: 14,
    weekly: 8,
    monthly: 6,
  }), /RECOVERY_SET_MANIFEST_CHECKSUM_INVALID/u);
  assert.throws(() => buildCompanyRecoveryRetentionPlan({
    companySlug: "acme",
    expectedRecoverySetKey: latest.manifestKey,
    recoverySets: [latest],
    componentManifests: [{
      kind: "object-storage",
      manifestKey: "object-storage/acme/2026-09-01T00-00-00Z-1-1.tar.gz.manifest.json",
      manifestRaw: "{}\n",
      checksumRaw: "0".repeat(64),
    }],
    daily: 14,
    weekly: 8,
    monthly: 6,
  }), /OBJECT_STORAGE_MANIFEST_CHECKSUM_INVALID/u);
});

test("inventory ignores unknown keys and limits component discovery to one company", () => {
  const keys = [
    "recovery-sets/acme/2026-09-27T12-00-00Z-1-1.manifest.json",
    "recovery-sets/beta/2026-09-27T12-00-00Z-1-1.manifest.json",
    "recovery-sets/acme/unrecognized.manifest.json",
    "unrelated/manual-export.tar",
    "postgres/acme/2026/09/2026-09-27T12-00-00Z-1-1.manifest.json",
    "postgres/beta/2026/09/2026-09-27T12-00-00Z-1-1.manifest.json",
    "object-storage/acme/2026-09-27T12-00-00Z-1-1.tar.gz.manifest.json",
  ];
  assert.deepEqual(
    listKnownRecoveryObjectKeys({ keys, kind: "recovery-set" }),
    [keys[0], keys[1]],
  );
  assert.deepEqual(
    listKnownRecoveryObjectKeys({ keys, kind: "postgresql", companySlug: "acme" }),
    [keys[4]],
  );
  assert.deepEqual(
    listKnownRecoveryObjectKeys({ keys, kind: "object-storage", companySlug: "acme" }),
    [keys[6]],
  );
});
