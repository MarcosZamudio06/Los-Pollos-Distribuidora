import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Package,
  RefreshCw,
  Scale,
  Truck,
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
  selected,
  onSelect,
}: {
  supply: CedisIncomingSupply;
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
          {supply.status === "RECEIVED" ? "Recibido" : "Pendiente"}
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

function ReceiptDetail({ supply }: { supply: CedisIncomingSupply }) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(supply));
  const [notes, setNotes] = useState(supply.receipt?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(idempotencyKey);
  const receive = useReceiveCedisSupply();

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
      toast.success("Recepción registrada correctamente.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo registrar la recepción.",
      );
    }
  }

  return (
    <Card className="overflow-hidden border-[rgba(47,111,115,0.22)]">
      <div className="border-b border-[color:var(--erp-border)] bg-[linear-gradient(135deg,rgba(47,111,115,0.08),rgba(214,155,45,0.09))] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--erp-info)]">
              Verificación física
            </p>
            <CardTitle className="mt-2 text-2xl">
              {supply.transferNumber}
            </CardTitle>
            <CardDescription className="mt-2">
              {supply.origin.name} → {supply.destination.name} ·{" "}
              {dateTime(supply.requestedAt)}
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-[color:var(--erp-border)] bg-white/70 p-3 text-sm">
            <p className="font-black">Ciclo v{supply.cycleVersion}</p>
            <p className="mt-1 text-[var(--erp-muted-foreground)]">
              {supply.receipt
                ? "Recepción cerrada"
                : "Pendiente de verificación"}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-7">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--erp-border)]">
          <table className="min-w-full text-left text-sm">
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
                                  line.transferItemId === item.transferItemId,
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
                    <td
                      className={`whitespace-nowrap px-4 py-4 font-black ${shownKgDifference < 0 || shownPiecesDifference < 0 ? "text-[var(--erp-danger)]" : shownKgDifference > 0 || shownPiecesDifference > 0 ? "text-[var(--erp-success)]" : "text-[var(--erp-muted-foreground)]"}`}
                    >
                      {supply.receipt ? (
                        <>
                          {Number(
                            supply.receipt.items.find(
                              (line) =>
                                line.transferItemId === item.transferItemId,
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label
            className="grid gap-2 text-sm font-bold"
            htmlFor="receipt-notes"
          >
            Nota de recepción{differs && !supply.receipt ? " *" : ""}
            <textarea
              className="min-h-24 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3 text-sm font-normal outline-none focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)] disabled:bg-[var(--erp-surface-muted)]"
              disabled={Boolean(supply.receipt)}
              id="receipt-notes"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Describe faltantes, sobrantes o incidencias."
              value={notes}
            />
          </label>
          {!supply.receipt && (
            <Button
              disabled={receive.isPending}
              onClick={() => void submit()}
              size="lg"
            >
              <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
              {receive.isPending ? "Guardando…" : "Confirmar recepción"}
            </Button>
          )}
        </div>
        {supply.receipt && (
          <p className="mt-4 text-sm text-[var(--erp-muted-foreground)]">
            Recibió {supply.receipt.receivedBy.name} el{" "}
            {dateTime(supply.receipt.receivedAt)}.
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
    </Card>
  );
}

export function CedisIncomingSuppliesPage() {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>();
  const operationalDate = getOperationalDate();
  const businessDate = searchParams.get("date") ?? operationalDate;
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus === "PENDING" || rawStatus === "RECEIVED" ? rawStatus : undefined;
  const filters = useMemo<CedisIncomingSuppliesFilters>(
    () => ({ businessDate, ...(status ? { status } : {}) }),
    [businessDate, status],
  );
  const supplies = useCedisIncomingSupplies(filters);
  const detail = useCedisIncomingSupply(selectedId);
  const seenNotification = useRef<string | undefined>(undefined);
  const selectedSupply =
    detail.data ?? supplies.data?.items.find((item) => item.id === selectedId);
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
    if (value) next.set(name, value);
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
                Control de recepción
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] sm:text-5xl">
                Envíos del CEDIS
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--erp-muted-foreground)]">
                Verifica lo que llegó a la sucursal sin perder la cantidad
                enviada, la diferencia física ni la nota de la jornada.
              </p>
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
                  Envíos del día
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
                  Por recibir
                </p>
              </div>
            </div>
          </div>
        </header>

        <Card className="p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(12rem,18rem)_minmax(12rem,18rem)_1fr] md:items-end">
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
              className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"
              htmlFor="incoming-status"
            >
              Estado
              <select
                className="h-10 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm font-normal text-[var(--erp-foreground)] outline-none focus:border-[var(--erp-brand-gold)]"
                id="incoming-status"
                onChange={(event) => updateFilter("status", event.target.value)}
                value={status ?? ""}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendientes</option>
                <option value="RECEIVED">Recibidos</option>
              </select>
            </label>
            <div className="flex items-center justify-end gap-3 text-sm text-[var(--erp-muted-foreground)]">
              <Scale aria-hidden="true" className="h-5 w-5" />
              La diferencia se calcula por KG y piezas antes de guardar.
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
            <CardTitle className="mt-4">
              No hay envíos para esta fecha
            </CardTitle>
            <CardDescription className="mt-2">
              Cuando el CEDIS solicite un suministro aparecerá aquí para su
              verificación.
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
                  onSelect={() => setSelectedId(supply.id)}
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
            supply={selectedSupply}
          />
        )}
      </section>
    </PageContainer>
  );
}
