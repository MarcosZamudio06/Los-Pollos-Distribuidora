import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("database installs every package scope required by its discovered E2E suites", () => {
  const config = JSON.parse(read("backend/test/jest-e2e.json"));
  const manifest = JSON.parse(read("backend/package.json"));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  const workflow = read(".github/workflows/quality-gate.yml")
    .split("\n  database:")[1]
    .split("\n  functional:")[0];
  assert.ok(workflow.includes("npm ci --prefix backend"));
  for (const file of readdirSync(
    new URL("../backend/test/", import.meta.url),
  )) {
    if (
      !new RegExp(config.testRegex).test(file) ||
      config.testPathIgnorePatterns.some((p) =>
        new RegExp(p).test(`/test/${file}`),
      )
    )
      continue;
    const source = read(`backend/test/${file}`);
    for (const match of source.matchAll(
      /(?:from\s+|import\s*|require\s*\()['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const pkg = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      assert.ok(declared[pkg], `${file}: undeclared backend dependency ${pkg}`);
    }
    if (source.includes("../../frontend/package.json")) {
      assert.ok(
        workflow.includes("npm ci --prefix frontend"),
        `${file}: database must install frontend dependencies`,
      );
      const frontend = JSON.parse(read("frontend/package.json"));
      assert.ok(frontend.dependencies["socket.io-client"]);
    }
  }
});
