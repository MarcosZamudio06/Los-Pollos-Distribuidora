import type { ReactNode } from "react";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
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
  if (!open) return null;

  return (
    <section
      aria-label="Acciones operativas de la parada"
      className="absolute inset-0 z-50 overflow-y-auto bg-[#17201b]/92 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-white backdrop-blur-sm sm:px-6 sm:py-6"
      data-navigation-operations="true"
    >
      <div className="mx-auto grid min-h-full w-full max-w-4xl content-start gap-4">
        <header className="flex items-center justify-between gap-3">
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
          <button
            aria-label="Volver a navegación"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-black text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            onClick={onClose}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Volver al mapa</span>
          </button>
        </header>

        <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-semibold leading-6 text-white/75">
          Completa aquí las acciones operativas. Ninguna acción cambia el
          destino por proximidad GPS; el siguiente destino lo determina el
          detalle actualizado de la ruta en el servidor.
        </p>

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
    </section>
  );
}
