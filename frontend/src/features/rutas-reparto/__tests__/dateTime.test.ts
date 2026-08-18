import { describe, expect, it } from "vitest";
import { toDateTimeLocalInput } from "../dateTime";

describe("route date-time helpers", () => {
  it("renders a UTC instant as local datetime-local wall time", () => {
    const instant = new Date("2026-08-18T19:41:00.000Z");

    expect(toDateTimeLocalInput(instant, 360)).toBe("2026-08-18T13:41");
  });
});
