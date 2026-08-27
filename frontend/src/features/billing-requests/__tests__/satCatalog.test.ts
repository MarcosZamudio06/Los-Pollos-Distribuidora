import { describe, expect, it } from "vitest";
import { cfdiUseOptions, satCatalogOptions } from "../cfdiReview";

describe("SAT catalog UI contract", () => {
  it("uses the active API version when available", () => {
    const options = satCatalogOptions(
      {
        key: "c_UsoCFDI",
        configured: true,
        activeVersion: {
          id: "version-1",
          sourceVersion: "sat-2026-01",
          checksumSha256: "a".repeat(64),
          rowCount: 1,
        },
        entries: [
          {
            code: "G99",
            description: "Fixture description",
          },
        ],
      },
      cfdiUseOptions,
    );

    expect(options).toEqual([
      { value: "G99", label: "G99 · Fixture description" },
    ]);
  });

  it("keeps a controlled compatibility fallback while a catalog is unconfigured", () => {
    expect(satCatalogOptions(undefined, cfdiUseOptions)).toBe(cfdiUseOptions);
  });
});
