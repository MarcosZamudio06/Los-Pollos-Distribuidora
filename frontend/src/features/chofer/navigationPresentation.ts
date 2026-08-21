import type {
  DriverNavigationManeuver,
  DriverNavigationStep,
} from "../rutas-reparto/types";

export function formatNavigationDistance(meters: number) {
  if (!Number.isFinite(meters)) return "—";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
    : `${Math.max(0, Math.round(meters))} m`;
}

export function formatNavigationDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
}

export function navigationStepLabel(maneuver: DriverNavigationManeuver) {
  if (
    maneuver.type === "ROUNDABOUT" ||
    maneuver.type === "ROUNDABOUT_TURN" ||
    maneuver.type === "ROTARY" ||
    maneuver.type === "EXIT_ROUNDABOUT" ||
    maneuver.type === "EXIT_ROTARY"
  ) {
    return maneuver.exit ? `Rotonda · salida ${maneuver.exit}` : "Rotonda";
  }
  if (maneuver.modifier === "UTURN") return "Haz retorno";
  if (maneuver.modifier === "SHARP_RIGHT") return "Giro fuerte a la derecha";
  if (maneuver.modifier === "RIGHT") return "Gira a la derecha";
  if (maneuver.modifier === "SLIGHT_RIGHT") return "Giro leve a la derecha";
  if (maneuver.modifier === "SHARP_LEFT") return "Giro fuerte a la izquierda";
  if (maneuver.modifier === "LEFT") return "Gira a la izquierda";
  if (maneuver.modifier === "SLIGHT_LEFT") return "Giro leve a la izquierda";
  if (maneuver.modifier === "STRAIGHT") return "Continúa de frente";
  if (maneuver.type === "ARRIVE") return "Llegaste a la parada";
  if (maneuver.type === "DEPART") return "Inicia el recorrido";
  return "Continúa por la vía";
}

const actionableManeuverTypes = new Set<DriverNavigationManeuver["type"]>([
  "ARRIVE",
  "END_OF_ROAD",
  "EXIT_ROTARY",
  "EXIT_ROUNDABOUT",
  "FORK",
  "MERGE",
  "OFF_RAMP",
  "ON_RAMP",
  "ROTARY",
  "ROUNDABOUT",
  "ROUNDABOUT_TURN",
  "TURN",
]);

export function selectNextActionableStep(steps: DriverNavigationStep[]) {
  return (
    steps.find(
      (step) =>
        step.maneuver.type !== "DEPART" &&
        step.maneuver.type !== "NOTIFICATION" &&
        (step.maneuver.modifier !== null ||
          actionableManeuverTypes.has(step.maneuver.type)),
    ) ??
    steps.find((step) => step.maneuver.type !== "DEPART") ??
    steps[0] ??
    null
  );
}

export function firstNavigationStep(steps: DriverNavigationStep[]) {
  return selectNextActionableStep(steps);
}
