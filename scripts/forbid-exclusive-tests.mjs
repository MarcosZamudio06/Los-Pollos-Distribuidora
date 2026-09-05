import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["backend/src", "backend/test", "frontend/src", "frontend/e2e"];
const ignoredDirectories = new Set(["coverage", "dist", "node_modules"]);
const testFilePattern = /(?:\.spec|\.test|\.e2e-spec)\.(?:js|jsx|ts|tsx)$/;
const exclusivePattern =
  /\b(?:describe|it|test)\.(?:only|skip)\s*\(|\b(?:xdescribe|xit|xtest)\s*\(/;

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectTestFiles(path);
    }

    return entry.isFile() &&
      testFilePattern.test(entry.name) &&
      extname(entry.name)
      ? [path]
      : [];
  });
}

const invalidFiles = roots
  .flatMap(collectTestFiles)
  .filter((path) => exclusivePattern.test(readFileSync(path, "utf8")));

if (invalidFiles.length > 0) {
  throw new Error(
    [
      "Focused or skipped tests are not allowed:",
      ...invalidFiles.map((path) => `- ${path}`),
    ].join("\n"),
  );
}
