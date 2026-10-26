import { afterEach, describe, expect, it, vi } from "vitest";
import { getOperationalDate } from "../operationalDate";

describe("getOperationalDate", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("honors the operational timezone selected for the frontend deployment", () => {
    vi.stubEnv("VITE_APP_TIMEZONE", "America/Cancun");
    expect(getOperationalDate(new Date("2026-10-24T05:30:00Z"))).toBe(
      "2026-10-24",
    );
  });
  it("uses the Mexico City calendar day instead of the UTC date", () => {
    expect(getOperationalDate(new Date("2026-07-22T01:00:00.000Z"))).toBe(
      "2026-07-21",
    );
  });
});
