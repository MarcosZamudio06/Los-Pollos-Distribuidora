import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const isolated = [
  "erp-functional-p1.e2e-spec.ts",
  "erp-functional-remediation-002.e2e-spec.ts",
  "erp-functional-remediation-002.browser.e2e-spec.ts",
];
test("standard discovery preserves traditional tests and excludes only runner-owned suites", () => {
  const config = JSON.parse(read("backend/test/jest-e2e.json"));
  for (const file of isolated) {
    assert.ok(
      config.testPathIgnorePatterns?.some((pattern) =>
        new RegExp(pattern).test(`/test/${file}`),
      ),
      file,
    );
  }
  assert.ok(
    !config.testPathIgnorePatterns.some((pattern) =>
      new RegExp(pattern).test("/test/operational-day.e2e-spec.ts"),
    ),
  );
  const dedicated = JSON.parse(read("backend/test/jest-functional.json"));
  for (const file of isolated)
    assert.match(file, new RegExp(dedicated.testRegex));
});
test("isolated runners use exactly one dedicated Jest configuration", () => {
  const pkg = JSON.parse(read("backend/package.json"));
  assert.equal(
    pkg.scripts["test:e2e:functional"],
    "jest --config ./test/jest-functional.json",
  );
  assert.equal(
    pkg.scripts["pretest:e2e:functional"],
    pkg.scripts["pretest:e2e"],
  );
  for (const name of ["p1", "remediation-002"]) {
    assert.match(
      read(`scripts/test-erp-functional-${name}.sh`),
      /run test:e2e:functional -- --runInBand/,
    );
  }
});
test("every permanent functional runner remains mandatory in CI Gate", () => {
  const workflow = read(".github/workflows/quality-gate.yml");
  for (const runner of [
    "p1",
    "remediation-002",
    "remediation-003",
    "remediation-004",
    "remediation-005",
  ]) {
    assert.ok(
      workflow.includes(`bash scripts/test-erp-functional-${runner}.sh`),
      runner,
    );
  }
  assert.match(workflow, /REM002_BROWSER: "true"/);
  assert.match(workflow, /REM003_BROWSER: "true"/);
  assert.match(workflow, /REM003_RESISTANCE_SECONDS: "600"/);
  assert.match(workflow, /needs: \[[^\]]*functional[^\]]*\]/);
  assert.match(
    workflow,
    /FUNCTIONAL_RESULT: \$\{\{ needs.functional.result \}\}/,
  );
  assert.match(workflow, /test "\$FUNCTIONAL_RESULT" = "success"/);
  assert.ok(!workflow.includes("continue-on-error"));
});

test("functional GIS paths are appended to GITHUB_ENV without changing values", () => {
  const workflow = read(".github/workflows/quality-gate.yml");
  const block = workflow.match(
    /- name: Select run-owned GIS fixture paths\n\s+run: \|\n([\s\S]*?)(?=\n      - name:)/u,
  );
  assert.ok(block);
  const temporary = mkdtempSync(join(tmpdir(), "quality-env-contract-"));
  try {
    const destination = join(temporary, "environment file");
    const runner = `${temporary}/runner path`;
    writeFileSync(destination, "existing=value\n");
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", block[1]], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        RUNNER_TEMP: runner,
        GITHUB_ENV: destination,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(destination, "utf8"),
      [
        "existing=value",
        `REM003_CI_EVIDENCE_DIR=${runner}/rem003-diagnostics`,
        `REM003_GIS_DIR=${runner}/functional-gis`,
        `REM004_GIS_DIR=${runner}/functional-gis`,
        `REM004_RENDERING_DIR=${runner}/functional-rendering`,
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
test("patched multipart and parser resolution cannot regress to the vulnerable pins", () => {
  const manifest = JSON.parse(read("backend/package.json"));
  const lock = JSON.parse(read("backend/package-lock.json"));
  assert.equal(manifest.overrides["@nestjs/platform-express"].multer, "2.5.0");
  assert.equal(lock.packages["node_modules/multer"].version, "2.5.0");
  assert.equal(lock.packages["node_modules/body-parser"].version, "2.4.0");
});
