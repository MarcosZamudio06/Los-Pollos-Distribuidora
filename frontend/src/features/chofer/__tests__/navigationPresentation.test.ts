import { describe, expect, it } from "vitest";
import type { DriverNavigationStep } from "../../rutas-reparto/types";
import {
  navigationStepLabel,
  selectNextActionableStep,
} from "../navigationPresentation";

function step(
  type: DriverNavigationStep["maneuver"]["type"],
  modifier: DriverNavigationStep["maneuver"]["modifier"],
): DriverNavigationStep {
  return {
    distanceMeters: 100,
    durationSeconds: 15,
    streetName: null,
    maneuver: {
      bearingAfter: null,
      bearingBefore: null,
      exit: null,
      location: { latitude: 19.18, longitude: -96.14 },
      modifier,
      type,
    },
  };
}

describe("navigation instruction selection", () => {
  it("skips departure metadata and selects the next actionable maneuver", () => {
    const departure = step("DEPART", null);
    const turn = step("TURN", "SLIGHT_LEFT");
    expect(selectNextActionableStep([departure, turn])).toBe(turn);
    expect(navigationStepLabel(turn.maneuver)).toBe("Giro leve a la izquierda");
  });

  it("uses a neutral fallback for unknown provider maneuvers", () => {
    const unknown = step("UNKNOWN", null);
    expect(selectNextActionableStep([unknown])).toBe(unknown);
    expect(navigationStepLabel(unknown.maneuver)).toBe("Continúa por la vía");
  });
});

