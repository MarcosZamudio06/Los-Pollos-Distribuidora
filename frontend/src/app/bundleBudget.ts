import type { Plugin } from "vite";

export const BUNDLE_BUDGET_KB = {
  async: 750,
  entry: 500,
} as const;

export type BundleMetric = {
  fileName: string;
  isEntry: boolean;
  sizeBytes: number;
};

export type BundleBudgetViolation = {
  fileName: string;
  limitKb: number;
  sizeKb: number;
};

export function getBundleBudgetViolations(
  metrics: readonly BundleMetric[],
): BundleBudgetViolation[] {
  return metrics.flatMap((metric) => {
    const limitKb = metric.isEntry
      ? BUNDLE_BUDGET_KB.entry
      : BUNDLE_BUDGET_KB.async;
    const sizeKb = Math.round((metric.sizeBytes / 1024) * 100) / 100;

    if (metric.sizeBytes <= limitKb * 1024) {
      return [];
    }

    return [{ fileName: metric.fileName, limitKb, sizeKb }];
  });
}

export function createBundleBudgetPlugin(): Plugin {
  return {
    apply: "build",
    generateBundle(_options, bundle) {
      const metrics: BundleMetric[] = [];

      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") {
          continue;
        }

        metrics.push({
          fileName: output.fileName,
          isEntry: output.isEntry,
          sizeBytes: Buffer.byteLength(output.code),
        });
      }

      const violations = getBundleBudgetViolations(metrics);

      if (violations.length > 0) {
        this.error(
          [
            "Frontend bundle budget exceeded:",
            ...violations.map(
              ({ fileName, limitKb, sizeKb }) =>
                `- ${fileName}: ${sizeKb} kB (limit ${limitKb} kB)`,
            ),
          ].join("\n"),
        );
      }
    },
    name: "frontend-bundle-budget",
  };
}
