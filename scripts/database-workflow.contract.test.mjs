import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/quality-gate.yml");
const database = workflow.split("\n  database:")[1].split("\n  functional:")[0];
const step = (name) =>
  database.match(
    new RegExp(
      `      - name: ${name}\\n([\\s\\S]*?)(?=\\n      - name:|$)`,
      "u",
    ),
  )?.[1];

test("database retains both dependency installs, PostGIS and every migration gate", () => {
  for (const command of [
    "npm ci --prefix backend",
    "npm ci --prefix frontend",
    "prisma validate",
    "prisma generate",
    "prisma migrate deploy",
    "prisma migrate status",
  ])
    assert.ok(database.includes(command), command);
  assert.match(database, /image: postgis\/postgis:16-3\.5/u);
  assert.match(database, /E2E_DATABASE_DISPOSABLE: "true"/u);
  assert.match(
    database,
    /run: npm --prefix backend run test:e2e -- --runInBand\s*$/mu,
  );
  assert.doesNotMatch(
    database,
    /--(?:runTestsByPath|testPathIgnorePatterns|testNamePattern)|continue-on-error|--passWithNoTests/u,
  );
  const config = JSON.parse(read("backend/test/jest-e2e.json"));
  assert.match(
    "security-remediation.e2e-spec.ts",
    new RegExp(config.testRegex),
  );
  assert.ok(
    !config.testPathIgnorePatterns.some((p) =>
      new RegExp(p).test("/test/security-remediation.e2e-spec.ts"),
    ),
  );
});

test("database provisions run-owned loopback S3 with bounded readiness before tests", () => {
  assert.match(database, /OBJECT_STORAGE_BUCKET: security-evidence/u);
  assert.match(
    database,
    /OBJECT_STORAGE_ACCESS_KEY_ID: ci001-database-disposable/u,
  );
  assert.match(
    database,
    /OBJECT_STORAGE_SECRET_ACCESS_KEY: ci001-disposable-secret-for-tests-only/u,
  );
  assert.match(database, /OBJECT_STORAGE_FORCE_PATH_STYLE: "true"/u);
  const start = step("Start disposable database Object Storage");
  assert.ok(start, "database must provision its own S3 service");
  assert.match(start, /--publish 127\.0\.0\.1::9000/u);
  assert.match(start, /--tmpfs \/data:rw/u);
  assert.match(
    start,
    /--label "ci001\.database\.storage=\$CI001_S3_CONTAINER"/u,
  );
  assert.match(start, /@sha256:[0-9a-f]{64}/u);
  assert.match(start, /seq 1 30/u);
  assert.match(start, /--connect-timeout 1 --max-time 2/u);
  assert.match(start, /minio\/health\/ready/u);
  assert.match(start, /test "\$ready" = true/u);
  assert.match(
    start,
    /OBJECT_STORAGE_ENDPOINT=.*OBJECT_STORAGE_PUBLIC_ENDPOINT=[\s\S]*GITHUB_ENV/u,
  );
  assert.ok(
    database.indexOf("Start disposable database Object Storage") <
      database.indexOf("Prepare security evidence bucket"),
  );
  assert.ok(
    database.indexOf("Prepare security evidence bucket") <
      database.indexOf("Run integration tests"),
  );
});

test("bucket readiness uses authenticated SDK checks and a closed disposable boundary", () => {
  const prepare = step("Prepare security evidence bucket");
  assert.match(
    prepare ?? "",
    /npm --prefix backend exec -- ts-node backend\/scripts\/prepare-ci001-object-storage\.ts/u,
  );
  const source = read("backend/scripts/prepare-ci001-object-storage.ts");
  for (const marker of [
    "127.0.0.1",
    "security-evidence",
    "E2E_DATABASE_DISPOSABLE",
    "ci001-database-disposable",
    "ci001-disposable-secret-for-tests-only",
    "CreateBucketCommand",
    "HeadBucketCommand",
    "client.destroy()",
  ])
    assert.ok(source.includes(marker), marker);
  assert.doesNotMatch(source, /process\.env\.AWS_|fromIni|defaultProvider/u);
  const security = read("backend/test/security-remediation.e2e-spec.ts");
  assert.match(
    security,
    /if \(!\(error instanceof BucketAlreadyOwnedByYou\)\) throw error;/u,
  );
  assert.match(
    security,
    /client\.send\(new HeadBucketCommand\(\{ Bucket \}\)\)/u,
  );
  for (const operation of [
    "PutObjectCommand",
    "GetObjectCommand",
    "DeleteObjectCommand",
  ])
    assert.ok(security.includes(operation));
});

test("cleanup runs after failed tests and cannot remove unrelated containers", () => {
  const cleanup = step("Remove disposable database Object Storage");
  assert.ok(cleanup, "database cleanup must be explicit");
  assert.match(cleanup, /if: always\(\)/u);
  assert.match(cleanup, /ci001\.database\.storage/u);
  assert.match(cleanup, /test "\$owner" = "\$CI001_S3_CONTAINER"/u);
  assert.match(cleanup, /docker rm --force "\$id"/u);
  assert.doesNotMatch(cleanup, /prune|volume rm|\|\| true/u);
  assert.ok(
    database.indexOf("Remove disposable database Object Storage") >
      database.indexOf("Run integration tests"),
  );
});

test("database validates its dependency contracts and CI Gate still requires every job", () => {
  assert.ok(
    database.includes(
      "node --test scripts/ci003-evidence-runner.contract.test.mjs",
    ),
  );
  assert.match(
    database,
    /run: bash scripts\/test-ci003-evidence-concurrency\.sh\s*$/mu,
  );
  assert.ok(
    database.includes("node --test scripts/e2e-install.contract.test.mjs"),
  );
  assert.ok(
    database.includes(
      "node --test scripts/database-workflow.contract.test.mjs",
    ),
  );
  const gate = workflow.split("\n  gate:")[1];
  for (const job of [
    "quality",
    "database",
    "functional",
    "browser",
    "docker",
    "security",
    "isolation",
    "disaster-recovery",
  ])
    assert.match(gate, new RegExp(`needs: \\[[^\\]]*${job}[^\\]]*\\]`, "u"));
  assert.match(gate, /if: always\(\)/u);
  assert.match(gate, /test "\$DATABASE_RESULT" = "success"/u);
});

function runShell(name, docker, curl) {
  const dir = mkdtempSync(join(tmpdir(), "ci001-contract-"));
  try {
    for (const [command, body] of Object.entries({
      docker,
      curl: curl ?? "exit 0",
      sleep: "exit 0",
    }))
      writeFileSync(join(dir, command), `#!/bin/sh\n${body}\n`, {
        mode: 0o755,
      });
    const trace = join(dir, "trace");
    const environment = join(dir, "environment");
    writeFileSync(trace, "");
    writeFileSync(environment, "");
    const script = step(name)?.split("run: |\n")[1];
    assert.ok(script, name);
    const result = spawnSync("/bin/bash", ["-euo", "pipefail", "-c", script], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        CI001_S3_CONTAINER: "ci001-database-s3-fixture",
        OBJECT_STORAGE_ACCESS_KEY_ID: "synthetic",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "synthetic",
        GITHUB_ENV: environment,
        TRACE: trace,
      },
    });
    return {
      ...result,
      trace: readFileSync(trace, "utf8"),
      environment: readFileSync(environment, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("failed readiness cannot export an endpoint or silently proceed to E2E", () => {
  const result = runShell(
    "Start disposable database Object Storage",
    `
case "$1" in
  run) echo fixture ;;
  port) echo 127.0.0.1:19000 ;;
  inspect) echo true ;;
  *) exit 99 ;;
esac`,
    'echo probe >> "$TRACE"; exit 22',
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.trace.trim().split("\n").length, 30);
  assert.equal(result.environment, "");
});

for (const [owner, expected] of [
  ["ci001-database-s3-fixture", 0],
  ["unrelated-container", 1],
]) {
  test(`cleanup enforces container ownership (${owner})`, () => {
    const result = runShell(
      "Remove disposable database Object Storage",
      `
case "$1" in
  ps) echo fixture-container-id ;;
  inspect) echo '${owner}' ;;
  rm) echo "removed $*" >> "$TRACE" ;;
  *) exit 99 ;;
esac`,
    );
    assert.equal(result.status, expected, result.stderr);
    assert.equal(
      result.trace.includes("rm --force fixture-container-id"),
      expected === 0,
    );
  });
}

test("Docker inspection failure is reported, never swallowed as successful cleanup", () => {
  const result = runShell(
    "Remove disposable database Object Storage",
    "exit 42",
  );
  assert.equal(result.status, 42);
  assert.equal(result.trace, "");
});
