import { afterEach, describe, expect, it, vi } from "vitest";
import { toDateTimeLocalInput, toIsoDateTime } from "../dateTime";

describe("route date-time helpers", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("does not interpret operational wall time as the browser timezone", () => {
    vi.stubEnv("TZ", "UTC");
    vi.stubEnv("VITE_APP_TIMEZONE", "America/Mexico_City");
    expect(toIsoDateTime("2026-10-23T23:59")).toBe("2026-10-24T05:59:00.000Z");
    expect(toDateTimeLocalInput(new Date("2026-10-24T02:30:00Z"))).toBe(
      "2026-10-23T20:30",
    );
  });
  it("renders a UTC instant as local datetime-local wall time", () => {
    const instant = new Date("2026-08-18T19:41:00.000Z");

    expect(toDateTimeLocalInput(instant, 360)).toBe("2026-08-18T13:41");
  });
});
