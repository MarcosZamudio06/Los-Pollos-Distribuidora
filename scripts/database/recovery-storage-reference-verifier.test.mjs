import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import { verifyRecoveryStorageReferences } from "./recovery-storage-reference-verifier.mjs";

const temporaryDirectories = [];

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "recovery-storage-check-"));
  temporaryDirectories.push(root);
  const body = Buffer.from("valid evidence bytes");
  const key = "evidence/2026/09/27/order-1/evidence-1.jpg";
  const objectPath = join(root, key);
  mkdirSync(join(root, "evidence/2026/09/27/order-1"), { recursive: true });
  writeFileSync(objectPath, body);

  const input = {
    expectedCompany: "company-north",
    recoverySet: {
      company_slug: "company-north",
      postgresql: { database: "company_north" },
      object_storage: { source_bucket: "company-north-production" },
    },
    restoreDatabase: "company_north_restore_drill",
    productionDatabase: "company_north",
    targetBucket: "mte-restore-company-north-20260927120000-4321",
    restoredObjectsDir: root,
    references: {
      companyBranding: [],
      deliveryEvidence: [
        {
          storageKey: key,
          mimeType: "image/jpeg",
          sha256: createHash("sha256").update(body).digest("hex"),
          sizeBytes: body.length,
        },
      ],
      fiscalArtifacts: [],
    },
    headObjects: [
      {
        status: 0,
        metadata: { ContentLength: body.length, ContentType: "image/jpeg" },
      },
    ],
  };

  return { body, key, objectPath, root, input: { ...input, ...overrides } };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runVerifyCli(input, root, targetMode) {
  const recoverySetFile = join(root, "cli-recovery-set.json");
  const referencesFile = join(root, "cli-references.json");
  const headDirectory = join(root, "cli-heads");
  const resultFile = join(root, "cli-result.json");
  mkdirSync(headDirectory, { recursive: true });
  writeFileSync(recoverySetFile, JSON.stringify(input.recoverySet));
  writeFileSync(referencesFile, JSON.stringify(input.references));
  input.headObjects.forEach((head, index) => {
    writeFileSync(join(headDirectory, `${index}.status`), `${head.status}\n`);
    if (head.metadata !== null) {
      writeFileSync(join(headDirectory, `${index}.json`), JSON.stringify(head.metadata));
    }
  });

  const args = [
    new URL("./recovery-storage-reference-verifier.mjs", import.meta.url).pathname,
    "verify",
    "--expected-company", input.expectedCompany,
    "--recovery-set", recoverySetFile,
    "--restore-database", input.restoreDatabase,
    "--production-database", input.productionDatabase,
    "--target-bucket", input.targetBucket,
    "--restored-objects-dir", input.restoredObjectsDir,
    "--references", referencesFile,
    "--head-directory", headDirectory,
    "--result", resultFile,
  ];
  if (targetMode !== undefined) args.push("--target-mode", targetMode);
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { ...run, result: run.status === 2 ? null : JSON.parse(readFileSync(resultFile, "utf8")) };
}

test("CLI accepts replacement targets only when target-mode is replacement", () => {
  const { input, root } = fixture({
    restoreDatabase: "company_north_replacement",
    targetBucket: "mte-replacement-company-north-20260927120000-4321",
  });
  const run = runVerifyCli(input, root, "replacement");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.result.status, "passed");
});

test("CLI defaults to drill when target-mode is absent", () => {
  const { input, root } = fixture();
  const run = runVerifyCli(input, root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.result.status, "passed");
});

test("CLI drill mode rejects replacement targets", () => {
  const { input, root } = fixture({
    restoreDatabase: "company_north_replacement",
    targetBucket: "mte-replacement-company-north-20260927120000-4321",
  });
  const run = runVerifyCli(input, root, "drill");
  assert.equal(run.status, 1);
  assert.ok(run.result.failure_codes.includes("RESTORE_DATABASE_NOT_DISPOSABLE"));
  assert.ok(run.result.failure_codes.includes("RESTORE_BUCKET_NOT_COMPANY_DISPOSABLE"));
});

test("CLI rejects an invalid target-mode explicitly", () => {
  const { input, root } = fixture();
  const run = runVerifyCli(input, root, "invalid");
  assert.equal(run.status, 2);
  assert.match(run.stderr, /TARGET_MODE_INVALID/u);
});

test("CLI replacement mode never accepts production database or bucket", () => {
  const { input, root } = fixture({
    restoreDatabase: "company_north_replacement",
    targetBucket: "mte-replacement-company-north-20260927120000-4321",
  });
  const databaseRun = runVerifyCli({ ...input, restoreDatabase: input.productionDatabase }, root, "replacement");
  assert.equal(databaseRun.status, 1);
  assert.ok(databaseRun.result.failure_codes.includes("RESTORE_DATABASE_NOT_DISPOSABLE"));

  const bucketRun = runVerifyCli({ ...input, targetBucket: input.recoverySet.object_storage.source_bucket }, root, "replacement");
  assert.equal(bucketRun.status, 1);
  assert.ok(bucketRun.result.failure_codes.includes("RESTORE_BUCKET_NOT_COMPANY_DISPOSABLE"));
});

test("fails when a persisted storageKey is absent from the restored disposable bucket", async () => {
  const { objectPath, input } = fixture();
  rmSync(objectPath);

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.equal(result.checks.delivery_evidence.status, "failed");
  assert.ok(result.failure_codes.includes("OBJECT_FILE_MISSING"));
});

test("accepts only explicitly named new replacement targets in replacement mode", async () => {
  const { input } = fixture({
    targetMode: "replacement",
    restoreDatabase: "company_north_replacement",
    targetBucket: "mte-replacement-company-north-20260927120000-4321",
  });
  const passed = await verifyRecoveryStorageReferences(input);
  assert.equal(passed.status, "passed");

  const originalDatabase = await verifyRecoveryStorageReferences({
    ...input,
    restoreDatabase: "company_north",
  });
  assert.equal(originalDatabase.status, "failed");
  const originalBucket = await verifyRecoveryStorageReferences({
    ...input,
    targetBucket: "company-north-production",
  });
  assert.equal(originalBucket.status, "failed");
  const drillOnly = await verifyRecoveryStorageReferences({
    ...input,
    targetMode: "drill",
  });
  assert.equal(drillOnly.status, "failed");
});

test("detects restored object bytes corrupted after the recovery archive was verified", async () => {
  const { body, objectPath, input } = fixture();
  const corrupted = Buffer.from(body);
  corrupted[0] ^= 0xff;
  writeFileSync(objectPath, corrupted);
  input.headObjects[0].metadata.ContentLength = corrupted.length;

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.ok(result.failure_codes.includes("EXPECTED_SHA256_MISMATCH"));
});

test("fails when the PostgreSQL checksum does not match the restored object", async () => {
  const { input } = fixture();
  input.references.deliveryEvidence[0].sha256 = "0".repeat(64);

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.ok(result.failure_codes.includes("EXPECTED_SHA256_MISMATCH"));
});

test("fails when the persisted expected size differs from both the restored object and its head metadata", async () => {
  const { input } = fixture();
  input.references.deliveryEvidence[0].sizeBytes += 1;

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.ok(result.failure_codes.includes("EXPECTED_SIZE_MISMATCH"));
});

test("passes a valid delivery evidence reference only after object, size, SHA-256, and MIME checks", async () => {
  const { input } = fixture();

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "passed");
  assert.equal(result.checks.delivery_evidence.status, "passed");
  assert.equal(result.checks.delivery_evidence.references, 1);
  assert.equal(result.checks.delivery_evidence.sha256_verified, 1);
  assert.equal(result.checks.delivery_evidence.size_verified, 1);
  assert.equal(result.checks.delivery_evidence.mime_type_verified, 1);
  assert.equal(result.checks.fiscal_artifacts.status, "passed");
  assert.equal(result.checks.fiscal_artifacts.references, 0);
});

test("checks an AVAILABLE FiscalArtifact using its persisted byteSize, sha256, and mimeType", async () => {
  const { body, input } = fixture();
  input.references.deliveryEvidence = [];
  input.references.fiscalArtifacts = [
    {
      storageKey: "fiscal/invoice-1/xml/v1.xml",
      status: "AVAILABLE",
      mimeType: "application/xml",
      sha256: createHash("sha256").update(body).digest("hex"),
      byteSize: String(body.length),
    },
  ];
  const fiscalPath = join(input.restoredObjectsDir, "fiscal/invoice-1/xml/v1.xml");
  mkdirSync(join(input.restoredObjectsDir, "fiscal/invoice-1/xml"), { recursive: true });
  writeFileSync(fiscalPath, body);
  input.headObjects = [
    {
      status: 0,
      metadata: { ContentLength: String(body.length), ContentType: "application/xml" },
    },
  ];

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "passed");
  assert.equal(result.checks.delivery_evidence.references, 0);
  assert.equal(result.checks.fiscal_artifacts.status, "passed");
  assert.equal(result.checks.fiscal_artifacts.references, 1);
  assert.equal(result.checks.fiscal_artifacts.size_verified, 1);
  assert.equal(result.checks.fiscal_artifacts.sha256_verified, 1);
  assert.equal(result.checks.fiscal_artifacts.mime_type_verified, 1);
});

test("checks a CompanyBranding logoObjectKey against the restored bucket and logoMimeType", async () => {
  const { body, input } = fixture();
  const key = "branding/logo/company-logo.png";
  input.references.companyBranding = [{ logoObjectKey: key, logoMimeType: "image/png" }];
  input.references.deliveryEvidence = [];
  const logoPath = join(input.restoredObjectsDir, key);
  mkdirSync(join(input.restoredObjectsDir, "branding/logo"), { recursive: true });
  writeFileSync(logoPath, body);
  input.headObjects = [
    {
      status: 0,
      metadata: { ContentLength: body.length, ContentType: "image/png" },
    },
  ];

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "passed");
  assert.equal(result.checks.company_branding.status, "passed");
  assert.equal(result.checks.company_branding.references, 1);
  assert.equal(result.checks.company_branding.mime_type_verified, 1);
});

test("fails the complete recovery-set check when a CompanyBranding object is absent", async () => {
  const { input } = fixture();
  input.references.deliveryEvidence = [];
  input.references.companyBranding = [
    { logoObjectKey: "branding/logo/missing.png", logoMimeType: "image/png" },
  ];
  input.headObjects = [{ status: 1, metadata: null }];

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.equal(result.checks.company_branding.status, "failed");
  assert.equal(result.checks.storage_reference_integrity.status, "failed");
  assert.ok(result.failure_codes.includes("OBJECT_FILE_MISSING"));
});

test("fails an AVAILABLE FiscalArtifact whose persisted integrity metadata is incomplete", async () => {
  const { body, input } = fixture();
  input.references.deliveryEvidence = [];
  input.references.fiscalArtifacts = [
    {
      storageKey: "fiscal/invoice-1/xml/v1.xml",
      status: "AVAILABLE",
      mimeType: null,
      sha256: null,
      byteSize: null,
    },
  ];
  const key = input.references.fiscalArtifacts[0].storageKey;
  const file = join(input.restoredObjectsDir, key);
  mkdirSync(join(input.restoredObjectsDir, "fiscal/invoice-1/xml"), { recursive: true });
  writeFileSync(file, body);
  input.headObjects = [
    {
      status: 0,
      metadata: { ContentLength: body.length, ContentType: "application/xml" },
    },
  ];

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.equal(result.checks.fiscal_artifacts.status, "failed");
  assert.ok(result.failure_codes.includes("EXPECTED_SHA256_MISSING"));
  assert.ok(result.failure_codes.includes("EXPECTED_SIZE_MISSING"));
  assert.ok(result.failure_codes.includes("EXPECTED_MIME_TYPE_MISSING"));
});

test("rejects a recovery set for another company before reporting model checks as passed", async () => {
  const { input } = fixture();
  input.recoverySet.company_slug = "company-south";

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.equal(result.checks.delivery_evidence.status, "not_run");
  assert.equal(result.checks.fiscal_artifacts.status, "not_run");
  assert.equal(result.checks.company_branding.status, "not_run");
  assert.ok(result.failure_codes.includes("RECOVERY_SET_COMPANY_MISMATCH"));
});

test("fails when stored MIME metadata disagrees with the PostgreSQL reference", async () => {
  const { input } = fixture();
  input.headObjects[0].metadata.ContentType = "image/png";

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.ok(result.failure_codes.includes("MIME_TYPE_MISMATCH"));
});

test("plans read-only HEAD requests with safely quoted keys and without credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "recovery-head-plan-"));
  temporaryDirectories.push(root);
  const referencesFile = join(root, "references.json");
  const scriptFile = join(root, "head-checks.sh");
  writeFileSync(
    referencesFile,
    JSON.stringify({
      deliveryEvidence: [{ storageKey: "evidence/order/quote'file.jpg" }],
      companyBranding: [{ logoObjectKey: "branding/logo.png" }],
      fiscalArtifacts: [],
    }),
  );

  const run = spawnSync(
    process.execPath,
    [
      new URL("./recovery-storage-reference-verifier.mjs", import.meta.url).pathname,
      "plan-head-checks",
      "--references", referencesFile,
      "--bucket", "mte-restore-company-north-20260927120000-4321",
      "--endpoint", "http://object-storage:8333",
      "--region", "us-east-1",
      "--script", scriptFile,
    ],
    { encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const script = readFileSync(scriptFile, "utf8");
  assert.match(script, /--key 'branding\/logo\.png'/u);
  assert.match(script, /--key 'evidence\/order\/quote'\\''file\.jpg'/u);
  assert.doesNotMatch(script, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SECRET/u);
  const syntax = spawnSync("/bin/sh", ["-n", scriptFile], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("writes a non-sensitive JSON result with the checks actually performed", () => {
  const { body, input, key, root } = fixture();
  const recoverySetFile = join(root, "recovery-set.json");
  const referencesFile = join(root, "references.json");
  const headDirectory = join(root, "heads");
  const resultFile = join(root, "result.json");
  mkdirSync(headDirectory, { recursive: true });
  writeFileSync(recoverySetFile, JSON.stringify(input.recoverySet));
  writeFileSync(
    referencesFile,
    JSON.stringify({
      companyBranding: [],
      deliveryEvidence: input.references.deliveryEvidence,
      fiscalArtifacts: [],
    }),
  );
  writeFileSync(join(headDirectory, "0.status"), "0\n");
  writeFileSync(
    join(headDirectory, "0.json"),
    JSON.stringify({ ContentLength: body.length, ContentType: "image/jpeg" }),
  );

  const run = spawnSync(
    process.execPath,
    [
      new URL("./recovery-storage-reference-verifier.mjs", import.meta.url).pathname,
      "verify",
      "--expected-company", input.expectedCompany,
      "--recovery-set", recoverySetFile,
      "--restore-database", input.restoreDatabase,
      "--production-database", input.productionDatabase,
      "--target-bucket", input.targetBucket,
      "--restored-objects-dir", input.restoredObjectsDir,
      "--references", referencesFile,
      "--head-directory", headDirectory,
      "--result", resultFile,
    ],
    { encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  assert.equal(result.status, "passed");
  assert.equal(result.checks.delivery_evidence.references, 1);
  assert.equal(result.checks.delivery_evidence.sha256_verified, 1);
  assert.equal(result.checks.company_branding.status, "passed");
  assert.equal(result.checks.fiscal_artifacts.status, "passed");
  assert.equal(result.checks.storage_reference_integrity.status, "passed");
  assert.ok(!JSON.stringify(result).includes(key));
});

test("writes failure evidence and exits nonzero when a production database is selected", () => {
  const { body, input, root } = fixture();
  const recoverySetFile = join(root, "production-target-recovery-set.json");
  const referencesFile = join(root, "production-target-references.json");
  const headDirectory = join(root, "production-target-heads");
  const resultFile = join(root, "production-target-result.json");
  mkdirSync(headDirectory, { recursive: true });
  writeFileSync(recoverySetFile, JSON.stringify(input.recoverySet));
  writeFileSync(
    referencesFile,
    JSON.stringify({ companyBranding: [], deliveryEvidence: [], fiscalArtifacts: [] }),
  );
  writeFileSync(join(headDirectory, "unused.status"), "0\n");
  writeFileSync(join(headDirectory, "unused.json"), JSON.stringify({ ContentLength: body.length }));

  const run = spawnSync(
    process.execPath,
    [
      new URL("./recovery-storage-reference-verifier.mjs", import.meta.url).pathname,
      "verify",
      "--expected-company", input.expectedCompany,
      "--recovery-set", recoverySetFile,
      "--restore-database", input.productionDatabase,
      "--production-database", input.productionDatabase,
      "--target-bucket", input.targetBucket,
      "--restored-objects-dir", input.restoredObjectsDir,
      "--references", referencesFile,
      "--head-directory", headDirectory,
      "--result", resultFile,
    ],
    { encoding: "utf8" },
  );

  assert.equal(run.status, 1);
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  assert.equal(result.status, "failed");
  assert.equal(result.checks.delivery_evidence.status, "not_run");
  assert.equal(result.checks.fiscal_artifacts.status, "not_run");
  assert.equal(result.checks.company_branding.status, "not_run");
  assert.ok(result.failure_codes.includes("RESTORE_DATABASE_NOT_DISPOSABLE"));
});

test("rejects a non-disposable Object Storage target before checking references", async () => {
  const { input } = fixture({ targetBucket: "company-north-production" });

  const result = await verifyRecoveryStorageReferences(input);

  assert.equal(result.status, "failed");
  assert.equal(result.checks.company_branding.status, "not_run");
  assert.equal(result.checks.delivery_evidence.status, "not_run");
  assert.equal(result.checks.fiscal_artifacts.status, "not_run");
  assert.ok(result.failure_codes.includes("RESTORE_BUCKET_NOT_COMPANY_DISPOSABLE"));
});
