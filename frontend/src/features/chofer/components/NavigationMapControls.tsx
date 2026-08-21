import { LocateFixed, Scan } from "lucide-react";

type Props = {
  disabled?: boolean;
  overviewDisabled?: boolean;
  onOverview: () => void;
  onRecenter: () => void;
  recenterDisabled?: boolean;
};

export function NavigationMapControls({
  disabled = false,
  overviewDisabled = false,
  onOverview,
  onRecenter,
  recenterDisabled = false,
}: Props) {
  return (
    <div
      aria-label="Controles del mapa"
      className="pointer-events-auto absolute right-3 top-1/2 z-20 grid -translate-y-1/2 gap-2 sm:right-6"
    >
      <button
        aria-label="Recentrar en mi ubicación"
        className="grid min-h-14 min-w-14 place-items-center rounded-2xl border border-white/20 bg-[#17201b]/90 text-white shadow-[0_12px_32px_rgba(17,24,21,.28)] backdrop-blur transition hover:border-[var(--erp-brand-gold-soft)] hover:text-[var(--erp-brand-gold-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled || recenterDisabled}
        onClick={onRecenter}
        type="button"
      >
        <LocateFixed aria-hidden="true" className="h-6 w-6" />
      </button>
      <button
        aria-label="Mostrar vista general de la ruta"
        className="grid min-h-14 min-w-14 place-items-center rounded-2xl border border-white/20 bg-[#17201b]/90 text-white shadow-[0_12px_32px_rgba(17,24,21,.28)] backdrop-blur transition hover:border-[var(--erp-brand-gold-soft)] hover:text-[var(--erp-brand-gold-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled || overviewDisabled}
        onClick={onOverview}
        type="button"
      >
        <Scan aria-hidden="true" className="h-6 w-6" />
      </button>
    </div>
  );
}
