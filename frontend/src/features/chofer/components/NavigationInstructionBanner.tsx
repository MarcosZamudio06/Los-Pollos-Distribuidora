import {
  ArrowDown,
  CornerDownLeft,
  CornerDownRight,
  LocateFixed,
  RotateCcw,
  RotateCw,
  Route,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import type { DriverNavigationStep } from "../../rutas-reparto/types";
import {
  formatNavigationDistance,
  navigationStepLabel,
} from "../navigationPresentation";

type Props = {
  isCalculating?: boolean;
  isOffline?: boolean;
  isLowAccuracy?: boolean;
  isRequestingPermission?: boolean;
  onRetry?: () => void;
  recalculationFailed?: boolean;
  routeAvailable?: boolean;
  step?: DriverNavigationStep | null;
};

function ManeuverIcon({ step }: { step: DriverNavigationStep }) {
  const { maneuver } = step;
  if (maneuver.modifier === "UTURN") {
    return <RotateCcw aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />;
  }
  if (maneuver.type === "ROUNDABOUT" || maneuver.type === "ROUNDABOUT_TURN") {
    return <RotateCw aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />;
  }
  if (maneuver.modifier?.includes("LEFT")) {
    return <CornerDownLeft aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />;
  }
  if (maneuver.modifier?.includes("RIGHT")) {
    return <CornerDownRight aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />;
  }
  return <ArrowDown aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />;
}

export function NavigationInstructionBanner({
  isCalculating = false,
  isOffline = false,
  isLowAccuracy = false,
  isRequestingPermission = false,
  onRetry,
  recalculationFailed = false,
  routeAvailable = false,
  step,
}: Props) {
  const hasInstruction = Boolean(step && !isCalculating);

  return (
    <section
      aria-label="Instrucción de navegación"
      aria-live="polite"
      className="pointer-events-auto mx-auto w-[min(100%-1rem,32rem)] rounded-b-[1.35rem] border border-white/15 bg-[#17201b]/95 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-[0_18px_48px_rgba(17,24,21,.28)] backdrop-blur-xl sm:w-[min(100%-3rem,36rem)] sm:rounded-[1.35rem] sm:pt-4"
      role="status"
    >
      {isRequestingPermission ? (
        <div className="flex items-center gap-3" data-navigation-state="requesting-permission">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(240,197,106,.15)] text-[var(--erp-brand-gold-soft)]">
            <LocateFixed aria-hidden="true" className="h-6 w-6 animate-pulse motion-reduce:animate-none" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-black text-white">
              Solicitando permiso
            </strong>
            <span className="mt-1 block text-sm font-semibold text-white/65">
              Autoriza la ubicación para comenzar.
            </span>
          </span>
        </div>
      ) : isCalculating ? (
        <div className="flex items-center gap-3" data-navigation-state="recalculating">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(240,197,106,.15)] text-[var(--erp-brand-gold-soft)]">
            <Route aria-hidden="true" className="h-6 w-6 animate-pulse motion-reduce:animate-none" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.68rem] font-black uppercase tracking-[0.2em] text-white/55">
              Recalculando
            </span>
            <span className="mt-1 block text-base font-black tracking-[-0.02em] text-white">
              Conservando el último trazado válido
            </span>
          </span>
        </div>
      ) : recalculationFailed && routeAvailable ? (
        <div className="flex items-center gap-3" data-navigation-state="recalculation-failed">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(182,42,34,.24)] text-white">
            <TriangleAlert aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-black text-white">
              No se pudo recalcular
            </strong>
            <span className="mt-1 block text-sm font-semibold text-white/65">
              Conservando la última ruta válida.
            </span>
          </span>
        </div>
      ) : isOffline && routeAvailable ? (
        <div className="flex items-center gap-3" data-navigation-state="offline">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(240,197,106,.14)] text-[var(--erp-brand-gold-soft)]">
            <WifiOff aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-black text-white">
              Sin conexión
            </strong>
            <span className="mt-1 block text-sm font-semibold text-white/65">
              Usando el último cálculo válido.
            </span>
          </span>
        </div>
      ) : hasInstruction ? (
        <div className="flex items-center gap-3" data-navigation-state="available">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--erp-brand-gold-soft)] text-[var(--erp-charcoal)] shadow-[0_8px_20px_rgba(240,197,106,.22)]">
            {step ? <ManeuverIcon step={step} /> : <Route aria-hidden="true" className="h-7 w-7" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.7rem] font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
              En {formatNavigationDistance(step?.distanceMeters ?? 0)}
            </span>
            <strong className="mt-1 block break-words text-[clamp(1.1rem,4.8vw,1.45rem)] font-black leading-tight tracking-[-0.04em] text-white">
              {step ? navigationStepLabel(step.maneuver) : "Continúa"}
            </strong>
            {step?.streetName && (
              <span className="mt-1 block truncate text-sm font-semibold text-white/65">
                {step.streetName}
              </span>
            )}
          </span>
        </div>
      ) : !routeAvailable ? (
        <div className="flex items-center gap-3" data-navigation-state="no-gps">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(182,42,34,.24)] text-white">
            <LocateFixed aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-black text-white">
              Sin GPS
            </strong>
            <span className="mt-1 block text-sm font-semibold text-white/65">
              Inicia la navegación para recibir instrucciones.
            </span>
          </span>
          {onRetry && (
            <button
              aria-label="Reintentar GPS"
              className="grid min-h-12 min-w-12 shrink-0 place-items-center rounded-xl border border-white/20 text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              onClick={onRetry}
              type="button"
            >
              <LocateFixed aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3" data-navigation-state="ready">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(47,111,115,.3)] text-[var(--erp-brand-gold-soft)]">
            <Route aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-black text-white">
              Ruta disponible
            </strong>
            <span className="mt-1 block text-sm font-semibold text-white/65">
              Esperando un cálculo desde tu ubicación.
            </span>
          </span>
        </div>
      )}
      {isLowAccuracy && routeAvailable && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs font-bold text-[var(--erp-brand-gold-soft)]">
          Precisión baja · mantén la ruta visible mientras mejora la señal.
        </p>
      )}
    </section>
  );
}
