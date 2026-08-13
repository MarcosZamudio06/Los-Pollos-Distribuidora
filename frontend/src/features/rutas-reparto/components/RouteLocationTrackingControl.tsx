import { MapPin, Radio, ShieldCheck } from "lucide-react";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
} from "./RouteUi";
import type {
  RouteLocationTrackingResult,
  RouteLocationTrackingStatus,
} from "../useRouteLocationTracking";

const STATUS_LABELS: Record<RouteLocationTrackingStatus, string> = {
  active: "Activo",
  gps_unavailable: "GPS no disponible",
  low_accuracy: "Precisión baja",
  permission_denied: "Permiso denegado",
  requesting_permission: "Solicitando permiso",
  stopped: "Detenido",
  sync_error: "Error de sincronización",
};

const STATUS_TONES: Record<
  RouteLocationTrackingStatus,
  "error" | "info" | "empty" | "success"
> = {
  active: "success",
  gps_unavailable: "error",
  low_accuracy: "info",
  permission_denied: "error",
  requesting_permission: "info",
  stopped: "empty",
  sync_error: "error",
};

function formatRecordedAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function RouteLocationTrackingControl({
  tracking,
}: {
  tracking: RouteLocationTrackingResult;
}) {
  if (!tracking.isEligible) return null;

  const recordedAt = formatRecordedAt(tracking.lastPublishedAt);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
            <Radio className="h-4 w-4" />
            Seguimiento GPS
          </p>
          <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">
            Ubicación durante la ruta activa
          </h3>
          <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">
            <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-success)]" />
            Tu ubicación se comparte con el equipo operativo únicamente mientras
            esta ruta esté activa. No se recopila antes de IN_PROGRESS ni después
            de finalizar.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {tracking.isTracking ? (
            <SecondaryButton onClick={tracking.stop}>
              Detener seguimiento GPS
            </SecondaryButton>
          ) : (
            <PrimaryButton disabled={!tracking.canStart} onClick={tracking.start}>
              <MapPin className="h-4 w-4" />
              Iniciar seguimiento GPS
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p
          aria-live="polite"
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
            STATUS_TONES[tracking.status] === "success"
              ? "border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]"
              : STATUS_TONES[tracking.status] === "error"
                ? "border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]"
                : STATUS_TONES[tracking.status] === "info"
                  ? "border-[rgba(47,111,115,0.25)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]"
                  : "border-[color:var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted-foreground)]"
          }`}
          data-tracking-status={tracking.status}
          role="status"
        >
          {STATUS_LABELS[tracking.status]}
        </p>
        {recordedAt && (
          <span className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
            Última lectura publicada: {recordedAt}
          </span>
        )}
      </div>

      {tracking.errorMessage && (
        <p
          aria-live="assertive"
          className="mt-3 rounded-xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]"
          role="alert"
        >
          {tracking.errorMessage}
        </p>
      )}
    </Card>
  );
}
