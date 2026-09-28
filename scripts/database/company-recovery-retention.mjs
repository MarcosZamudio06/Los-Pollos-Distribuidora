#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  verifyCompanyObjectManifest,
  verifyCompanyRecoveryIdentity,
  verifyCompanyRecoverySetManifests,
  verifyPostgresComponentManifest,
} from "./company-recovery-manifest.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RECOVERY_KEY =
  /^recovery-sets\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-\d+-\d+)\.manifest\.json$/u;
const POSTGRES_SCOPED_MANIFEST_KEY =
  /^postgres\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-\d+-\d+)\.manifest\.json$/u;
const POSTGRES_LEGACY_MANIFEST_KEY =
  /^postgres\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.manifest\.json$/u;
const OBJECT_MANIFEST_KEY =
  /^object-storage\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-\d+-\d+)\.tar\.gz\.manifest\.json$/u;

function fail(code) {
  throw new Error(code);
}

function assertSlug(value) {
  if (typeof value !== "string" || !SLUG.test(value)) {
    fail("RECOVERY_RETENTION_COMPANY_INVALID");
  }
}

function readJson(path, code = "RECOVERY_RETENTION_INPUT_INVALID") {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(code);
  }
}

function companyFromRecoveryKey(key) {
  const match = RECOVERY_KEY.exec(key ?? "");
  if (!match) fail("RECOVERY_RETENTION_SET_KEY_INVALID");
  return match[1];
}

function validateRetentionCount(name, count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    fail("RECOVERY_RETENTION_COUNT_INVALID");
  }
  return count;
}

function assertValidSelectionItem({ manifestKey, manifest }) {
  const keyCompany = companyFromRecoveryKey(manifestKey);
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.company_slug !== keyCompany ||
    !Number.isFinite(Date.parse(manifest.created_at))
  ) {
    fail("RECOVERY_RETENTION_SET_INVALID");
  }
  return {
    manifestKey,
    companySlug: keyCompany,
    createdAt: new Date(manifest.created_at).toISOString(),
    manifest,
  };
}

function isoWeekKey(value) {
  const date = new Date(value);
  const weekday = (date.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - weekday,
  );
  const thursday = new Date(monday + 3 * 86_400_000);
  const isoYear = thursday.getUTCFullYear();
  const januaryFourth = Date.UTC(isoYear, 0, 4);
  const januaryFourthWeekday =
    (new Date(januaryFourth).getUTCDay() + 6) % 7;
  const firstMonday = januaryFourth - januaryFourthWeekday * 86_400_000;
  const week = Math.floor((monday - firstMonday) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function retentionGroup(record, window) {
  const date = new Date(record.createdAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (window === "daily") return `${year}-${month}-${day}`;
  if (window === "weekly") return isoWeekKey(record.createdAt);
  return `${year}-${month}`;
}

function newestFirst(left, right) {
  return (
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    right.manifestKey.localeCompare(left.manifestKey)
  );
}

export function selectRecoverySetRetention({
  companySlug,
  recoverySets,
  daily,
  weekly,
  monthly,
}) {
  assertSlug(companySlug);
  const limits = {
    daily: validateRetentionCount("daily", daily),
    weekly: validateRetentionCount("weekly", weekly),
    monthly: validateRetentionCount("monthly", monthly),
  };
  if (!Array.isArray(recoverySets)) fail("RECOVERY_RETENTION_SET_INVALID");
  const targetSets = recoverySets
    .map(assertValidSelectionItem)
    .filter((record) => record.companySlug === companySlug)
    .sort(newestFirst);
  if (new Set(targetSets.map(({ manifestKey }) => manifestKey)).size !== targetSets.length) {
    fail("RECOVERY_RETENTION_SET_DUPLICATE");
  }

  const retained = new Set();
  if (targetSets.length > 0) retained.add(targetSets[0].manifestKey);
  for (const window of ["daily", "weekly", "monthly"]) {
    const newestByGroup = new Map();
    for (const record of targetSets) {
      const group = retentionGroup(record, window);
      if (!newestByGroup.has(group)) newestByGroup.set(group, record);
    }
    for (const record of [...newestByGroup.values()].slice(0, limits[window])) {
      retained.add(record.manifestKey);
    }
  }

  return {
    retainedRecoverySetKeys: targetSets
      .filter(({ manifestKey }) => retained.has(manifestKey))
      .map(({ manifestKey }) => manifestKey),
    deletedRecoverySetKeys: targetSets
      .filter(({ manifestKey }) => !retained.has(manifestKey))
      .map(({ manifestKey }) => manifestKey),
  };
}

function componentObjects(kind, component) {
  if (kind === "postgresql") {
    return [component.key, component.manifest_key];
  }
  return [component.key, component.manifest_key, `${component.manifest_key}.sha256`];
}

function verifyRecoveryEntry(entry) {
  if (
    typeof entry?.manifestKey !== "string" ||
    entry.checksumKey !== `${entry.manifestKey}.sha256`
  ) {
    fail("RECOVERY_RETENTION_SET_KEY_INVALID");
  }
  const expectedCompany = companyFromRecoveryKey(entry.manifestKey);
  const manifest = verifyCompanyRecoverySetManifests({
    manifestRaw: entry.manifestRaw,
    checksumRaw: entry.checksumRaw,
    expectedCompany,
    postgresManifestRaw: entry.postgresManifestRaw,
    objectManifestRaw: entry.objectManifestRaw,
  });
  const objectManifest = verifyCompanyObjectManifest({
    manifestRaw: entry.objectManifestRaw,
    checksumRaw: entry.objectChecksumRaw,
    expectedCompany,
  });
  if (
    manifest.postgresql.key !== JSON.parse(entry.postgresManifestRaw).key ||
    manifest.object_storage.key !== objectManifest.key
  ) {
    fail("RECOVERY_RETENTION_SET_COMPONENT_MISMATCH");
  }
  return {
    manifestKey: entry.manifestKey,
    checksumKey: entry.checksumKey,
    companySlug: expectedCompany,
    createdAt: manifest.created_at,
    manifest,
    postgresql: manifest.postgresql,
    objectStorage: manifest.object_storage,
  };
}

function verifyComponentInventoryEntry(entry, companySlug) {
  if (!entry || !["postgresql", "object-storage"].includes(entry.kind)) {
    fail("RECOVERY_RETENTION_COMPONENT_INVALID");
  }
  const raw = entry.manifestRaw;
  if (entry.kind === "postgresql") {
    const match = POSTGRES_SCOPED_MANIFEST_KEY.exec(entry.manifestKey ?? "");
    if (!match || match[1] !== companySlug) {
      fail("RECOVERY_RETENTION_COMPONENT_SCOPE_INVALID");
    }
    const manifest = verifyPostgresComponentManifest({
      manifestRaw: raw,
      companySlug,
      expectedManifestKey: entry.manifestKey,
      requireCompanySlug: true,
    });
    if (manifest.key !== entry.manifestKey.replace(/\.manifest\.json$/u, ".dump")) {
      fail("RECOVERY_RETENTION_COMPONENT_INVALID");
    }
    return { kind: entry.kind, companySlug, manifest };
  }

  const match = OBJECT_MANIFEST_KEY.exec(entry.manifestKey ?? "");
  if (!match || match[1] !== companySlug) {
    fail("RECOVERY_RETENTION_COMPONENT_SCOPE_INVALID");
  }
  const manifest = verifyCompanyObjectManifest({
    manifestRaw: raw,
    checksumRaw: entry.checksumRaw,
    expectedCompany: companySlug,
  });
  if (
    manifest.manifest_key !== entry.manifestKey ||
    manifest.key !== entry.manifestKey.replace(/\.manifest\.json$/u, "")
  ) {
    fail("RECOVERY_RETENTION_COMPONENT_INVALID");
  }
  return { kind: entry.kind, companySlug, manifest };
}

export function buildCompanyRecoveryRetentionPlan({
  companySlug,
  expectedRecoverySetKey,
  recoverySets,
  componentManifests,
  daily,
  weekly,
  monthly,
}) {
  assertSlug(companySlug);
  if (!Array.isArray(recoverySets) || !Array.isArray(componentManifests)) {
    fail("RECOVERY_RETENTION_INPUT_INVALID");
  }

  const verifiedSets = recoverySets.map(verifyRecoveryEntry);
  const allKeys = verifiedSets.map(({ manifestKey }) => manifestKey);
  if (new Set(allKeys).size !== allKeys.length) {
    fail("RECOVERY_RETENTION_SET_DUPLICATE");
  }
  const expectedSet = verifiedSets.find(
    ({ manifestKey }) => manifestKey === expectedRecoverySetKey,
  );
  if (!expectedSet || expectedSet.companySlug !== companySlug) {
    fail("RECOVERY_RETENTION_NEW_SET_MISSING");
  }

  const selection = selectRecoverySetRetention({
    companySlug,
    recoverySets: verifiedSets.map((record) => ({
      manifestKey: record.manifestKey,
      manifest: record.manifest,
    })),
    daily,
    weekly,
    monthly,
  });
  const retainedKeys = new Set(selection.retainedRecoverySetKeys);
  // The just-validated point remains protected even if an unexpected newer
  // set appeared between list and plan generation.
  retainedKeys.add(expectedSet.manifestKey);
  const deletedRecoverySetKeys = verifiedSets
    .filter((record) =>
      record.companySlug === companySlug && !retainedKeys.has(record.manifestKey),
    )
    .map(({ manifestKey }) => manifestKey);
  const deletedKeySet = new Set(deletedRecoverySetKeys);

  const referencedObjects = new Set();
  for (const record of verifiedSets) {
    if (deletedKeySet.has(record.manifestKey)) continue;
    for (const key of [
      ...componentObjects("postgresql", record.postgresql),
      ...componentObjects("object-storage", record.objectStorage),
    ]) {
      referencedObjects.add(key);
    }
  }

  const componentObjectKeysToDelete = new Set();
  const addComponentUnlessReferenced = (kind, component) => {
    const keys = componentObjects(kind, component);
    if (keys.some((key) => referencedObjects.has(key))) return;
    for (const key of keys) componentObjectKeysToDelete.add(key);
  };

  for (const record of verifiedSets) {
    if (!deletedKeySet.has(record.manifestKey)) continue;
    addComponentUnlessReferenced("postgresql", record.postgresql);
    addComponentUnlessReferenced("object-storage", record.objectStorage);
  }

  const componentRawByKey = new Map();
  for (const record of verifiedSets) {
    for (const [key, raw] of [
      [record.postgresql.manifest_key, record.manifest.postgresql.manifest_sha256],
      [record.objectStorage.manifest_key, record.manifest.object_storage.manifest_sha256],
    ]) {
      const current = componentRawByKey.get(key);
      if (current && current !== raw) {
        fail("RECOVERY_RETENTION_COMPONENT_MANIFEST_CONFLICT");
      }
      componentRawByKey.set(key, raw);
    }
  }

  const seenInventory = new Map();
  for (const entry of componentManifests) {
    const verified = verifyComponentInventoryEntry(entry, companySlug);
    const key = verified.manifest.manifest_key;
    const existing = seenInventory.get(key);
    if (existing && existing !== entry.manifestRaw) {
      fail("RECOVERY_RETENTION_COMPONENT_MANIFEST_CONFLICT");
    }
    seenInventory.set(key, entry.manifestRaw);
    const expectedDigest = componentRawByKey.get(key);
    if (expectedDigest && expectedDigest !== digest(entry.manifestRaw)) {
      fail("RECOVERY_RETENTION_COMPONENT_MANIFEST_CONFLICT");
    }
    addComponentUnlessReferenced(verified.kind, verified.manifest);
  }

  return {
    companySlug,
    retainedRecoverySetKeys: [...retainedKeys].sort(),
    deletedRecoverySetKeys,
    deleteRecoverySetObjects: deletedRecoverySetKeys.flatMap((key) => [
      key,
      `${key}.sha256`,
    ]),
    deleteComponentObjects: [...componentObjectKeysToDelete].sort(),
  };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith("--") || index + 1 >= args.length) {
      fail("RECOVERY_RETENTION_ARGUMENTS_INVALID");
    }
    options[name.slice(2)] = args[++index];
  }
  return options;
}

export function listKnownRecoveryObjectKeys({ keys, kind, companySlug }) {
  if (!Array.isArray(keys)) fail("RECOVERY_RETENTION_LIST_INVALID");
  let pattern;
  if (kind === "recovery-set") {
    pattern = RECOVERY_KEY;
  } else if (kind === "postgresql") {
    assertSlug(companySlug);
    pattern = new RegExp(
      `^postgres/${companySlug}/\\d{4}/\\d{2}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z-\\d+-\\d+\\.manifest\\.json$`,
      "u",
    );
  } else if (kind === "object-storage") {
    assertSlug(companySlug);
    pattern = new RegExp(
      `^object-storage/${companySlug}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z-\\d+-\\d+\\.tar\\.gz\\.manifest\\.json$`,
      "u",
    );
  } else {
    fail("RECOVERY_RETENTION_KIND_INVALID");
  }
  const knownKeys = keys.filter(
    (key) => typeof key === "string" && pattern.test(key),
  );
  if (new Set(knownKeys).size !== knownKeys.length) {
    fail("RECOVERY_RETENTION_LIST_INVALID");
  }
  return knownKeys.sort();
}

function listKeys({ inputPath, kind, companySlug }) {
  const payload = readJson(inputPath);
  const contents = payload?.Contents ?? [];
  if (!Array.isArray(contents)) fail("RECOVERY_RETENTION_LIST_INVALID");
  return listKnownRecoveryObjectKeys({
    keys: contents.map((item) => item?.Key),
    kind,
    companySlug,
  });
}

function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseArguments(args);
  if (command === "component-keys") {
    const manifestRaw = readFileSync(options.manifest, "utf8");
    const checksumRaw = readFileSync(options.checksum, "utf8");
    const expectedCompany = options["expected-company"];
    const recovery = verifyCompanyRecoveryIdentity({
      manifestRaw,
      checksumRaw,
      expectedCompany,
    });
    const keyCompany = companyFromRecoveryKey(options["manifest-key"]);
    if (keyCompany !== expectedCompany) fail("RECOVERY_RETENTION_SET_KEY_INVALID");
    const postgresManifest = recovery.postgresql?.manifest_key;
    const objectManifest = recovery.object_storage?.manifest_key;
    const postgresKey = recovery.postgresql?.key;
    const objectKey = recovery.object_storage?.key;
    const postgresScope = POSTGRES_SCOPED_MANIFEST_KEY.exec(postgresManifest ?? "");
    const objectScope = OBJECT_MANIFEST_KEY.exec(objectManifest ?? "");
    if (
      typeof postgresManifest !== "string" ||
      typeof objectManifest !== "string" ||
      typeof postgresKey !== "string" ||
      typeof objectKey !== "string"
    ) {
      fail("RECOVERY_RETENTION_SET_COMPONENT_MISMATCH");
    }
    if (
      !(postgresScope || POSTGRES_LEGACY_MANIFEST_KEY.test(postgresManifest)) ||
      !objectScope ||
      (postgresScope && postgresScope[1] !== expectedCompany) ||
      objectScope[1] !== expectedCompany ||
      postgresManifest !== postgresKey.replace(/\.dump$/u, ".manifest.json") ||
      objectManifest !== `${objectKey}.manifest.json`
    ) {
      fail("RECOVERY_RETENTION_SET_COMPONENT_MISMATCH");
    }
    process.stdout.write(JSON.stringify({ postgresManifest, objectManifest }) + "\n");
    return;
  }
  if (command === "list-keys") {
    const keys = listKeys({
      inputPath: options.input,
      kind: options.kind,
      companySlug: options["company-slug"],
    });
    if (keys.length > 0) process.stdout.write(`${keys.join("\n")}\n`);
    return;
  }
  if (command === "plan") {
    const input = readJson(options.input);
    const plan = buildCompanyRecoveryRetentionPlan(input);
    writeFileSync(options.output, `${JSON.stringify(plan, null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write(
      `Recovery-set retention plan validated: ${plan.deletedRecoverySetKeys.length} sets, ${plan.deleteComponentObjects.length} objects eligible.\n`,
    );
    return;
  }
  fail("RECOVERY_RETENTION_COMMAND_INVALID");
}

if (process.argv[1]?.endsWith("company-recovery-retention.mjs")) {
  try {
    runCli();
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]{1,80}$/u.test(error?.message ?? "")
      ? error.message
      : "RECOVERY_RETENTION_FAILED";
    process.stderr.write(`${code || "RECOVERY_RETENTION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
