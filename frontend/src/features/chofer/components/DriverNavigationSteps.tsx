import { ArrowDown, CornerDownLeft, CornerDownRight, RotateCcw } from "lucide-react";
import type {
  DriverNavigationManeuver,
  DriverNavigationStep,
} from "../../rutas-reparto/types";

function distanceLabel(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function durationLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
}

function maneuverLabel(maneuver: DriverNavigationManeuver) {
  if (maneuver.type === "ROUNDABOUT" || maneuver.type === "ROUNDABOUT_TURN") {
    return maneuver.exit ? `Rotonda · salida ${maneuver.exit}` : "Rotonda";
  }
  if (maneuver.modifier === "UTURN") return "Retorno";
  if (maneuver.modifier === "RIGHT" || maneuver.modifier === "SHARP_RIGHT") {
    return maneuver.modifier === "SHARP_RIGHT" ? "Giro fuerte a la derecha" : "Giro a la derecha";
  }
  if (maneuver.modifier === "LEFT" || maneuver.modifier === "SHARP_LEFT") {
    return maneuver.modifier === "SHARP_LEFT" ? "Giro fuerte a la izquierda" : "Giro a la izquierda";
  }
  if (maneuver.modifier === "SLIGHT_RIGHT") return "Giro leve a la derecha";
  if (maneuver.modifier === "SLIGHT_LEFT") return "Giro leve a la izquierda";
  if (maneuver.modifier === "STRAIGHT") return "Continúa de frente";
  if (maneuver.type === "ARRIVE") return "Llegada a la parada";
  return maneuver.type === "DEPART" ? "Salida" : "Continúa";
}

function maneuverIcon(maneuver: DriverNavigationManeuver) {
  if (maneuver.modifier === "UTURN") return RotateCcw;
  if (maneuver.modifier?.includes("LEFT")) return CornerDownLeft;
  if (maneuver.modifier?.includes("RIGHT")) return CornerDownRight;
  return ArrowDown;
}

export function DriverNavigationSteps({ steps }: { steps: DriverNavigationStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-[var(--erp-muted-foreground)]">Sin instrucciones detalladas.</p>;
  }

  return (
    <ol className="grid gap-2" aria-label="Instrucciones de navegación">
      {steps.map((step, index) => {
        const Icon = maneuverIcon(step.maneuver);
        return (
          <li
            className="flex min-w-0 items-start gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3"
            key={`${step.maneuver.location.latitude}-${step.maneuver.location.longitude}-${index}`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgba(47,111,115,0.12)] text-[var(--erp-info)]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block break-words text-sm font-black text-[var(--erp-foreground)]">
                {maneuverLabel(step.maneuver)}
              </strong>
              <span className="mt-1 block break-words text-xs font-semibold text-[var(--erp-muted-foreground)]">
                {step.streetName ?? "Vía sin nombre"} · {distanceLabel(step.distanceMeters)} · {durationLabel(step.durationSeconds)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
