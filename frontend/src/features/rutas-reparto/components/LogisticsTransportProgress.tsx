import { CheckCircle2, CircleDot, MapPin, PackageCheck } from "lucide-react";
import { Card } from "./RouteUi";
import type { DeliveryRouteStatus, LogisticsStopStatus } from "../types";

type LogisticsTransportProgressProps = {
  routeStatus: DeliveryRouteStatus;
  stopStatus?: LogisticsStopStatus | null;
};

type ProgressStep = {
  label: string;
  state: "complete" | "current" | "pending";
};

export function LogisticsTransportProgress({
  routeStatus,
  stopStatus,
}: LogisticsTransportProgressProps) {
  const isCompleted = routeStatus === "COMPLETED";
  const isInProgress = routeStatus === "IN_PROGRESS";
  const stopCompleted = stopStatus === "COMPLETED";
  const steps: ProgressStep[] = [
    {
      label: "Asignada",
      state: isInProgress || isCompleted ? "complete" : "current",
    },
    {
      label: "En ruta",
      state: isCompleted || stopCompleted
        ? "complete"
        : isInProgress
          ? "current"
          : "pending",
    },
    {
      label: "Recepción",
      state: isCompleted
        ? "complete"
        : stopCompleted
          ? "current"
          : "pending",
    },
    {
      label: "Completada",
      state: isCompleted ? "complete" : "pending",
    },
  ];

  const completedSteps = steps.filter((step) => step.state === "complete").length;
  const progress = isCompleted
    ? 100
    : stopCompleted
      ? 66
      : isInProgress
        ? 33
        : 0;
  const statusText = isCompleted
    ? "Traslado completado"
    : stopCompleted
      ? "Recepción confirmada"
      : isInProgress
        ? "Traslado en ruta"
        : routeStatus === "CANCELLED"
          ? "Traslado cancelado"
          : "Listo para iniciar";

  return (
    <Card className="overflow-hidden p-0" data-testid="logistics-transport-progress">
      <div className="bg-[var(--erp-info)] p-5 text-white">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">
          <CircleDot className="h-4 w-4" />
          Progreso del traslado
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xl font-black tracking-[-0.04em] text-white">
            {statusText}
          </h3>
          <span className="text-2xl font-black tabular-nums text-white">
            {progress}%
          </span>
        </div>
        <div
          aria-label="Progreso del traslado"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          aria-valuetext={statusText}
          className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--erp-brand-gold-soft)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol className="grid gap-3 p-5 sm:grid-cols-4">
        {steps.map((step, index) => (
          <li
            className="flex items-center gap-2 text-sm font-black"
            data-step-state={step.state}
            key={step.label}
          >
            {index === 0 ? (
              <MapPin className="h-4 w-4 text-[var(--erp-info)]" />
            ) : index === 2 ? (
              <PackageCheck className="h-4 w-4 text-[var(--erp-info)]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[var(--erp-info)]" />
            )}
            <span
              className={
                step.state === "pending"
                  ? "text-[var(--erp-muted-foreground)]"
                  : "text-[var(--erp-foreground)]"
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <span className="sr-only">{completedSteps} etapas completadas</span>
    </Card>
  );
}
