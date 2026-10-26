import { afterEach, describe, expect, it, vi } from "vitest";
import {
  operationalDateTimeToIso,
  toOperationalDateTimeInput,
} from "../operationalDate";

describe("operational wall-clock conversion", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ["2026-10-24T23:59", "2026-10-25T05:59:00.000Z"],
    ["2026-10-25T00:00", "2026-10-25T06:00:00.000Z"],
    ["2026-10-23", "2026-10-23T06:00:00.000Z"],
  ])(
    "converts %s using Mexico City instead of the host timezone",
    (wall, iso) => {
      vi.stubEnv("VITE_APP_TIMEZONE", "America/Mexico_City");
      expect(operationalDateTimeToIso(wall)).toBe(iso);
      expect(
        toOperationalDateTimeInput(new Date(iso)).slice(0, wall.length),
      ).toBe(wall);
    },
  );
  it("uses the configured operational zone rather than a fixed six-hour offset", () => {
    vi.stubEnv("VITE_APP_TIMEZONE", "America/Cancun");
    expect(operationalDateTimeToIso("2026-10-24T23:59")).toBe(
      "2026-10-25T04:59:00.000Z",
    );
  });
  it.each(["not-a-date", "2026-02-30", "2026-10-24T25:00"])(
    "rejects invalid civil input %s",
    (value) => {
      expect(() => operationalDateTimeToIso(value)).toThrow();
    },
  );
  it("rejects a nonexistent DST wall time without silently moving the payment", () => {
    expect(() =>
      operationalDateTimeToIso("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
  });
});
