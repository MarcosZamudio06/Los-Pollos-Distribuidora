import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Package,
  RefreshCw,
  Scale,
  Truck,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "../../components/layout/PageContainer";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Input,
} from "../../components/ui";
import { getOperationalDate } from "../../lib/operationalDate";
import { cedisSocket } from "../../lib/cedisSocket";
import { useAuth } from "../auth";
import {
  useCedisIncomingSupplies,
  useCedisIncomingSupply,
  useReceiveCedisSupply,
} from "./hooks";
import { cedisQueryKeys } from "./queryKeys";
import type {
  CedisIncomingSupply,
  CedisIncomingSuppliesFilters,
  CedisReceiveSupplyCommand,
} from "./types";

type QuantityDraft = { quantityKg: number; quantityPieces: number };
type Draft = Record<string, QuantityDraft>;
type IncomingSuppliesMode = "worker" | "reviewer";
type IncomingStatusFilter = "ALL" | "PENDING";

const incomingPageCopy = {
  worker: {
    eyebrow: "Aviso a matriz",
    title: "Reporta lo que llegó",
    description:
      "Verifica físicamente el envío, registra una sola vez lo recibido y avisa a matriz. Si hay diferencias, agrega una nota; no necesitas enviar otro mensaje.",
    totalLabel: "Envíos en la vista",
    pendingLabel: "Pendientes de reporte",
    filterHint:
      "La diferencia se calcula por KG y piezas. Si existe, la nota es obligatoria.",
    emptyTitle: "No hay envíos pendientes",
    emptyDescription:
      "Cuando llegue un envío del CEDIS aparecerá aquí para verificarlo y avisar a matriz.",
  },
  reviewer: {
    eyebrow: "Bandeja de revisión",
    title: "Recepciones por confirmar",
    description:
      "Revisa la evidencia física, valida diferencias y confirma la recepción para cerrar el registro de la jornada.",
    totalLabel: "Recepciones en la vista",
    pendingLabel: "Por revisar",
    filterHint:
      "Revisa cantidades, diferencias y notas antes de confirmar la recepción.",
    emptyTitle: "No hay recepciones para revisar",
    emptyDescription:
      "Cuando exista una recepción pendiente aparecerá aquí con su evidencia física.",
  },
} as const;

const workerSteps = [
  {
    title: "Verifica lo que llegó",
    description: "Compara el envío con las cantidades físicas recibidas.",
  },
  {
    title: "Envía un solo reporte",
    description: "Registra las cantidades y agrega una nota si hay diferencia.",
  },
  {
    title: "Espera a matriz",
    description: "El reporte queda como evidencia; no envíes un segundo mensaje.",
  },
] as const;

const incomingDetailCopy = {
  worker: {
    eyebrow: "Paso 1 · Verifica lo que llegó",
    pendingStatus: "Listo para reportar",
    receivedStatus: "Reporte enviado a matriz",
    receivedDescription:
      "Matriz ya tiene este registro como evidencia. No necesitas enviar otro mensaje.",
    noteLabel: "Nota para matriz",
    noteHelper:
      "Si hay una diferencia, la nota es obligatoria. Este es el único aviso a matriz; no envíes otro mensaje.",
    submitLabel: "Avisar a matriz",
    pendingLabel: "Enviando reporte…",
    successToast: "Reporte enviado a matriz.",
  },
  reviewer: {
    eyebrow: "Evidencia para revisión",
    pendingStatus: "Por revisar",
    receivedStatus: "Recepción confirmada",
    receivedDescription:
      "Esta recepción ya quedó cerrada con la evidencia registrada.",
    noteLabel: "Nota de recepción",
    noteHelper:
      "Si hay una diferencia, la nota es obligatoria antes de confirmar. La confirmación cierra esta recepción.",
    submitLabel: "Confirmar recepción",
    pendingLabel: "Confirmando recepción…",
    successToast: "Recepción confirmada correctamente.",
  },
} as const;

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function dateTime(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Sin registrar";
}

function quantity(
  kg: number,
  pieces: number,
  unit?: CedisIncomingSupply["items"][number]["unit"],
) {
  if (unit === "PIECE") return `${pieces} piezas`;
  if (unit === "KG") return `${kg.toFixed(3)} kg`;
  return `${kg.toFixed(3)} kg · ${pieces} piezas`;
}

function createDraft(supply: CedisIncomingSupply): Draft {
  return Object.fromEntries(
    supply.items.map((item) => [
      item.transferItemId,
      { quantityKg: item.quantityKg, quantityPieces: item.quantityPieces },
    ]),
  );
}

function hasDifference(
  item: CedisIncomingSupply["items"][number],
  draft: QuantityDraft,
) {
  return (
    Math.abs(draft.quantityKg - item.quantityKg) > 0.000001 ||
    draft.quantityPieces !== item.quantityPieces
  );
}

function SupplyCard({
  supply,
  mode,
  selected,
  onSelect,
}: {
  supply: CedisIncomingSupply;
  mode: IncomingSuppliesMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const totalKg = supply.items.reduce((sum, item) => sum + item.quantityKg, 0);
  const totalPieces = supply.items.reduce(
    (sum, item) => sum + item.quantityPieces,
    0,
  );
  return (
    <button
      aria-pressed={selected}
      className={`w-full rounded-[1.5rem] border p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.28)] ${selected ? "border-[var(--erp-brand-gold)] bg-[var(--erp-surface-elevated)] shadow-[0_18px_42px_rgba(214,155,45,0.16)]" : "border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] hover:-translate-y-0.5 hover:border-[rgba(47,111,115,0.35)] hover:shadow-[var(--erp-shadow)]"}`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-deep)]">
            {supply.transferNumber}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-[-0.045em]">
            {supply.origin.name}
          </h2>
        </div>
        <Badge tone={supply.status === "RECEIVED" ? "green" : "amber"}>
          {supply.status === "RECEIVED"
            ? mode === "worker"
              ? "Reporte enviado"
              : "Confirmado"
            : mode === "worker"
              ? "Pendiente de reporte"
              : "Por revisar"}
        </Badge>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--erp-surface-muted)] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
            Sucursal destino
          </p>
          <p className="mt-1 font-bold">{supply.destination.name}</p>
        </div>
        <div className="rounded-xl bg-[var(--erp-surface-muted)] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
            Solicitud
          </p>
          <p className="mt-1 font-bold">{dateTime(supply.requestedAt)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[var(--erp-muted-foreground)]">
        <span className="rounded-full border border-[color:var(--erp-border)] px-3 py-1.5">
          {supply.items.length} productos
        </span>
        <span className="rounded-full border border-[color:var(--erp-border)] px-3 py-1.5">
          {totalKg.toFixed(3)} kg
        </span>
        <span className="rounded-full border border-[color:var(--erp-border)] px-3 py-1.5">
          {totalPieces} piezas
        </span>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">
        {supply.notes || "Sin nota de despacho."}
      </p>
    </button>
  );
}

function ReceiptDetail({
  mode,
  onClose,
  open,
  supply,
}: {
  mode: IncomingSuppliesMode;
  onClose: () => void;
  open: boolean;
  supply: CedisIncomingSupply;
}) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(supply));
  const [notes, setNotes] = useState(supply.receipt?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(idempotencyKey);
  const [isVisible, setIsVisible] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const receive = useReceiveCedisSupply();
  const copy = incomingDetailCopy[mode];
  function closeModal() {
    setIsVisible(false);
    onClose();
  }
  const closeModalFromEffect = useEffectEvent(closeModal);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTimer = window.setTimeout(() => {
      setIsVisible(true);
      closeButtonRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModalFromEffect();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  const differs = supply.items.some((item) =>
    hasDifference(
      item,
      draft[item.transferItemId] ?? { quantityKg: 0, quantityPieces: 0 },
    ),
  );

  function update(
    transferItemId: string,
    field: keyof QuantityDraft,
    value: string,
  ) {
    const next = value === "" ? 0 : Number(value);
    setDraft((current) => ({
      ...current,
      [transferItemId]: {
        ...(current[transferItemId] ?? { quantityKg: 0, quantityPieces: 0 }),
        [field]: Number.isFinite(next) ? next : 0,
      },
    }));
  }

  async function submit() {
    if (supply.receipt || receive.isPending) return;
    const items = supply.items.map((item) => ({
      transferItemId: item.transferItemId,
      quantityKg: draft[item.transferItemId]?.quantityKg ?? 0,
      quantityPieces: draft[item.transferItemId]?.quantityPieces ?? 0,
    }));
    if (differs && !notes.trim()) {
      setError("La nota es obligatoria cuando existe una diferencia.");
      return;
    }
    if (
      items.some(
        (item) =>
          item.quantityKg < 0 ||
          item.quantityPieces < 0 ||
          !Number.isInteger(item.quantityPieces),
      )
    ) {
      setError(
        "Las cantidades recibidas deben ser válidas y las piezas enteras.",
      );
      return;
    }
    const payload: CedisReceiveSupplyCommand = {
      expectedCycleVersion: supply.cycleVersion,
      items,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      setError(null);
      await receive.mutateAsync({
        transferId: supply.id,
        payload,
        idempotencyKey: key,
      });
      toast.success(copy.successToast);
      closeModal();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo registrar la recepción.",
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[rgba(25,31,28,0.56)] p-3 backdrop-blur-[1px] transition-opacity duration-200 motion-reduce:transition-none sm:p-6 ${isVisible ? "opacity-100" : "opacity-0"}`}
      data-testid="cedis-receipt-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
        aria-describedby="cedis-receipt-dialog-description"
        aria-labelledby="cedis-receipt-dialog-title"
        aria-modal="true"
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] shadow-[0_28px_80px_rgba(25,31,28,0.3)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:max-h-[min(92dvh,58rem)] sm:rounded-[2rem] ${isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"}`}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 flex-col gap-5 border-b border-[color:var(--erp-border)] bg-[#fffdf8] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--erp-info)]">
              {copy.eyebrow}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                Folio de transferencia
              </span>
              <h2
                className="text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)] sm:text-3xl"
                id="cedis-receipt-dialog-title"
              >
                {supply.transferNumber}
              </h2>
            </div>
            <p
              className="mt-3 text-sm font-semibold text-[var(--erp-foreground)]"
              id="cedis-receipt-dialog-description"
            >
              {supply.origin.name} <span className="px-1 text-[var(--erp-info)]">→</span>{" "}
              {supply.destination.name}
            </p>
            <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
              Solicitud registrada el {dateTime(supply.requestedAt)}
            </p>
          </div>
          <div className="flex items-start justify-between gap-3 sm:justify-end">
            <div className="grid justify-items-start gap-2 sm:justify-items-end">
              <Badge tone={supply.receipt ? "green" : "amber"}>
                {supply.receipt ? copy.receivedStatus : copy.pendingStatus}
              </Badge>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                Ciclo v{supply.cycleVersion}
              </p>
            </div>
            <button
              aria-label="Cerrar evidencia de recepción"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--erp-border)] text-[var(--erp-muted-foreground)] transition hover:bg-[var(--erp-surface-muted)] hover:text-[var(--erp-foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.2)] motion-reduce:transition-none"
              onClick={closeModal}
              ref={closeButtonRef}
              title="Cerrar"
              type="button"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto bg-[var(--erp-surface-muted)] p-4 sm:p-7">
          <section className="overflow-hidden rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)]">
            <div className="flex flex-col gap-2 border-b border-[color:var(--erp-border)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
                  Evidencia física
                </p>
                <h3 className="mt-1 text-lg font-black tracking-[-0.03em]">
                  Comparativo de recepción
                </h3>
              </div>
              <p className="text-xs font-semibold text-[var(--erp-muted-foreground)]">
                Enviado contra recibido
              </p>
            </div>
            <div className="overflow-x-auto">
              <table
                aria-label="Comparativo de cantidades enviadas, recibidas y diferencia"
                className="min-w-full text-left text-sm"
              >
                <thead className="bg-[var(--erp-surface-muted)] text-[10px] font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Enviado</th>
                    <th className="px-4 py-3">Recibido</th>
                    <th className="px-4 py-3">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {supply.items.map((item) => {
                    const itemDraft = draft[item.transferItemId] ?? {
                      quantityKg: 0,
                      quantityPieces: 0,
                    };
                    const kgDifference = itemDraft.quantityKg - item.quantityKg;
                    const piecesDifference =
                      itemDraft.quantityPieces - item.quantityPieces;
                    const receiptLine = supply.receipt?.items.find(
                      (line) => line.transferItemId === item.transferItemId,
                    );
                    const shownKgDifference = receiptLine
                      ? Number(receiptLine.differenceKg)
                      : kgDifference;
                    const shownPiecesDifference =
                      receiptLine?.differencePieces ?? piecesDifference;
                    const hasNegativeDifference =
                      shownKgDifference < 0 || shownPiecesDifference < 0;
                    const hasPositiveDifference =
                      shownKgDifference > 0 || shownPiecesDifference > 0;
                    const editable = !supply.receipt;
                    return (
                      <tr
                        className="border-t border-[color:var(--erp-border)]"
                        key={item.transferItemId}
                      >
                        <td className="px-4 py-4">
                          <p className="font-bold">{item.productName}</p>
                          <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                            {item.unit}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-semibold">
                          {quantity(
                            item.quantityKg,
                            item.quantityPieces,
                            item.unit,
                          )}
                        </td>
                        <td className="min-w-56 px-4 py-4">
                          {supply.receipt ? (
                            <span className="font-semibold">
                              {quantity(
                                Number(
                                  supply.receipt.items.find(
                                    (line) =>
                                      line.transferItemId ===
                                      item.transferItemId,
                                  )?.receivedKg ?? 0,
                                ),
                                supply.receipt.items.find(
                                  (line) =>
                                    line.transferItemId === item.transferItemId,
                                )?.receivedPieces ?? 0,
                                item.unit,
                              )}
                            </span>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                aria-label={`${item.productName} kilos recibidos`}
                                disabled={!editable || item.unit === "PIECE"}
                                min={0}
                                onChange={(event) =>
                                  update(
                                    item.transferItemId,
                                    "quantityKg",
                                    event.target.value,
                                  )
                                }
                                step="0.001"
                                type="number"
                                value={itemDraft.quantityKg || ""}
                              />
                              <Input
                                aria-label={`${item.productName} piezas recibidas`}
                                disabled={!editable || item.unit === "KG"}
                                min={0}
                                onChange={(event) =>
                                  update(
                                    item.transferItemId,
                                    "quantityPieces",
                                    event.target.value,
                                  )
                                }
                                step="1"
                                type="number"
                                value={itemDraft.quantityPieces || ""}
                              />
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <span
                            className={`inline-flex rounded-lg border px-2 py-1 font-black ${hasNegativeDifference ? "border-[rgba(157,45,36,0.24)] bg-[rgba(157,45,36,0.08)] text-[var(--erp-danger)]" : hasPositiveDifference ? "border-[rgba(63,123,65,0.24)] bg-[rgba(63,123,65,0.08)] text-[var(--erp-success)]" : "border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]"}`}
                          >
                            {supply.receipt ? (
                              <>
                                {Number(
                                  supply.receipt.items.find(
                                    (line) =>
                                      line.transferItemId ===
                                      item.transferItemId,
                                  )?.differenceKg ?? 0,
                                ) >= 0
                                  ? "+"
                                  : ""}
                                {supply.receipt.items.find(
                                  (line) =>
                                    line.transferItemId === item.transferItemId,
                                )?.differenceKg ?? "0.000"}{" "}
                                kg ·{" "}
                                {supply.receipt.items.find(
                                  (line) =>
                                    line.transferItemId === item.transferItemId,
                                )?.differencePieces ?? 0}{" "}
                                piezas
                              </>
                            ) : (
                              <>
                                {kgDifference >= 0 ? "+" : ""}
                                {kgDifference.toFixed(3)} kg ·{" "}
                                {piecesDifference >= 0 ? "+" : ""}
                                {piecesDifference} piezas
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label
              className="grid gap-2 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4 text-sm font-bold sm:p-5"
              htmlFor="receipt-notes"
            >
              <span>
                {copy.noteLabel}
                {differs && !supply.receipt ? " *" : ""}
              </span>
              <textarea
                className="min-h-32 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3 text-sm font-normal outline-none focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)] disabled:bg-[var(--erp-surface-muted)]"
                disabled={Boolean(supply.receipt)}
                id="receipt-notes"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Describe faltantes, sobrantes o incidencias."
                value={notes}
              />
              <span className="text-xs font-normal leading-5 text-[var(--erp-muted-foreground)]">
                {copy.noteHelper}
              </span>
            </label>
            {!supply.receipt && (
              <Button
                className="w-full lg:w-auto"
                disabled={receive.isPending}
                onClick={() => void submit()}
                size="lg"
              >
                <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
                {receive.isPending ? copy.pendingLabel : copy.submitLabel}
              </Button>
            )}
          </div>
          {supply.receipt && (
            <p
              className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-950"
              role="status"
            >
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-success)]"
              />
              <span>
                <strong>{copy.receivedStatus}.</strong>{" "}
                {copy.receivedDescription} Recibió {supply.receipt.receivedBy.name} el{" "}
                {dateTime(supply.receipt.receivedAt)}.
              </span>
            </p>
          )}
          {error && (
            <p
              className="mt-4 rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CedisIncomingSuppliesPage() {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>();
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const mode: IncomingSuppliesMode =
    user?.role === "SELLER" ? "worker" : "reviewer";
  const copy = incomingPageCopy[mode];
  const operationalDate = getOperationalDate();
  const businessDate = searchParams.get("date") ?? operationalDate;
  const rawStatus = searchParams.get("status");
  const statusFilter: IncomingStatusFilter =
    rawStatus === "ALL" ? "ALL" : "PENDING";
  const status = statusFilter === "ALL" ? undefined : statusFilter;
  const filters = useMemo<CedisIncomingSuppliesFilters>(
    () => ({ businessDate, ...(status ? { status } : {}) }),
    [businessDate, status],
  );
  const supplies = useCedisIncomingSupplies(filters);
  const detail = useCedisIncomingSupply(selectedId);
  const seenNotification = useRef<string | undefined>(undefined);
  const selectedSupply = selectedId
    ? detail.data ?? supplies.data?.items.find((item) => item.id === selectedId)
    : undefined;
  const socketLocationId =
    user?.operationalLocationId ?? supplies.data?.items[0]?.origin.id;

  useEffect(() => {
    if (!accessToken || !socketLocationId) return undefined;
    return cedisSocket.subscribe(
      accessToken,
      socketLocationId,
      (supply) => {
        if (supply.businessDate !== businessDate) return;
        if (seenNotification.current === supply.transferId) return;
        seenNotification.current = supply.transferId;
        void queryClient.invalidateQueries({
          queryKey: cedisQueryKeys.incomingSupplies(filters),
        });
        toast.info(`Nuevo envío CEDIS: ${supply.transferNumber}`, {
          description: `${supply.origin.name} → ${supply.destination.name}`,
        });
      },
      () => {
        void queryClient.invalidateQueries({
          queryKey: cedisQueryKeys.incomingSupplies(filters),
        });
      },
    );
  }, [accessToken, businessDate, filters, queryClient, socketLocationId]);

  function updateFilter(name: "date" | "status", value: string) {
    const next = new URLSearchParams(searchParams);
    if (name === "status" && value === "ALL") next.set(name, value);
    else if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  }

  return (
    <PageContainer>
      <section className="mx-auto flex max-w-[96rem] flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-[var(--erp-shadow-elevated)] sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(47,111,115,0.18),transparent_34%),linear-gradient(135deg,transparent,rgba(214,155,45,0.12))]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-brand-gold-deep)]">
                <Truck aria-hidden="true" className="h-4 w-4" />
                {copy.eyebrow}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--erp-muted-foreground)]">
                {copy.description}
              </p>
              {mode === "worker" ? (
                <ol
                  aria-label="Pasos para avisar a matriz"
                  className="mt-6 grid gap-3 sm:grid-cols-3"
                >
                  {workerSteps.map((step, index) => (
                    <li
                      className="flex gap-3 rounded-2xl border border-[color:var(--erp-border)] bg-white/75 p-3"
                      key={step.title}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--erp-brand-red)] text-xs font-black text-[var(--erp-on-brand)]">
                        {index + 1}
                      </span>
                      <span>
                        <strong className="block text-sm">{step.title}</strong>
                        <span className="mt-1 block text-xs leading-5 text-[var(--erp-muted-foreground)]">
                          {step.description}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-6 max-w-2xl rounded-2xl border border-[rgba(214,155,45,0.35)] bg-[rgba(214,155,45,0.1)] p-4 text-sm">
                  <p className="font-black text-[var(--erp-brand-gold-deep)]">
                    Revisión antes de confirmar
                  </p>
                  <p className="mt-1 leading-6 text-[var(--erp-muted-foreground)]">
                    Inspecciona diferencias y notas; la confirmación es el cierre
                    único de la recepción.
                  </p>
                </div>
              )}
            </div>
            <div className="relative grid grid-cols-2 gap-3 sm:min-w-80">
              <div className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 p-4">
                <Package
                  aria-hidden="true"
                  className="h-5 w-5 text-[var(--erp-brand-red)]"
                />
                <p className="mt-3 text-2xl font-black">
                  {supplies.data?.total ?? 0}
                </p>
                <p className="text-xs font-bold text-[var(--erp-muted-foreground)]">
                  {copy.totalLabel}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 p-4">
                <BellRing
                  aria-hidden="true"
                  className="h-5 w-5 text-[var(--erp-info)]"
                />
                <p className="mt-3 text-2xl font-black">
                  {supplies.data?.items.filter(
                    (item) => item.status === "PENDING",
                  ).length ?? 0}
                </p>
                <p className="text-xs font-bold text-[var(--erp-muted-foreground)]">
                  {copy.pendingLabel}
                </p>
              </div>
            </div>
          </div>
        </header>

        <Card className="p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(12rem,18rem)_auto_1fr] md:items-end">
            <label
              className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"
              htmlFor="incoming-date"
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Fecha operativa
              </span>
              <Input
                id="incoming-date"
                onChange={(event) => updateFilter("date", event.target.value)}
                type="date"
                value={businessDate}
              />
            </label>
            <label
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 py-2 text-xs font-bold normal-case tracking-normal text-[var(--erp-foreground)] transition hover:border-[rgba(47,111,115,0.35)] focus-within:ring-4 focus-within:ring-[rgba(214,155,45,0.16)] motion-reduce:transition-none"
              htmlFor="incoming-status-all"
            >
              <input
                checked={statusFilter === "ALL"}
                className="h-4 w-4 rounded border-[color:var(--erp-border)] accent-[var(--erp-brand-red)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.2)]"
                id="incoming-status-all"
                onChange={(event) =>
                  updateFilter("status", event.target.checked ? "ALL" : "")
                }
                type="checkbox"
              />
              <span>Mostrar todas las recepciones</span>
            </label>
            <div className="flex items-center justify-end gap-3 text-sm text-[var(--erp-muted-foreground)]">
              <Scale aria-hidden="true" className="h-5 w-5" />
              {copy.filterHint}
            </div>
          </div>
        </Card>

        {supplies.isLoading ? (
          <div
            className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]"
            role="status"
          >
            Cargando envíos del CEDIS…
          </div>
        ) : supplies.error ? (
          <Card className="p-8 text-center">
            <p className="font-bold text-[var(--erp-danger)]">
              No se pudo cargar la bandeja de recepción.
            </p>
            <Button
              className="mt-4"
              onClick={() => void supplies.refetch()}
              variant="secondary"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </Card>
        ) : supplies.data?.items.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--erp-success)]" />
            <CardTitle className="mt-4">{copy.emptyTitle}</CardTitle>
            <CardDescription className="mt-2">
              {copy.emptyDescription}
            </CardDescription>
          </Card>
        ) : (
          <div
            aria-label="Envíos del CEDIS"
            className="grid gap-5 md:grid-cols-2"
            role="list"
          >
            {supplies.data?.items.map((supply) => (
              <div key={supply.id} role="listitem">
                <SupplyCard
                  onSelect={() => {
                    setSelectedId(supply.id);
                    setIsReceiptOpen(true);
                  }}
                  mode={mode}
                  selected={selectedId === supply.id}
                  supply={supply}
                />
              </div>
            ))}
          </div>
        )}

        {selectedId && detail.isLoading && (
          <Card className="p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]">
            Cargando detalle…
          </Card>
        )}
        {selectedId && detail.error && (
          <Card className="p-8 text-center">
            <p className="font-bold text-[var(--erp-danger)]">
              No se pudo cargar el detalle del envío.
            </p>
            <Button
              className="mt-4"
              onClick={() => void detail.refetch()}
              variant="secondary"
            >
              Reintentar detalle
            </Button>
          </Card>
        )}
        {selectedSupply && (
          <ReceiptDetail
            key={`${selectedSupply.id}:${selectedSupply.receipt?.id ?? "pending"}`}
            mode={mode}
            onClose={() => setIsReceiptOpen(false)}
            open={isReceiptOpen}
            supply={selectedSupply}
          />
        )}
      </section>
    </PageContainer>
  );
}
