import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ClipboardCheck, Maximize2, Minimize2, X } from "lucide-react";
import { DeliveryOrderCard } from "../../rutas-reparto/components/DeliveryOrderCard";
import type {
  DeliveryOrder,
  DeliveryRouteDetail,
  EvidenceSummaryItem,
} from "../../rutas-reparto/types";

type Props = {
  children?: ReactNode;
  evidence: EvidenceSummaryItem[];
  onCaptureEvidence: (order: DeliveryOrder) => void;
  onClose: () => void;
  onCollect: (order: DeliveryOrder) => void;
  onIncident: (order: DeliveryOrder) => void;
  onSecondPassCollect: (order: DeliveryOrder) => void;
  onUpdateStatus: (order: DeliveryOrder) => void;
  open: boolean;
  order?: DeliveryOrder | null;
  route: DeliveryRouteDetail;
};

export function DriverNavigationOperationsPanel({
  children,
  evidence,
  onCaptureEvidence,
  onClose,
  onCollect,
  onIncident,
  onSecondPassCollect,
  onUpdateStatus,
  open,
  order,
  route,
}: Props) {
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!open) setIsMinimized(false);
  }, [open]);

  if (!open) return null;

  if (isMinimized) {
    return (
      <section
        aria-label="Acciones operativas minimizadas"
        className="pointer-events-none absolute inset-0 z-50"
        data-navigation-operations="true"
        data-navigation-operations-minimized="true"
      >
        <div className="pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-4xl sm:inset-x-6">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/15 bg-[#17201b]/95 p-3 text-white shadow-[0_16px_40px_rgba(17,24,21,.32)] backdrop-blur sm:p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">
                Acciones operativas
              </p>
              <p className="mt-1 truncate text-sm font-black">
                {order?.customerName ?? route.name}
              </p>
            </div>
            <button
              aria-label="Restaurar acciones operativas"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-black text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              onClick={() => setIsMinimized(false)}
              type="button"
            >
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Abrir acciones</span>
            </button>
            <button
              aria-label="Cerrar acciones operativas"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Acciones operativas de la parada"
      className="absolute inset-0 z-50 overflow-x-hidden overflow-y-auto bg-[#17201b]/92 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-white backdrop-blur-sm sm:px-6 sm:py-6"
      data-navigation-operations="true"
    >
      <div className="mx-auto grid min-h-full min-w-0 w-full max-w-4xl content-start gap-4">
        <header className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(214,155,45,.16)] text-[var(--erp-brand-gold-soft)]">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">
                Atención en destino
              </p>
              <h2 className="truncate text-xl font-black tracking-[-0.04em] text-white sm:text-2xl">
                {order?.customerName ?? route.name}
              </h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label="Minimizar acciones operativas"
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-black text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              onClick={() => setIsMinimized(true)}
              type="button"
            >
              <Minimize2 aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Minimizar</span>
            </button>
            <button
              aria-label="Volver a navegación"
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-black text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              onClick={onClose}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Volver al mapa</span>
            </button>
          </div>
        </header>

        <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-semibold leading-6 text-white/75">
          Completa aquí las acciones operativas. Ninguna acción cambia el
          destino por proximidad GPS; el siguiente destino lo determina el
          detalle actualizado de la ruta en el servidor.
        </p>

        <div
          className="min-w-0 w-full"
          data-navigation-operations-content="true"
        >
          {order ? (
            <DeliveryOrderCard
              evidence={evidence}
              onCaptureEvidence={onCaptureEvidence}
              onCollect={onCollect}
              onIncident={onIncident}
              onSecondPassCollect={onSecondPassCollect}
              onUpdateStatus={onUpdateStatus}
              order={order}
              routeSettlementId={route.routeSettlementId}
            />
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}
