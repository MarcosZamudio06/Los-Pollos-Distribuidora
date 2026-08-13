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

  it("gives the isolated MapLibre vendor chunk its explicit async budget", () => {
    expect(BUNDLE_BUDGET_KB.maplibre).toBe(1_000);
    expect(
      getBundleBudgetViolations([
        {
          fileName: "maplibre-gl.js",
          isEntry: false,
          sizeBytes: 999 * 1024,
        },
        {
          fileName: "maplibre-gl.js",
          isEntry: false,
          sizeBytes: 1_001 * 1024,
        },
      ]),
    ).toEqual([
      {
        fileName: "maplibre-gl.js",
        limitKb: 1_000,
        sizeKb: 1_001,
      },
    ]);
  });
});
