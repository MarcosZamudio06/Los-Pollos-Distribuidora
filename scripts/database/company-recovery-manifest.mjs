#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function fail(code) {
  throw new Error(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(raw, code) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(code);
  }
}

function readJsonFile(path, code) {
  if (!path) fail(code);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(code);
  }
  return { raw, value: parseJson(raw, code) };
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateSlug(value) {
  if (typeof value !== "string" || !SLUG_PATTERN.test(value)) {
    fail("RECOVERY_SET_COMPANY_SLUG_INVALID");
  }
}

function validateImageDigest(value) {
  if (typeof value !== "string") fail("RECOVERY_SET_RELEASE_DIGEST_INVALID");
  const digest = value.includes("@")
    ? value.slice(value.lastIndexOf("@") + 1)
    : value;
  if (!DIGEST_PATTERN.test(digest)) fail("RECOVERY_SET_RELEASE_DIGEST_INVALID");
}

function validateComponentKey(value, prefix, suffix) {
  if (
    typeof value !== "string" ||
    !value.startsWith(`${prefix}/`) ||
    !value.endsWith(suffix) ||
    value.split("/").includes("..")
  ) {
    fail("RECOVERY_SET_COMPONENT_KEY_INVALID");
  }
}

function validateComponentManifest({ kind, value, companySlug, database }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("RECOVERY_SET_COMPONENT_MANIFEST_INVALID");
  }
  if (
    typeof value.key !== "string" ||
    typeof value.manifest_key !== "string" ||
    !validTimestamp(value.created_at) ||
    !Number.isSafeInteger(value.size_bytes) ||
    value.size_bytes < 1 ||
    !/^[a-f0-9]{64}$/u.test(value.sha256 ?? "")
  ) {
    fail("RECOVERY_SET_COMPONENT_MANIFEST_INVALID");
  }
  if (kind === "postgresql") {
    if (value.format !== "postgresql-custom") {
      fail("RECOVERY_SET_DATABASE_MANIFEST_MISMATCH");
    }
    validateComponentKey(value.key, "postgres", ".dump");
    if (
      value.manifest_key !== value.key.replace(/\.dump$/u, ".manifest.json") ||
      value.database !== database
    ) {
      fail("RECOVERY_SET_DATABASE_MANIFEST_MISMATCH");
    }
  } else {
    if (value.format !== "company-object-storage-tar-v1") {
      fail("RECOVERY_SET_OBJECT_MANIFEST_MISMATCH");
    }
    validateComponentKey(value.key, `object-storage/${companySlug}`, ".tar.gz");
    if (
      value.manifest_key !== `${value.key}.manifest.json` ||
      value.company_slug !== companySlug ||
      typeof value.source_bucket !== "string" ||
      value.source_bucket.length === 0
    ) {
      fail("RECOVERY_SET_OBJECT_MANIFEST_MISMATCH");
    }
  }
  return value;
}

function normalizeSchemaState(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("RECOVERY_SET_SCHEMA_STATE_MISSING");
  }
  const migrations = value.map((migration) => {
    if (
      !migration ||
      typeof migration.migration_name !== "string" ||
      migration.migration_name.length === 0 ||
      !/^[a-f0-9]{64}$/u.test(migration.checksum ?? "") ||
      !validTimestamp(migration.finished_at)
    ) {
      fail("RECOVERY_SET_SCHEMA_STATE_INVALID");
    }
    return {
      migration_name: migration.migration_name,
      checksum: migration.checksum,
      finished_at: new Date(migration.finished_at).toISOString(),
    };
  });
  migrations.sort((left, right) =>
    left.migration_name.localeCompare(right.migration_name),
  );
  if (
    new Set(migrations.map(({ migration_name }) => migration_name)).size !==
    migrations.length
  ) {
    fail("RECOVERY_SET_SCHEMA_STATE_INVALID");
  }
  return migrations;
}

export function buildCompanyRecoveryManifest(input) {
  validateSlug(input.companySlug);
  validateImageDigest(input.backendDigest);
  validateImageDigest(input.frontendDigest);
  if (
    typeof input.database !== "string" ||
    !/^[A-Za-z0-9_]+$/u.test(input.database)
  ) {
    fail("RECOVERY_SET_DATABASE_INVALID");
  }
  const postgresManifest = validateComponentManifest({
    kind: "postgresql",
    value: input.postgresManifest,
    companySlug: input.companySlug,
    database: input.database,
  });
  const objectManifest = validateComponentManifest({
    kind: "object-storage",
    value: input.objectManifest,
    companySlug: input.companySlug,
    database: input.database,
  });
  const schemaMigrations = normalizeSchemaState(input.schemaState);
  if (
    typeof input.postgresManifestRaw !== "string" ||
    sha256(input.postgresManifestRaw) !== input.postgresManifestSha256 ||
    typeof input.objectManifestRaw !== "string" ||
    sha256(input.objectManifestRaw) !== input.objectManifestSha256
  ) {
    fail("RECOVERY_SET_COMPONENT_MANIFEST_CHECKSUM_INVALID");
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!validTimestamp(createdAt)) fail("RECOVERY_SET_TIMESTAMP_INVALID");
  const schemaPayload = JSON.stringify(schemaMigrations);
  return {
    format: "mte-company-recovery-set/v1",
    company_slug: input.companySlug,
    created_at: new Date(createdAt).toISOString(),
    validated_at: new Date().toISOString(),
    release_digests: {
      backend: input.backendDigest,
      frontend: input.frontendDigest,
    },
    schema_state: {
      migration_count: schemaMigrations.length,
      sha256: sha256(schemaPayload),
      migrations: schemaMigrations,
    },
    postgresql: {
      database: input.database,
      key: postgresManifest.key,
      manifest_key: postgresManifest.manifest_key,
      manifest_sha256: input.postgresManifestSha256,
      created_at: postgresManifest.created_at,
      size_bytes: postgresManifest.size_bytes,
      sha256: postgresManifest.sha256,
    },
    object_storage: {
      source_bucket: objectManifest.source_bucket,
      key: objectManifest.key,
      manifest_key: objectManifest.manifest_key,
      manifest_sha256: input.objectManifestSha256,
      created_at: objectManifest.created_at,
      size_bytes: objectManifest.size_bytes,
      sha256: objectManifest.sha256,
    },
  };
}

export function verifyCompanyRecoveryIdentity({
  manifestRaw,
  checksumRaw,
  expectedCompany,
}) {
  if (
    typeof manifestRaw !== "string" ||
    typeof checksumRaw !== "string" ||
    checksumRaw.trim().length === 0
  ) {
    fail("RECOVERY_SET_MANIFEST_OR_CHECKSUM_MISSING");
  }
  const checksum = checksumRaw.trim().split(/\s+/u)[0];
  if (!/^[a-f0-9]{64}$/u.test(checksum) || sha256(manifestRaw) !== checksum) {
    fail("RECOVERY_SET_MANIFEST_CHECKSUM_INVALID");
  }
  const manifest = parseJson(manifestRaw, "RECOVERY_SET_MANIFEST_INVALID");
  validateSlug(expectedCompany);
  if (manifest?.company_slug !== expectedCompany) {
    fail("RECOVERY_SET_COMPANY_MISMATCH");
  }
  if (manifest.format !== "mte-company-recovery-set/v1") {
    fail("RECOVERY_SET_FORMAT_UNSUPPORTED");
  }
  if (
    !validTimestamp(manifest.created_at) ||
    !validTimestamp(manifest.validated_at)
  ) {
    fail("RECOVERY_SET_TIMESTAMP_INVALID");
  }
  return manifest;
}

export function verifyCompanyObjectManifest({
  manifestRaw,
  checksumRaw,
  expectedCompany,
  archivePath,
}) {
  if (
    typeof manifestRaw !== "string" ||
    typeof checksumRaw !== "string" ||
    checksumRaw.trim().length === 0
  ) {
    fail("OBJECT_STORAGE_MANIFEST_OR_CHECKSUM_MISSING");
  }
  const checksum = checksumRaw.trim().split(/\s+/u)[0];
  if (!/^[a-f0-9]{64}$/u.test(checksum) || sha256(manifestRaw) !== checksum) {
    fail("OBJECT_STORAGE_MANIFEST_CHECKSUM_INVALID");
  }
  const manifest = parseJson(manifestRaw, "OBJECT_STORAGE_MANIFEST_INVALID");
  validateSlug(expectedCompany);
  if (manifest?.company_slug !== expectedCompany) {
    fail("OBJECT_STORAGE_COMPANY_MISMATCH");
  }
  validateComponentManifest({
    kind: "object-storage",
    value: manifest,
    companySlug: expectedCompany,
    database: "unused",
  });
  if (archivePath) {
    verifyFile(
      archivePath,
      manifest.size_bytes,
      manifest.sha256,
      "OBJECT_STORAGE_ARCHIVE_MISSING",
      "OBJECT_STORAGE_ARCHIVE_CHECKSUM_INVALID",
    );
  }
  return manifest;
}

function verifyFile(path, expectedSize, expectedSha, missingCode, corruptCode) {
  let content;
  let size;
  try {
    content = readFileSync(path);
    size = statSync(path).size;
  } catch {
    fail(missingCode);
  }
  if (size !== expectedSize || sha256(content) !== expectedSha)
    fail(corruptCode);
}

export function verifyCompanyRecoverySet(input) {
  const manifest = verifyCompanyRecoveryIdentity(input);
  validateImageDigest(manifest.release_digests?.backend);
  validateImageDigest(manifest.release_digests?.frontend);
  const migrations = normalizeSchemaState(manifest.schema_state?.migrations);
  if (manifest.schema_state?.migration_count !== migrations.length) {
    fail("RECOVERY_SET_SCHEMA_STATE_INVALID");
  }
  if (sha256(JSON.stringify(migrations)) !== manifest.schema_state?.sha256) {
    fail("RECOVERY_SET_SCHEMA_CHECKSUM_INVALID");
  }

  const dbManifest = validateComponentManifest({
    kind: "postgresql",
    value: input.postgresManifest,
    companySlug: manifest.company_slug,
    database: manifest.postgresql?.database,
  });
  const objectManifest = validateComponentManifest({
    kind: "object-storage",
    value: input.objectManifest,
    companySlug: manifest.company_slug,
    database: manifest.postgresql?.database,
  });
  if (
    sha256(input.postgresManifestRaw ?? "") !==
      manifest.postgresql?.manifest_sha256 ||
    sha256(input.objectManifestRaw ?? "") !==
      manifest.object_storage?.manifest_sha256
  ) {
    fail("RECOVERY_SET_COMPONENT_MANIFEST_CHECKSUM_INVALID");
  }
  if (
    dbManifest.key !== manifest.postgresql.key ||
    dbManifest.size_bytes !== manifest.postgresql.size_bytes ||
    dbManifest.sha256 !== manifest.postgresql.sha256 ||
    dbManifest.created_at !== manifest.postgresql.created_at ||
    objectManifest.key !== manifest.object_storage.key ||
    objectManifest.size_bytes !== manifest.object_storage.size_bytes ||
    objectManifest.sha256 !== manifest.object_storage.sha256 ||
    objectManifest.created_at !== manifest.object_storage.created_at ||
    objectManifest.source_bucket !== manifest.object_storage.source_bucket
  ) {
    fail("RECOVERY_SET_COMPONENT_MISMATCH");
  }
  verifyFile(
    input.postgresPath,
    manifest.postgresql.size_bytes,
    manifest.postgresql.sha256,
    "RECOVERY_SET_POSTGRES_ARCHIVE_MISSING",
    "RECOVERY_SET_POSTGRES_CHECKSUM_INVALID",
  );
  verifyFile(
    input.objectStoragePath,
    manifest.object_storage.size_bytes,
    manifest.object_storage.sha256,
    "RECOVERY_SET_OBJECT_ARCHIVE_MISSING",
    "RECOVERY_SET_OBJECT_CHECKSUM_INVALID",
  );
  return manifest;
}

function readChecksum(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail("RECOVERY_SET_MANIFEST_OR_CHECKSUM_MISSING");
  }
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--") || index + 1 >= args.length)
      fail("INVALID_ARGUMENTS");
    values[key.slice(2)] = args[++index];
  }
  return values;
}

function cli() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseArgs(args);
  if (command === "create") {
    const schemaState = readJsonFile(
      options["schema-state"],
      "RECOVERY_SET_SCHEMA_STATE_MISSING",
    );
    const postgresManifest = readJsonFile(
      options["postgres-manifest"],
      "RECOVERY_SET_COMPONENT_MANIFEST_MISSING",
    );
    const objectManifest = readJsonFile(
      options["object-manifest"],
      "RECOVERY_SET_COMPONENT_MANIFEST_MISSING",
    );
    const manifest = buildCompanyRecoveryManifest({
      companySlug: options["company-slug"],
      database: options.database,
      backendDigest: options["backend-digest"],
      frontendDigest: options["frontend-digest"],
      schemaState: schemaState.value,
      postgresManifest: postgresManifest.value,
      postgresManifestRaw: postgresManifest.raw,
      postgresManifestSha256: sha256(postgresManifest.raw),
      objectManifest: objectManifest.value,
      objectManifestRaw: objectManifest.raw,
      objectManifestSha256: sha256(objectManifest.raw),
    });
    const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(options.manifest, manifestRaw, { mode: 0o600 });
    writeFileSync(
      options.checksum,
      `${sha256(manifestRaw)}  ${options.manifest.split("/").at(-1)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(
      JSON.stringify({
        status: "created",
        company_slug: manifest.company_slug,
      }) + "\n",
    );
    return;
  }
  if (command === "verify-identity" || command === "verify") {
    const manifestRaw = readFileSync(options.manifest, "utf8");
    const manifest = verifyCompanyRecoveryIdentity({
      manifestRaw,
      checksumRaw: readChecksum(options.checksum),
      expectedCompany: options["expected-company"],
    });
    if (command === "verify-identity") {
      process.stdout.write(
        JSON.stringify({
          status: "identity-verified",
          company_slug: manifest.company_slug,
        }) + "\n",
      );
      return;
    }
    const postgresManifest = readJsonFile(
      options["postgres-manifest"],
      "RECOVERY_SET_COMPONENT_MANIFEST_MISSING",
    );
    const objectManifest = readJsonFile(
      options["object-manifest"],
      "RECOVERY_SET_COMPONENT_MANIFEST_MISSING",
    );
    const verified = verifyCompanyRecoverySet({
      manifestRaw,
      checksumRaw: readChecksum(options.checksum),
      expectedCompany: options["expected-company"],
      postgresManifest: postgresManifest.value,
      postgresManifestRaw: postgresManifest.raw,
      objectManifest: objectManifest.value,
      objectManifestRaw: objectManifest.raw,
      postgresPath: options.postgres,
      objectStoragePath: options["object-storage"],
    });
    process.stdout.write(
      JSON.stringify({
        status: "verified",
        company_slug: verified.company_slug,
      }) + "\n",
    );
    return;
  }
  if (command === "verify-object") {
    const manifestRaw = readFileSync(options.manifest, "utf8");
    const manifest = verifyCompanyObjectManifest({
      manifestRaw,
      checksumRaw: readChecksum(options.checksum),
      expectedCompany: options["expected-company"],
      ...(options.archive ? { archivePath: options.archive } : {}),
    });
    process.stdout.write(
      JSON.stringify({
        status: "verified",
        company_slug: manifest.company_slug,
      }) + "\n",
    );
    return;
  }
  fail("INVALID_COMMAND");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "COMPANY_RECOVERY_FAILED"}\n`,
    );
    process.exitCode = 1;
  }
}
