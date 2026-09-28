#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { once } from "node:events";

const COMPANY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATABASE_PATTERN = /^[A-Za-z0-9_]+$/u;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/u;
const MODEL_GROUPS = [
  {
    input: "companyBranding",
    output: "company_branding",
    keyField: "logoObjectKey",
    mimeField: "logoMimeType",
  },
  {
    input: "deliveryEvidence",
    output: "delivery_evidence",
    keyField: "storageKey",
    mimeField: "mimeType",
    sizeField: "sizeBytes",
    sha256Field: "sha256",
  },
  {
    input: "fiscalArtifacts",
    output: "fiscal_artifacts",
    keyField: "storageKey",
    mimeField: "mimeType",
    sizeField: "byteSize",
    sha256Field: "sha256",
  },
];

function makeGroupCheck() {
  return {
    status: "not_run",
    references: 0,
    objects_present: 0,
    size_verified: 0,
    sha256_verified: 0,
    mime_type_verified: 0,
    failure_counts: {},
  };
}

function makeResult(input = {}) {
  return {
    status: "failed",
    company_slug: typeof input.expectedCompany === "string" ? input.expectedCompany : null,
    restore_database: typeof input.restoreDatabase === "string" ? input.restoreDatabase : null,
    restore_object_storage_bucket: typeof input.targetBucket === "string" ? input.targetBucket : null,
    checks: {
      recovery_set_identity: { status: "not_run" },
      company_branding: makeGroupCheck(),
      delivery_evidence: makeGroupCheck(),
      fiscal_artifacts: makeGroupCheck(),
      storage_reference_integrity: { status: "not_run", references: 0 },
    },
    failure_codes: [],
  };
}

function addFailure(result, groupName, code) {
  const group = result.checks[groupName];
  group.failure_counts[code] = (group.failure_counts[code] ?? 0) + 1;
  result.failure_codes.push(code);
}

function parseSize(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "string" && /^\d+$/u.test(value)) return BigInt(value);
  return null;
}

function safeObjectPath(root, key) {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.includes("\0") ||
    key.includes("\\") ||
    isAbsolute(key) ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }
  const resolvedRoot = resolve(root);
  const objectPath = resolve(resolvedRoot, ...key.split("/"));
  const relativePath = relative(resolvedRoot, objectPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return objectPath;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  stream.on("data", (chunk) => hash.update(chunk));
  await once(stream, "end");
  return hash.digest("hex");
}

function validateIdentity(input, result) {
  const company = input.expectedCompany;
  const recoverySet = input.recoverySet;
  const restoreDatabase = input.restoreDatabase;
  const productionDatabase = input.productionDatabase;
  const sourceDatabase = recoverySet?.postgresql?.database;
  const targetBucket = input.targetBucket;
  const sourceBucket = recoverySet?.object_storage?.source_bucket;

  const failures = [];
  if (typeof company !== "string" || !COMPANY_PATTERN.test(company)) {
    failures.push("EXPECTED_COMPANY_INVALID");
  }
  if (!recoverySet || recoverySet.company_slug !== company) {
    failures.push("RECOVERY_SET_COMPANY_MISMATCH");
  }
  if (
    typeof restoreDatabase !== "string" ||
    !DATABASE_PATTERN.test(restoreDatabase) ||
    !restoreDatabase.endsWith("_restore_drill") ||
    restoreDatabase === productionDatabase ||
    restoreDatabase === sourceDatabase
  ) {
    failures.push("RESTORE_DATABASE_NOT_DISPOSABLE");
  }
  if (
    typeof productionDatabase !== "string" ||
    !DATABASE_PATTERN.test(productionDatabase) ||
    sourceDatabase !== productionDatabase
  ) {
    failures.push("RECOVERY_SET_DATABASE_MISMATCH");
  }
  if (
    typeof targetBucket !== "string" ||
    !/^mte-restore-[a-z0-9]+(?:-[a-z0-9]+)*-\d{14}-\d+$/u.test(targetBucket) ||
    !targetBucket.startsWith(`mte-restore-${company}-`)
  ) {
    failures.push("RESTORE_BUCKET_NOT_COMPANY_DISPOSABLE");
  }
  if (
    typeof sourceBucket !== "string" ||
    sourceBucket.length === 0 ||
    sourceBucket === targetBucket
  ) {
    failures.push("RESTORE_BUCKET_SOURCE_MISMATCH");
  }
  if (typeof input.restoredObjectsDir !== "string" || input.restoredObjectsDir.length === 0) {
    failures.push("RESTORED_OBJECT_DIRECTORY_INVALID");
  }
  return failures;
}

export async function verifyRecoveryStorageReferences(input) {
  const result = makeResult(input);
  const identityFailures = validateIdentity(input, result);
  if (identityFailures.length > 0) {
    result.checks.recovery_set_identity.status = "failed";
    result.failure_codes.push(...identityFailures);
    result.failure_codes = [...new Set(result.failure_codes)].sort();
    return result;
  }
  result.checks.recovery_set_identity.status = "passed";

  if (
    !input.references ||
    !Array.isArray(input.references.companyBranding) ||
    !Array.isArray(input.references.deliveryEvidence) ||
    !Array.isArray(input.references.fiscalArtifacts) ||
    !Array.isArray(input.headObjects)
  ) {
    result.failure_codes.push("DATABASE_REFERENCE_DATA_INVALID");
    result.checks.delivery_evidence.status = "failed";
    result.checks.fiscal_artifacts.status = "failed";
    result.checks.storage_reference_integrity.status = "failed";
    result.failure_codes = [...new Set(result.failure_codes)].sort();
    return result;
  }

  let headIndex = 0;
  for (const {
    input: inputGroup,
    output: outputGroup,
    keyField,
    mimeField,
    sizeField,
    sha256Field,
  } of MODEL_GROUPS) {
    const groupResult = result.checks[outputGroup];
    const records = input.references[inputGroup];
    groupResult.status = "passed";
    for (const record of records) {
      groupResult.references += 1;
      result.checks.storage_reference_integrity.references += 1;
      const headResult = input.headObjects[headIndex] ?? { status: 1, metadata: null };
      headIndex += 1;

      if (outputGroup === "fiscal_artifacts" && record?.status === "AVAILABLE") {
        if (record[sha256Field] === null || record[sha256Field] === undefined || record[sha256Field] === "") {
          addFailure(result, outputGroup, "EXPECTED_SHA256_MISSING");
        }
        if (record[sizeField] === null || record[sizeField] === undefined || record[sizeField] === "") {
          addFailure(result, outputGroup, "EXPECTED_SIZE_MISSING");
        }
        if (record[mimeField] === null || record[mimeField] === undefined || record[mimeField] === "") {
          addFailure(result, outputGroup, "EXPECTED_MIME_TYPE_MISSING");
        }
      }

      const objectPath = safeObjectPath(input.restoredObjectsDir, record?.[keyField]);
      if (objectPath === null) {
        addFailure(result, outputGroup, "STORAGE_KEY_INVALID");
        continue;
      }

      let stat;
      try {
        stat = lstatSync(objectPath, { bigint: true });
      } catch {
        addFailure(result, outputGroup, "OBJECT_FILE_MISSING");
        continue;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) {
        addFailure(result, outputGroup, "OBJECT_FILE_INVALID");
        continue;
      }

      const head = headResult?.status === 0 ? headResult.metadata : null;
      if (!head || typeof head !== "object" || Array.isArray(head)) {
        addFailure(result, outputGroup, "OBJECT_HEAD_FAILED");
      } else {
        groupResult.objects_present += 1;
        const headSize = parseSize(head.ContentLength);
        if (headSize === null || headSize !== stat.size) {
          addFailure(result, outputGroup, "RESTORED_OBJECT_SIZE_MISMATCH");
        }
      }

      const expectedSizeRaw = sizeField ? record[sizeField] ?? null : null;
      if (expectedSizeRaw !== null) {
        const expectedSize = parseSize(expectedSizeRaw);
        if (expectedSize === null) {
          addFailure(result, outputGroup, "EXPECTED_SIZE_INVALID");
        } else if (expectedSize !== stat.size) {
          addFailure(result, outputGroup, "EXPECTED_SIZE_MISMATCH");
        } else {
          groupResult.size_verified += 1;
        }
      }

      const expectedSha256 = sha256Field ? record[sha256Field] : null;
      if (expectedSha256 !== null && expectedSha256 !== undefined) {
        if (typeof expectedSha256 !== "string" || !SHA256_PATTERN.test(expectedSha256)) {
          addFailure(result, outputGroup, "EXPECTED_SHA256_INVALID");
        } else {
          try {
            const actualSha256 = await sha256File(objectPath);
            if (actualSha256 !== expectedSha256.toLowerCase()) {
              addFailure(result, outputGroup, "EXPECTED_SHA256_MISMATCH");
            } else {
              groupResult.sha256_verified += 1;
            }
          } catch {
            addFailure(result, outputGroup, "OBJECT_FILE_UNREADABLE");
          }
        }
      }

      const expectedMimeType = record[mimeField];
      if (expectedMimeType !== null && expectedMimeType !== undefined) {
        if (typeof expectedMimeType !== "string" || expectedMimeType.trim().length === 0) {
          addFailure(result, outputGroup, "EXPECTED_MIME_TYPE_INVALID");
        } else if (
          !head ||
          typeof head.ContentType !== "string" ||
          head.ContentType.trim().toLowerCase() !== expectedMimeType.trim().toLowerCase()
        ) {
          addFailure(result, outputGroup, "MIME_TYPE_MISMATCH");
        } else {
          groupResult.mime_type_verified += 1;
        }
      }
    }
    if (Object.keys(groupResult.failure_counts).length > 0) {
      groupResult.status = "failed";
    }
  }

  if (headIndex !== input.headObjects.length) {
    result.failure_codes.push("HEAD_RESULT_COUNT_MISMATCH");
    result.checks.storage_reference_integrity.status = "failed";
  } else {
    result.checks.storage_reference_integrity.status =
      result.checks.company_branding.status === "passed" &&
      result.checks.delivery_evidence.status === "passed" &&
      result.checks.fiscal_artifacts.status === "passed"
        ? "passed"
        : "failed";
  }
  result.status = result.checks.storage_reference_integrity.status;
  result.failure_codes = [...new Set(result.failure_codes)].sort();
  return result;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || index + 1 >= argv.length) {
      throw new Error("ARGUMENT_INVALID");
    }
    values.set(name.slice(2), argv[index + 1]);
    index += 1;
  }
  return values;
}

function requireArg(args, name) {
  const value = args.get(name);
  if (!value) throw new Error("ARGUMENT_MISSING");
  return value;
}

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(code);
  }
}

function referenceRecords(references) {
  if (
    !references ||
    !Array.isArray(references.companyBranding) ||
    !Array.isArray(references.deliveryEvidence) ||
    !Array.isArray(references.fiscalArtifacts)
  ) {
    throw new Error("DATABASE_REFERENCE_DATA_INVALID");
  }
  return MODEL_GROUPS.flatMap(({ input, keyField }) =>
    references[input].map((record) => ({
      ...record,
      storageKey: record?.[keyField],
    })),
  );
}

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`;
}

function planHeadChecks(args) {
  const references = readJson(requireArg(args, "references"), "DATABASE_REFERENCE_DATA_INVALID");
  const records = referenceRecords(references);
  const bucket = requireArg(args, "bucket");
  const endpoint = requireArg(args, "endpoint");
  const region = requireArg(args, "region");
  const scriptPath = requireArg(args, "script");
  const lines = ["#!/bin/sh", "set -u", "command -v aws >/dev/null 2>&1 || exit 127"];
  for (let index = 0; index < records.length; index += 1) {
    const key = records[index]?.storageKey;
    if (typeof key !== "string" || key.length === 0 || key.includes("\0")) {
      throw new Error("STORAGE_KEY_INVALID");
    }
    const stem = `/backup/reference-head/${index}`;
    const command = [
      "aws s3api head-object",
      "--bucket", shellQuote(bucket),
      "--key", shellQuote(key),
      "--endpoint-url", shellQuote(endpoint),
      "--region", shellQuote(region),
      "--output json",
    ].join(" ");
    lines.push(`if ${command} > ${shellQuote(`${stem}.json`)} 2>/dev/null; then`);
    lines.push(`  printf '%s\\n' 0 > ${shellQuote(`${stem}.status`)}`);
    lines.push("else");
    lines.push(`  printf '%s\\n' 1 > ${shellQuote(`${stem}.status`)}`);
    lines.push("fi");
  }
  writeFileSync(scriptPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(scriptPath, 0o600);
}

async function runVerify(args) {
  const recoverySet = readJson(requireArg(args, "recovery-set"), "RECOVERY_SET_MANIFEST_INVALID");
  const references = readJson(requireArg(args, "references"), "DATABASE_REFERENCE_DATA_INVALID");
  const records = referenceRecords(references);
  const headDirectory = requireArg(args, "head-directory");
  const headObjects = records.map((_, index) => {
    let status = 1;
    let metadata = null;
    try {
      status = Number(readFileSync(resolve(headDirectory, `${index}.status`), "utf8").trim());
      if (status === 0) metadata = readJson(resolve(headDirectory, `${index}.json`), "OBJECT_HEAD_INVALID");
    } catch {
      status = 1;
    }
    return { status, metadata };
  });
  const result = await verifyRecoveryStorageReferences({
    expectedCompany: requireArg(args, "expected-company"),
    recoverySet,
    restoreDatabase: requireArg(args, "restore-database"),
    productionDatabase: requireArg(args, "production-database"),
    targetBucket: requireArg(args, "target-bucket"),
    restoredObjectsDir: requireArg(args, "restored-objects-dir"),
    references,
    headObjects,
  });
  const outputPath = requireArg(args, "result");
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  chmodSync(outputPath, 0o600);
  return result;
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const args = parseArgs(argv);
  if (command === "plan-head-checks") {
    planHeadChecks(args);
    return 0;
  }
  if (command === "verify") {
    const result = await runVerify(args);
    if (result.status !== "passed") {
      process.stderr.write(`Recovery storage-reference verification failed: ${result.failure_codes.join(",")}\n`);
      return 1;
    }
    process.stdout.write("Recovery storage-reference verification passed.\n");
    return 0;
  }
  process.stderr.write("Recovery storage-reference verifier command is invalid.\n");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const code = typeof error?.message === "string" && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : "RECOVERY_STORAGE_VERIFICATION_FAILED";
      process.stderr.write(`${code}\n`);
      process.exitCode = 2;
    });
}
