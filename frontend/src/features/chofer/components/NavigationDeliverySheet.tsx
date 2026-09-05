import { useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Maximize2,
  MapPin,
  Navigation,
  ReceiptText,
  Route,
  Truck,
} from "lucide-react";
import {
  isFinalOrderStatus,
  money,
  orderStatusLabel,
  shortId,
} from "../../rutas-reparto/labels";
import type {
  DeliveryRouteDetail,
  DriverNavigationResponse,
  DriverNavigationTarget,
} from "../../rutas-reparto/types";
import {
  formatNavigationDistance,
  formatNavigationDuration,
} from "../navigationPresentation";

type Props = {
  canStart?: boolean;
  isMinimized?: boolean;
  isStarting?: boolean;
  isNearDestination?: boolean;
  isTracking: boolean;
  navigation?: DriverNavigationResponse | null;
  onArrived: () => void;
  onNextStop?: () => void;
  onOpenDelivery: () => void;
  onMinimizedChange?: (isMinimized: boolean) => void;
  onStart: () => void;
  route: DeliveryRouteDetail;
  target: DriverNavigationTarget | null;
};

function statusLabel(route: DeliveryRouteDetail, target: DriverNavigationTarget) {
  if (target.kind === "LOGISTICS_STOP") {
    return route.logisticsStop?.status === "COMPLETED" ? "Completado" : "Pendiente";
  }
  const order = route.orders?.find((item) => item.id === target.id);
  return order ? orderStatusLabel(order.status) : "Pendiente";
}

export function NavigationDeliverySheet({
  target,
  ...props
}: Props) {
  const targetKey = target ? `${target.kind}:${target.id}` : "no-target";
  return (
    <NavigationDeliverySheetContent
      key={targetKey}
      target={target}
      {...props}
    />
  );
}

function NavigationDeliverySheetContent({
  canStart = true,
  isMinimized: controlledIsMinimized,
  isStarting = false,
  isNearDestination = false,
  isTracking,
  navigation,
  onArrived,
  onNextStop,
  onOpenDelivery,
  onMinimizedChange,
  onStart,
  route,
  target,
}: Props) {
  const [internalIsMinimized, setInternalIsMinimized] = useState(false);
  const isMinimized = controlledIsMinimized ?? internalIsMinimized;

  function updateMinimized(nextValue: boolean) {
    setInternalIsMinimized(nextValue);
    onMinimizedChange?.(nextValue);
  }

  if (!target) {
    return (
      <section
        aria-label="Estado de la ruta"
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-t-[1.7rem] bg-[#17201b] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-[0_-20px_60px_rgba(17,24,21,.3)] sm:inset-x-6 sm:bottom-6 sm:rounded-[1.7rem] sm:pb-5"
        data-navigation-sheet="empty"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/30" />
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-[var(--erp-brand-gold-soft)]" />
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-white">
              Ninguna parada pendiente
            </h2>
            <p className="mt-1 text-sm font-semibold text-white/65">
              La ruta ya no tiene un destino activo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const order =
    target.kind === "DELIVERY_ORDER"
      ? route.orders?.find((item) => item.id === target.id)
      : undefined;
  const hasBalance = Boolean(
    order?.accountReceivableId && Number(order.outstandingAmount ?? 0) > 0,
  );
  const status = statusLabel(route, target);
  const isFinal = order ? isFinalOrderStatus(order.status) : false;
  const distance = navigation?.distanceMeters;
  const duration = navigation?.durationSeconds;
  const canConfirmArrival = isTracking && isNearDestination;

  if (isMinimized) {
    return (
      <section
        aria-label="Detalle de la próxima parada minimizado"
        className="pointer-events-none absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 sm:inset-x-6 sm:bottom-6"
        data-navigation-sheet="minimized"
      >
        <button
          aria-label="Mostrar detalle completo de la parada"
          className="pointer-events-auto mx-auto flex w-full max-w-2xl min-w-0 items-center gap-3 rounded-2xl border border-white/15 bg-[#17201b]/95 px-3 py-3 text-left text-white shadow-[0_-12px_32px_rgba(17,24,21,.28)] backdrop-blur transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 sm:px-4"
          onClick={() => updateMinimized(false)}
          type="button"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(214,155,45,.16)] text-[var(--erp-brand-gold-soft)]">
            {target.kind === "DELIVERY_ORDER" ? (
              <ReceiptText aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Truck aria-hidden="true" className="h-5 w-5" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.65rem] font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
              {target.stopSequence ? `Parada ${target.stopSequence}` : "Destino operativo"}
            </span>
            <span className="mt-1 block truncate text-sm font-black">
              {target.label}
            </span>
          </span>
          <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black uppercase tracking-[0.08em] text-white/85">
            <Maximize2 aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Mostrar detalle</span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Detalle de la próxima parada"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[54dvh] overflow-y-auto rounded-t-[1.7rem] bg-[#f8f7f2] text-[var(--erp-foreground)] shadow-[0_-20px_60px_rgba(17,24,21,.3)] [scrollbar-width:thin] sm:inset-x-6 sm:bottom-6 sm:max-h-[min(34rem,calc(100dvh-7rem))] sm:rounded-[1.7rem]"
      data-navigation-sheet="active"
    >
      <div className="sticky top-0 z-10 bg-[#17201b] px-4 pb-4 pt-3 text-white sm:rounded-t-[1.7rem] sm:px-6">
        <button
          aria-label="Minimizar detalle de la parada"
          className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-white/30 transition hover:bg-white/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          onClick={() => updateMinimized(true)}
          type="button"
        >
          <span className="sr-only">Minimizar detalle de la parada</span>
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
              {target.kind === "DELIVERY_ORDER" ? (
                <ReceiptText aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Truck aria-hidden="true" className="h-4 w-4" />
              )}
              {target.stopSequence ? `Parada ${target.stopSequence}` : "Destino operativo"}
            </p>
            <h2 className="mt-1 break-words text-[clamp(1.25rem,5.5vw,1.75rem)] font-black leading-tight tracking-[-0.05em] text-white">
              {target.label}
            </h2>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-white/80">
            {status}
          </span>
        </div>
      </div>

      <div className="grid gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
        {isNearDestination && isTracking && (
          <div
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl border border-[rgba(214,155,45,0.32)] bg-[rgba(214,155,45,0.12)] px-3 py-3 text-sm font-black text-[var(--erp-brand-gold-deep)]"
            role="status"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Estás cerca del destino. Pulsa “Abrir entrega” cuando estés listo.</span>
          </div>
        )}
        {isTracking && !canConfirmArrival && (
          <div
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl border border-[rgba(182,42,34,0.28)] bg-[rgba(182,42,34,0.10)] px-3 py-3 text-sm font-black text-[var(--erp-danger)]"
            role="status"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Acércate al destino con una precisión GPS de 100 m o menos para
              habilitar la confirmación.
            </span>
          </div>
        )}
        <div className="grid gap-3">
          {target.kind === "DELIVERY_ORDER" && (
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(47,111,115,.12)] text-[var(--erp-info)]">
                <ReceiptText aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.67rem] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                  Venta / pedido
                </p>
                <p className="truncate text-sm font-black">
                  {order?.saleNumber ?? shortId(order?.saleId ?? target.id)}
                </p>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(182,42,34,.10)] text-[var(--erp-danger)]">
              <MapPin aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.67rem] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                Dirección
              </p>
              <p className="break-words text-sm font-bold leading-5">
                {target.address ?? "Sin dirección registrada"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-y border-[color:var(--erp-border)] py-3">
          <div className="rounded-xl bg-white px-3 py-2.5">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
              Distancia restante
            </p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {distance == null ? "Calculando" : formatNavigationDistance(distance)}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2.5">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
              ETA aproximada
            </p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {duration == null ? "—" : formatNavigationDuration(duration)}
            </p>
          </div>
        </div>

        {target.kind === "DELIVERY_ORDER" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(214,155,45,.25)] bg-[rgba(214,155,45,.1)] px-3 py-3">
            <span className="flex items-center gap-2 text-sm font-black">
              <BadgeDollarSign aria-hidden="true" className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" />
              Saldo por cobrar
            </span>
            <strong className="text-base tabular-nums">
              {hasBalance ? money(order?.outstandingAmount) : "Sin CxC"}
            </strong>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
          <Route aria-hidden="true" className="h-4 w-4 text-[var(--erp-info)]" />
          Estado de entrega: <span className="text-[var(--erp-foreground)]">{status}</span>
        </div>

        {!isTracking ? (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--erp-brand-red)] px-5 text-base font-black text-white shadow-[0_12px_30px_rgba(182,42,34,.24)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(182,42,34,.28)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isStarting || !canStart}
            onClick={onStart}
            type="button"
          >
            <Navigation aria-hidden="true" className="h-5 w-5" />
            {isStarting
              ? "Iniciando…"
              : canStart
                ? "Iniciar navegación"
                : "GPS no disponible"}
          </button>
        ) : target.kind === "DELIVERY_ORDER" && !isFinal ? (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--erp-brand-red)] px-5 text-base font-black text-white shadow-[0_12px_30px_rgba(182,42,34,.24)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(182,42,34,.28)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canConfirmArrival}
            onClick={onOpenDelivery}
            type="button"
          >
            Abrir entrega
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : target.kind === "LOGISTICS_STOP" ? (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--erp-brand-red)] px-5 text-base font-black text-white shadow-[0_12px_30px_rgba(182,42,34,.24)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(182,42,34,.28)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canConfirmArrival}
            onClick={onArrived}
            type="button"
          >
            Llegué
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--erp-info)] px-5 text-base font-black text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(47,111,115,.28)]"
            onClick={onNextStop ?? onOpenDelivery}
            type="button"
          >
            Siguiente parada
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  );
}
