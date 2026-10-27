import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
test("patched multipart and parser resolution cannot regress to the vulnerable pins", () => {
  const manifest = JSON.parse(read("backend/package.json"));
  const lock = JSON.parse(read("backend/package-lock.json"));
  assert.equal(manifest.overrides["@nestjs/platform-express"].multer, "2.5.0");
  assert.equal(lock.packages["node_modules/multer"].version, "2.5.0");
  assert.equal(lock.packages["node_modules/body-parser"].version, "2.4.0");
});
