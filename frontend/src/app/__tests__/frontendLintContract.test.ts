import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(testDirectory, "../../..");
const repositoryRoot = resolve(frontendRoot, "..");

describe("frontend lint quality contract", () => {
  it("keeps the canonical frontend script zero-warning and the workflow delegated to it", () => {
    const frontendPackage = JSON.parse(
      readFileSync(resolve(frontendRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const qualityGate = readFileSync(
      resolve(repositoryRoot, ".github/workflows/quality-gate.yml"),
      "utf8",
    );

    expect(frontendPackage.scripts?.lint).toBe("eslint . --max-warnings=0");
    expect(qualityGate).toContain("npm --prefix frontend run lint");
  });

  it("provides a controlled warning fixture for the zero-warning gate", async () => {
    const fixturePath = resolve(
      frontendRoot,
      `.lint-warning-contract-${process.pid}.tsx`,
    );
    writeFileSync(
      fixturePath,
      [
        "export function lintWarningHelper() {",
        '  return "warning";',
        "}",
        "export function LintWarningFixture() {",
        "  return null;",
        "}",
        "",
      ].join("\n"),
    );

    try {
      const eslint = new ESLint({ cwd: frontendRoot });
      const [result] = await eslint.lintFiles([
        relative(frontendRoot, fixturePath),
      ]);

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBeGreaterThan(0);
      expect(result.messages.map((message) => message.ruleId)).toContain(
        "react-refresh/only-export-components",
      );
    } finally {
      unlinkSync(fixturePath);
    }
  });
});
