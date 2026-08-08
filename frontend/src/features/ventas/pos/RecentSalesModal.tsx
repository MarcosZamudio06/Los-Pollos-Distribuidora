import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { History, LoaderCircle, ReceiptText, X } from "lucide-react";
import { useSales } from "../hooks";
import {
  collectionStatusLabel,
  dateTime,
  documentTypeLabel,
  money,
  paymentTypeLabel,
  saleChannelLabel,
  saleStatusLabel,
} from "../saleLabels";

type RecentSalesModalProps = {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
}

function saleStatusClass(status?: string | null) {
  if (status === "CONFIRMED")
    return "border-[rgba(35,113,90,0.22)] bg-[rgba(35,113,90,0.09)] text-[var(--pos-green)]";
  if (status === "CANCELLED")
    return "border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] text-[var(--pos-red)]";
  return "border-[var(--pos-steel)] bg-[var(--pos-porcelain)] text-[var(--pos-muted)]";
}

function collectionStatusClass(status?: string | null) {
  if (status === "PAID")
    return "border-[rgba(35,113,90,0.22)] bg-[rgba(35,113,90,0.09)] text-[var(--pos-green)]";
  if (status === "CANCELLED")
    return "border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] text-[var(--pos-red)]";
  if (status === "PARTIALLY_PAID")
    return "border-[rgba(29,95,209,0.22)] bg-[rgba(29,95,209,0.08)] text-[var(--pos-neutral)]";
  return "border-[rgba(233,167,47,0.28)] bg-[rgba(233,167,47,0.12)] text-[#7d5a12]";
}

export function RecentSalesModal({
  onClose,
  returnFocusRef,
}: RecentSalesModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const queryFilters = useMemo(() => ({ limit: 8, page: 1 }), []);
  const sales = useSales(queryFilters);
  const items = sales.data?.items ?? [];
  const closeModal = useEffectEvent(onClose);

  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;
    const dialog: HTMLElement = dialogElement;
    const returnFocusElement = returnFocusRef.current;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    getFocusableElements(dialog)[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusElement?.focus();
      if (!returnFocusElement) previouslyFocused?.focus();
    };
  }, [returnFocusRef]);

  return (
    <aside
      aria-label="Ventas recientes"
      className="fixed inset-0 z-[60] overflow-y-auto bg-[rgba(22,26,24,0.42)] px-2 py-2 backdrop-blur-[1px] sm:px-4 sm:py-4"
    >
      <button
        aria-label="Cerrar ventas recientes"
        className="absolute inset-0 z-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section
        aria-describedby="pos-recent-sales-description"
        aria-labelledby="pos-recent-sales-title"
        aria-modal="true"
        className="pos-recent-sales-drop relative z-10 mx-auto mt-14 flex max-h-[calc(100dvh-4.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.25rem] border border-[var(--pos-steel)] bg-[var(--pos-surface)] shadow-[0_24px_60px_rgba(23,33,30,0.28)] sm:ml-auto sm:mr-0 sm:mt-14 sm:max-h-[min(82dvh,44rem)] sm:rounded-[1.5rem]"
        id="pos-recent-sales-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--pos-steel)] bg-white p-4 text-[var(--pos-ink)] sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-[var(--pos-mono)] text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-green)]">
              <History aria-hidden="true" className="h-4 w-4 shrink-0" />
              Consulta operativa
            </p>
            <h2
              className="mt-1 font-[var(--pos-display)] text-xl font-bold tracking-[-0.03em] text-[var(--pos-ink)] sm:text-2xl"
              id="pos-recent-sales-title"
            >
              Ventas recientes
            </h2>
            <p
              className="mt-1 max-w-xl text-xs leading-5 text-[var(--pos-muted)] sm:text-sm"
              id="pos-recent-sales-description"
            >
              Revisa las últimas operaciones sin salir del punto de venta.
            </p>
          </div>
          <button
            aria-label="Cerrar ventas recientes"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--pos-muted)] transition hover:bg-[var(--pos-surface-secondary)] hover:text-[var(--pos-ink)] focus-visible:outline-[var(--pos-focus)]"
            onClick={onClose}
            title="Cerrar"
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto bg-[var(--pos-porcelain)] p-3 sm:p-4">
          {sales.isLoading && (
            <p
              className="flex items-center gap-2 rounded-xl border border-[rgba(35,113,90,0.22)] bg-white p-4 text-sm font-bold text-[var(--pos-green)]"
              role="status"
            >
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
              Cargando ventas recientes...
            </p>
          )}

          {sales.error && (
            <div
              className="flex flex-col gap-3 rounded-xl border border-[rgba(182,42,34,0.22)] bg-white p-4 text-sm text-[var(--pos-red)] sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <p className="font-bold">
                No se pudieron cargar las ventas recientes.
              </p>
              <button
                className="h-10 shrink-0 rounded-lg border border-[var(--pos-red)] px-3 text-xs font-bold transition hover:bg-[rgba(182,42,34,0.08)]"
                onClick={() => void sales.refetch()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          )}

          {!sales.isLoading && !sales.error && items.length === 0 && (
            <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[var(--pos-steel)] bg-white px-4 py-10 text-center">
              <ReceiptText
                aria-hidden="true"
                className="h-7 w-7 text-[var(--pos-muted)]"
              />
              <p className="text-sm font-bold text-[var(--pos-ink)]">
                No hay ventas recientes para mostrar.
              </p>
              <p className="max-w-sm text-xs leading-5 text-[var(--pos-muted)]">
                Las operaciones visibles aparecerán aquí después de registrarse.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <ul aria-label="Últimas ventas" className="grid gap-2">
              {items.map((sale) => (
                <li
                  className="rounded-xl border border-[var(--pos-steel)] bg-white p-3 transition hover:border-[var(--pos-neutral)] sm:p-4"
                  key={sale.id}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--pos-porcelain)] text-[var(--pos-neutral)]">
                        <ReceiptText aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-[var(--pos-mono)] text-sm font-bold text-[var(--pos-ink)]">
                          {sale.saleNumber ?? sale.id}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-[var(--pos-ink)]">
                          {sale.customerName ?? "Público general"}
                        </p>
                        <p className="mt-1 truncate text-xs text-[var(--pos-muted)]">
                          {saleChannelLabel(sale.saleChannel)} · {paymentTypeLabel(sale.paymentType)}
                        </p>
                      </div>
                    </div>
                    <p className="whitespace-nowrap text-right font-[var(--pos-mono)] text-base font-black tabular-nums text-[var(--pos-ink)]">
                      {money(sale.total)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pos-steel)] pt-2">
                    <p className="text-xs text-[var(--pos-muted)]">
                      {dateTime(sale.createdAt)} · {documentTypeLabel(sale.documentType)}
                    </p>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-1 text-[0.62rem] font-bold ${saleStatusClass(sale.status)}`}
                      >
                        {saleStatusLabel(sale.status)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 text-[0.62rem] font-bold ${collectionStatusClass(sale.collectionStatus)}`}
                      >
                        {collectionStatusLabel(sale.collectionStatus)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[var(--pos-steel)] bg-white px-4 py-3 text-xs font-semibold text-[var(--pos-muted)] sm:px-5">
          Se muestran hasta 8 ventas visibles para tu usuario.
        </footer>
      </section>
    </aside>
  );
}
