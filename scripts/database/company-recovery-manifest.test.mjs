import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildCompanyRecoveryManifest,
  verifyCompanyRecoveryIdentity,
  verifyCompanyObjectManifest,
  verifyCompanyRecoverySet,
} from "./company-recovery-manifest.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = `sha256:${"a".repeat(64)}`;
const migration = {
  migration_name: "20260913000000_mte_fixture",
  checksum: "b".repeat(64),
  finished_at: "2026-09-13T12:00:00.000Z",
};

function componentManifests() {
  const pg = {
    format: "postgresql-custom",
    key: "postgres/2026/09/2026-09-13T12-00-00Z.dump",
    manifest_key: "postgres/2026/09/2026-09-13T12-00-00Z.manifest.json",
    created_at: "2026-09-13T12:00:00.000Z",
    database: "tenant_acme",
    size_bytes: 5,
    sha256: sha256("pg123"),
  };
  const objects = {
    format: "company-object-storage-tar-v1",
    company_slug: "acme",
    source_bucket: "acme-delivery",
    key: "object-storage/acme/2026-09-13T12-00-00Z.tar.gz",
    manifest_key:
      "object-storage/acme/2026-09-13T12-00-00Z.tar.gz.manifest.json",
    created_at: "2026-09-13T12:00:00.000Z",
    size_bytes: 5,
    sha256: sha256("obj45"),
  };
  const pgRaw = JSON.stringify(pg);
  const objectRaw = JSON.stringify(objects);
  return { pg, objects, pgRaw, objectRaw };
}

function manifestFixture() {
  const components = componentManifests();
  const manifest = buildCompanyRecoveryManifest({
    companySlug: "acme",
    database: "tenant_acme",
    backendDigest: digest,
    frontendDigest: `sha256:${"e".repeat(64)}`,
    schemaState: [migration],
    postgresManifest: components.pg,
    postgresManifestRaw: components.pgRaw,
    postgresManifestSha256: sha256(components.pgRaw),
    objectManifest: components.objects,
    objectManifestRaw: components.objectRaw,
    objectManifestSha256: sha256(components.objectRaw),
    createdAt: "2026-09-13T12:01:00.000Z",
  });
  const manifestRaw = `${JSON.stringify(manifest)}\n`;
  const checksumRaw = `${sha256(manifestRaw)}  manifest.json\n`;
  return { ...components, manifest, manifestRaw, checksumRaw };
}

test("company recovery set records tenant, release, schema, timestamps, sizes and checksums", () => {
  const { manifest } = manifestFixture();
  assert.equal(manifest.company_slug, "acme");
  assert.equal(manifest.release_digests.backend, digest);
  assert.equal(manifest.schema_state.migration_count, 1);
  assert.equal(
    manifest.schema_state.migrations[0].migration_name,
    migration.migration_name,
  );
  assert.equal(manifest.postgresql.size_bytes, 5);
  assert.equal(manifest.object_storage.sha256, sha256("obj45"));
  assert.ok(Date.parse(manifest.created_at));
  assert.ok(Date.parse(manifest.postgresql.created_at));
  assert.ok(Date.parse(manifest.object_storage.created_at));
});

test("different-company recovery sets are rejected before artifact access", () => {
  const { manifestRaw, checksumRaw } = manifestFixture();
  assert.throws(
    () =>
      verifyCompanyRecoveryIdentity({
        manifestRaw,
        checksumRaw,
        expectedCompany: "other",
      }),
    /RECOVERY_SET_COMPANY_MISMATCH/u,
  );
});

test("object storage restore rejects another company's manifest before target work", () => {
  const { objects, objectRaw } = componentManifests();
  assert.throws(
    () =>
      verifyCompanyObjectManifest({
        manifestRaw: objectRaw,
        checksumRaw: `${sha256(objectRaw)}  object.manifest.json`,
        expectedCompany: "other",
        archivePath: "/not-opened-before-company-check.tar.gz",
      }),
    /OBJECT_STORAGE_COMPANY_MISMATCH/u,
  );
  assert.equal(objects.company_slug, "acme");
});

test("restore verification fails closed for missing, corrupt or mismatched files", () => {
  const { manifestRaw, checksumRaw, pg, objects, pgRaw, objectRaw } =
    manifestFixture();
  const directory = mkdtempSync(join(tmpdir(), "mte-recovery-test-"));
  try {
    const postgresPath = join(directory, "postgres.dump");
    const objectPath = join(directory, "objects.tar.gz");
    writeFileSync(postgresPath, "pg123");
    writeFileSync(objectPath, "obj45");
    const input = {
      manifestRaw,
      checksumRaw,
      expectedCompany: "acme",
      postgresManifest: pg,
      postgresManifestRaw: pgRaw,
      objectManifest: objects,
      objectManifestRaw: objectRaw,
      postgresPath,
      objectStoragePath: objectPath,
    };
    assert.equal(verifyCompanyRecoverySet(input).company_slug, "acme");
    writeFileSync(objectPath, "tampered");
    assert.throws(
      () => verifyCompanyRecoverySet(input),
      /RECOVERY_SET_OBJECT_CHECKSUM_INVALID/u,
    );
    rmSync(objectPath);
    assert.throws(
      () => verifyCompanyRecoverySet(input),
      /RECOVERY_SET_OBJECT_ARCHIVE_MISSING/u,
    );
    assert.throws(
      () => verifyCompanyRecoverySet({ ...input, checksumRaw: "" }),
      /RECOVERY_SET_MANIFEST_OR_CHECKSUM_MISSING/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
