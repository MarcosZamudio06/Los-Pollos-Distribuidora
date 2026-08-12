import { describe, expect, it } from "vitest";
import {
  BUNDLE_BUDGET_KB,
  getBundleBudgetViolations,
} from "../bundleBudget";

describe("frontend bundle budget", () => {
  it("keeps the entry budget below the Vite warning threshold", () => {
    expect(BUNDLE_BUDGET_KB.entry).toBe(500);
  });

  it("reports entry and async chunks that exceed their budgets", () => {
    const violations = getBundleBudgetViolations([
      {
        fileName: "index.js",
        isEntry: true,
        sizeBytes: 501 * 1024,
      },
      {
        fileName: "cedis.js",
        isEntry: false,
        sizeBytes: 751 * 1024,
      },
    ]);

    expect(violations).toEqual([
      {
        fileName: "index.js",
        limitKb: 500,
        sizeKb: 501,
      },
      {
        fileName: "cedis.js",
        limitKb: 750,
        sizeKb: 751,
      },
    ]);
  });
});
