import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "../../components/layout/PageContainer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { formatMoney as money } from "../../lib/money";
import { getOperationalDate } from "../../lib/operationalDate";
import { getPosDeviceId } from "../../lib/deviceIdentity";
import { useAuth } from "../auth";
import { hasPermission, PERMISSIONS } from "../auth/permissions";
import { usePurchaseLocations } from "../compras/hooks";
import { locationTypeLabel } from "../compras/purchaseLabels";
import { useProducts } from "../inventario/hooks/useProducts";
import {
  DailyCloseGuidedFlow,
  type DailyCloseStepId,
} from "./DailyCloseGuidedFlow";
import { DailyCloseHeader } from "./DailyCloseHeader";
import { DailyCloseTransitionDialog } from "./DailyCloseTransitionDialog";
import { dailyCloseService } from "./dailyCloseService";
import {
  cashManagementService,
  type CashTerminal,
  type CashTerminalActivation,
} from "./cashManagementService";
import { CashShiftSummary } from "./CashShiftSummary";
import { dailyCloseErrorMessage } from "./dailyCloseErrors";
import type { DailyCloseReportAction } from "./dailyCloseTransition";
import {
  canAutoRefreshDailyClose,
  canUseLocationForDailyClose,
  canValidateDailyClose,
  type DailyClose,
  type DailyCloseInventoryReconciliation as InventoryReconciliation,
  type DailyCloseValidationResult,
} from "./types";

const statusLabel = {
  DRAFT: "Borrador",
  REVIEWED: "Revisado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};
const today = getOperationalDate();

export function DailyClosePage() {
  const { accessToken, user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedCloseId = searchParams.get("closeId");
  const [items, setItems] = useState<DailyClose[]>([]);
  const [selected, setSelected] = useState<DailyClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState("");
  const [businessDate, setBusinessDate] = useState(today);
  const [openingCash, setOpeningCash] = useState({
    terminalId: "",
    initialCashFund: "",
    initialCashIn: "",
    initialCashOut: "",
    notes: "",
  });
  const [terminals, setTerminals] = useState<CashTerminal[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [terminalRefreshKey, setTerminalRefreshKey] = useState(0);
  const [activation, setActivation] = useState<CashTerminalActivation | null>(
    null,
  );
  const [activationLoading, setActivationLoading] = useState(false);
  const deviceId = useMemo(() => getPosDeviceId(), []);
  const [expense, setExpense] = useState({
    amount: "",
    reason: "",
    reference: "",
  });
  const [ticket, setTicket] = useState({
    physicalFolio: "",
    weightKg: "",
    pieceCount: "",
    amount: "",
  });
  const [cashCountedTotal, setCashCountedTotal] = useState("");
  const [inventoryReconciliation, setInventoryReconciliation] =
    useState<InventoryReconciliation | null>(null);
  const [validationResult, setValidationResult] =
    useState<DailyCloseValidationResult | null>(null);
  const [reportAction, setReportAction] =
    useState<DailyCloseReportAction | null>(null);
  const [activeStep, setActiveStep] = useState<DailyCloseStepId>("operations");
  const locations = usePurchaseLocations();
  const closeLocations = useMemo(
    () =>
      (locations.data ?? []).filter((location) =>
        canUseLocationForDailyClose(location.type),
      ),
    [locations.data],
  );
  const canViewInventory = user?.role !== "COLLECTIONS";
  const canViewFinancials = user?.role !== "WAREHOUSE";
  const canEditDraft = user?.role === "ADMIN" || user?.role === "SELLER";
  const canRequestTerminalActivation =
    user?.role === "ADMIN" || user?.role === "SELLER";
  const canAuthorizeDifferences = hasPermission(
    user,
    PERMISSIONS.dailyCloseDifferencesAuthorize,
  );
  const canReopen = hasPermission(user, PERMISSIONS.dailyClosesReopen);
  const products = useProducts({
    isActive: "true",
    locationId: selected?.operationalLocationId ?? "",
  });

  const selectClose = useCallback(
    async (close: Pick<DailyClose, "id" | "status">, resetStep = false) => {
      setValidationResult(null);
      if (resetStep) setActiveStep("operations");
      const detail = canAutoRefreshDailyClose(close.status)
        ? await dailyCloseService.refresh(close.id, accessToken)
        : await dailyCloseService.get(close.id, accessToken);
      setSelected(detail);
      setInventoryReconciliation(
        canViewInventory
          ? await dailyCloseService.reconciliation(close.id, accessToken)
          : null,
      );
      return detail;
    },
    [accessToken, canViewInventory],
  );

  const load = async () => {
    try {
      setLoading(true);
      const data = await dailyCloseService.list(accessToken);
      setItems(data);
      const current = requestedCloseId
        ? data.find((item) => item.id === requestedCloseId)
        : selected
          ? data.find((item) => item.id === selected.id)
          : data[0];
      if (current) await selectClose(current);
      else {
        setSelected(null);
        setInventoryReconciliation(null);
      }
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible cargar los cierres."),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    dailyCloseService
      .list(accessToken)
      .then(async (data) => {
        if (!active) return;
        setItems(data);
        const requested = requestedCloseId
          ? data.find((item) => item.id === requestedCloseId)
          : undefined;
        const initial = requested ?? data[0];
        if (initial) {
          setLocationId(initial.operationalLocationId);
          setBusinessDate(initial.businessDate.slice(0, 10));
          await selectClose(initial, true);
        } else {
          setSelected(null);
          setInventoryReconciliation(null);
        }
      })
      .catch((error: unknown) => {
        if (active)
          toast.error(
            dailyCloseErrorMessage(error, "No fue posible cargar los cierres."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, requestedCloseId, selectClose]);

  useEffect(() => {
    if (!selected || !canAutoRefreshDailyClose(selected.status)) return;
    const interval = window.setInterval(() => {
      void selectClose(selected);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [selectClose, selected]);

  useEffect(() => {
    if (!locationId) {
      setTerminals([]);
      setActivation(null);
      setTerminalsLoading(false);
      setOpeningCash((current) => ({ ...current, terminalId: "" }));
      return;
    }
    let active = true;
    setTerminalsLoading(true);
    setActivation(null);
    cashManagementService
      .listTerminals(locationId, deviceId, accessToken)
      .then((items) => {
        if (!active) return;
        setTerminals(items);
        setOpeningCash((current) => ({
          ...current,
          terminalId: items[0]?.id ?? "",
        }));
      })
      .catch((error: unknown) => {
        if (active)
          toast.error(
            dailyCloseErrorMessage(
              error,
              "No fue posible consultar las terminales.",
            ),
          );
      })
      .finally(() => {
        if (active) setTerminalsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, deviceId, locationId, terminalRefreshKey]);

  const requestTerminalActivation = async () => {
    if (!locationId || activationLoading) return;
    setActivationLoading(true);
    try {
      setActivation(
        await cashManagementService.requestTerminalActivation(
          { deviceId, operationalLocationId: locationId },
          accessToken,
        ),
      );
      toast.success("Código temporal generado. Entrégalo a un administrador.");
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(
          error,
          "No fue posible generar el código temporal.",
        ),
      );
    } finally {
      setActivationLoading(false);
    }
  };

  const run = async (operation: () => Promise<DailyClose>, message: string) => {
    try {
      const close = await operation();
      setSelected(close);
      await load();
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible completar la operación."),
      );
      return false;
    }
  };

  const open = async (event: FormEvent) => {
    event.preventDefault();
    if (!locationId.trim())
      return toast.error("Selecciona una ubicación operativa.");
    if (!openingCash.terminalId)
      return toast.error(
        "Este dispositivo no tiene una terminal activa registrada.",
      );
    try {
      await cashManagementService.openShift(
        {
          terminalId: openingCash.terminalId,
          deviceId,
          businessDate,
          initialCashFund: Number(openingCash.initialCashFund || 0),
          initialCashIn: Number(openingCash.initialCashIn || 0),
          initialCashOut: Number(openingCash.initialCashOut || 0),
          notes: openingCash.notes.trim() || undefined,
        },
        accessToken,
      );
      await load();
      toast.success("Turno abierto y listo para vender.");
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible abrir el turno."),
      );
    }
  };
  const addExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !expense.reason.trim()) return;
    const idempotencyKey = crypto.randomUUID();
    try {
      const shift = await cashManagementService.currentShift(
        deviceId,
        accessToken,
      );
      if (!shift || shift.pointOfSaleDailyCloseId !== selected.id)
        throw new Error(
          "Abre tu turno en esta sucursal antes de registrar el gasto.",
        );
      await cashManagementService.recordMovement(
        shift.id,
        {
          deviceId,
          type: "EXPENSE",
          amount: Number(expense.amount),
          reason: expense.reason,
          reference: expense.reference || undefined,
        },
        accessToken,
        idempotencyKey,
      );
      setExpense({ amount: "", reason: "", reference: "" });
      await selectClose(selected);
      toast.success("Gasto registrado en el turno actual.");
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible registrar el gasto."),
      );
    }
  };
  const closeCashShift = async (
    shiftId: string,
    body: { cashCountedTotal: number; administrativeReason?: string },
  ) => {
    try {
      await cashManagementService.closeShift(
        shiftId,
        {
          ...body,
          ...(body.administrativeReason ? {} : { deviceId }),
        },
        accessToken,
      );
      if (selected) await selectClose(selected);
      toast.success(
        body.administrativeReason
          ? "Turno cerrado administrativamente."
          : "Turno cerrado y diferencia calculada.",
      );
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible cerrar el turno."),
      );
      throw error;
    }
  };
  const addTicket = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const idempotencyKey = crypto.randomUUID();
    void run(
      () =>
        dailyCloseService.ticket(
          selected.id,
          {
            physicalFolio: ticket.physicalFolio,
            capturedDate: businessDate,
            weightKg: ticket.weightKg ? Number(ticket.weightKg) : undefined,
            pieceCount: ticket.pieceCount
              ? Number(ticket.pieceCount)
              : undefined,
            amount: ticket.amount ? Number(ticket.amount) : undefined,
          },
          accessToken,
          idempotencyKey,
        ),
      "Referencia de báscula registrada.",
    );
    setTicket({ physicalFolio: "", weightKg: "", pieceCount: "", amount: "" });
  };
  const recordCashCount = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !cashCountedTotal.trim()) return;
    void run(
      () =>
        dailyCloseService.recordCashCount(
          selected.id,
          { cashCountedTotal: Number(cashCountedTotal) },
          accessToken,
        ),
      "Efectivo contado registrado.",
    );
    setCashCountedTotal("");
  };
  const saveInventoryCount = (
    countId: string | undefined,
    productId: string,
    values: {
      physicalQuantityKg?: number;
      physicalQuantityPieces?: number;
      reason: string;
    },
  ) => {
    if (!selected) return;
    const idempotencyKey = crypto.randomUUID();
    void run(
      () =>
        countId
          ? dailyCloseService.updateInventoryCount(
              selected.id,
              countId,
              values,
              accessToken,
            )
          : dailyCloseService.createInventoryCount(
              selected.id,
              { productId, ...values },
              accessToken,
              idempotencyKey,
            ),
      "Conteo físico guardado.",
    );
  };
  const deleteInventoryCount = (countId: string) => {
    if (!selected || !window.confirm("¿Eliminar este conteo físico?")) return;
    void run(
      () =>
        dailyCloseService.deleteInventoryCount(
          selected.id,
          countId,
          accessToken,
        ),
      "Conteo físico eliminado.",
    );
  };
  const justifyDifference = async (
    differenceId: string,
    reason: string,
    evidence: string,
  ) => {
    if (!selected) return;
    await run(
      () =>
        dailyCloseService.justifyDifference(
          selected.id,
          differenceId,
          { version: selected.version, reason, evidence },
          accessToken,
        ),
      "Diferencia justificada.",
    );
  };
  const authorizeDifference = async (differenceId: string) => {
    if (!selected) return;
    await run(
      () =>
        dailyCloseService.authorizeDifference(
          selected.id,
          differenceId,
          { version: selected.version },
          accessToken,
        ),
      "Diferencia autorizada.",
    );
  };
  const validate = async () => {
    if (!selected || !canValidateDailyClose(selected.status)) return;
    try {
      const result = await dailyCloseService.validate(selected.id, accessToken);
      setValidationResult(result);
      setSelected(result.close);
      setActiveStep("differences");
      if (result.valid) toast.success("Cierre validado.");
      else toast.error("La validación detectó bloqueantes.");
    } catch (error) {
      toast.error(
        dailyCloseErrorMessage(error, "No fue posible validar el cierre."),
      );
    }
  };
  const openShiftCount =
    selected?.cashShifts?.filter((shift) => shift.status === "OPEN").length ??
    0;
  const transition = (
    action: "validate" | "review" | "close" | "cancel" | "reopen",
  ) => {
    if (action === "validate") {
      void validate();
      return;
    }
    if (!selected) return;
    if (action === "close" && openShiftCount > 0) {
      toast.error(
        "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada.",
      );
      return;
    }
    if (action === "close" || action === "reopen") {
      if (action === "close") setActiveStep("signoff");
      setReportAction(action);
      return;
    }
    const reason =
      action === "cancel"
        ? window.prompt("Motivo para cancelar el cierre:")
        : undefined;
    if (action === "cancel" && !reason?.trim()) return;
    void run(
      () =>
        dailyCloseService.action(
          selected.id,
          action,
          { version: selected.version, ...(reason ? { reason } : {}) },
          accessToken,
        ),
      "Estado del cierre actualizado.",
    );
  };
  const confirmReportTransition = async (reason?: string) => {
    if (!selected || !reportAction) return;
    const success = await run(
      () =>
        dailyCloseService.action(
          selected.id,
          reportAction,
          { version: selected.version, ...(reason ? { reason } : {}) },
          accessToken,
        ),
      reportAction === "close" ? "Jornada cerrada." : "Cierre reabierto.",
    );
    if (success) setReportAction(null);
  };

  const editable = canEditDraft && selected?.status === "DRAFT";
  const canCloseDaily =
    user?.role === "ADMIN" &&
    selected?.status === "REVIEWED" &&
    openShiftCount === 0;
  const cashCountForm =
    editable && selected && (selected.cashShifts?.length ?? 0) === 0 ? (
      <form
        className="space-y-3 rounded-2xl border border-[var(--erp-brand-red)] bg-[var(--erp-surface-elevated)] p-5"
        onSubmit={recordCashCount}
      >
        <h3 className="font-bold">Registrar efectivo contado</h3>
        <p className="text-sm text-[var(--erp-muted-foreground)]">
          Esperado:{" "}
          <strong className="tabular-nums text-[var(--erp-foreground)]">
            {money(selected.netCashExpected)}
          </strong>
        </p>
        <Input
          required
          min="0"
          onChange={(event) => setCashCountedTotal(event.target.value)}
          placeholder="Efectivo contado"
          step="0.01"
          type="number"
          value={cashCountedTotal}
        />
        <Button type="submit">Guardar conteo</Button>
      </form>
    ) : undefined;
  const expenseForm = editable ? (
    <form
      className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"
      onSubmit={addExpense}
    >
      <h3 className="font-bold">Registrar gasto</h3>
      <div className="grid grid-cols-2 gap-2">
        <Input
          required
          min="0.01"
          onChange={(event) =>
            setExpense({ ...expense, amount: event.target.value })
          }
          placeholder="Importe"
          step="0.01"
          type="number"
          value={expense.amount}
        />
        <Input
          onChange={(event) =>
            setExpense({ ...expense, reference: event.target.value })
          }
          placeholder="Referencia"
          value={expense.reference}
        />
      </div>
      <Input
        required
        onChange={(event) =>
          setExpense({ ...expense, reason: event.target.value })
        }
        placeholder="Motivo del gasto"
        value={expense.reason}
      />
      <Button type="submit">Guardar gasto</Button>
    </form>
  ) : undefined;
  const scaleTicketForm = editable ? (
    <form
      className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"
      onSubmit={addTicket}
    >
      <h3 className="font-bold">Capturar referencia de báscula</h3>
      <Input
        required
        onChange={(event) =>
          setTicket({ ...ticket, physicalFolio: event.target.value })
        }
        placeholder="Folio físico"
        value={ticket.physicalFolio}
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          min="0"
          onChange={(event) =>
            setTicket({ ...ticket, weightKg: event.target.value })
          }
          placeholder="Kilos"
          step="0.001"
          type="number"
          value={ticket.weightKg}
        />
        <Input
          min="0"
          onChange={(event) =>
            setTicket({ ...ticket, pieceCount: event.target.value })
          }
          placeholder="Piezas"
          type="number"
          value={ticket.pieceCount}
        />
        <Input
          min="0"
          onChange={(event) =>
            setTicket({ ...ticket, amount: event.target.value })
          }
          placeholder="Importe"
          step="0.01"
          type="number"
          value={ticket.amount}
        />
      </div>
      <Button type="submit">Guardar referencia</Button>
    </form>
  ) : undefined;

  return (
    <PageContainer className="space-y-6">
      <header className="relative overflow-hidden rounded-[1.75rem] border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-2 bg-[var(--erp-brand-red)]" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-brand-red)]">
              Apertura de turno
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Turnos y cierre diario
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted-foreground)]">
              Abre un turno en la terminal administrada de este dispositivo. El
              cierre diario consolida todos los turnos de la sucursal.
            </p>
            <p className="mt-2 font-mono text-xs text-[var(--erp-muted-foreground)]">
              Dispositivo: {deviceId}
            </p>
          </div>
          <form
            className="grid gap-2 sm:grid-cols-2 lg:min-w-[700px] lg:grid-cols-3"
            onSubmit={open}
          >
            <Select
              aria-label="Ubicación operativa"
              disabled={locations.isLoading}
              onChange={(event) => setLocationId(event.target.value)}
              value={locationId}
            >
              <option value="">
                {locations.isLoading
                  ? "Cargando ubicaciones..."
                  : "Selecciona punto de venta"}
              </option>
              {closeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {locationTypeLabel(location.type)}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Fecha operativa"
              max={today}
              onChange={(event) => setBusinessDate(event.target.value)}
              type="date"
              value={businessDate}
            />
            <Select
              aria-label="Terminal registrada"
              disabled={!locationId || terminals.length === 0}
              onChange={(event) =>
                setOpeningCash({
                  ...openingCash,
                  terminalId: event.target.value,
                })
              }
              required
              value={openingCash.terminalId}
            >
              <option value="">
                {terminalsLoading
                  ? "Consultando terminal..."
                  : locationId && terminals.length === 0
                    ? "Dispositivo sin terminal registrada"
                    : "Selecciona terminal"}
              </option>
              {terminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.name} · {terminal.code}
                </option>
              ))}
            </Select>
            {locationId &&
              !terminalsLoading &&
              terminals.length === 0 &&
              canRequestTerminalActivation && (
                <div
                  className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[rgba(180,122,16,.35)] bg-[rgba(214,155,45,.12)] p-4"
                  role="status"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-black">
                        <KeyRound className="h-4 w-4 text-[var(--erp-warning)]" />{" "}
                        Vinculación requerida
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--erp-muted-foreground)]">
                        Esta caja permanece bloqueada hasta que administración
                        vincule una terminal migrada a este navegador.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={activationLoading}
                        onClick={() => void requestTerminalActivation()}
                        type="button"
                        variant="outline"
                      >
                        {activationLoading ? "Generando..." : "Generar código"}
                      </Button>
                      <Button
                        onClick={() =>
                          setTerminalRefreshKey((value) => value + 1)
                        }
                        type="button"
                        variant="secondary"
                      >
                        <RefreshCw className="h-4 w-4" /> Reintentar
                      </Button>
                    </div>
                  </div>
                  {activation && (
                    <div className="mt-3 border-l-4 border-[var(--erp-brand-red)] bg-white px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--erp-muted-foreground)]">
                        Código temporal, vence en 15 minutos
                      </p>
                      <p className="mt-1 font-mono text-2xl font-black tracking-[.12em] text-[var(--erp-brand-red)]">
                        {activation.activationCode}
                      </p>
                      <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                        Un administrador debe abrir Terminales POS, elegir la
                        terminal heredada de esta sucursal y confirmar este
                        código.
                      </p>
                    </div>
                  )}
                </div>
              )}
            <Input
              aria-label="Fondo inicial"
              min="0"
              onChange={(event) =>
                setOpeningCash({
                  ...openingCash,
                  initialCashFund: event.target.value,
                })
              }
              placeholder="Fondo inicial"
              step="0.01"
              type="number"
              value={openingCash.initialCashFund}
            />
            <Input
              aria-label="Depósito inicial"
              min="0"
              onChange={(event) =>
                setOpeningCash({
                  ...openingCash,
                  initialCashIn: event.target.value,
                })
              }
              placeholder="Depósito inicial"
              step="0.01"
              type="number"
              value={openingCash.initialCashIn}
            />
            <Input
              aria-label="Retiro inicial"
              min="0"
              onChange={(event) =>
                setOpeningCash({
                  ...openingCash,
                  initialCashOut: event.target.value,
                })
              }
              placeholder="Retiro inicial"
              step="0.01"
              type="number"
              value={openingCash.initialCashOut}
            />
            <Input
              aria-label="Notas de apertura"
              onChange={(event) =>
                setOpeningCash({ ...openingCash, notes: event.target.value })
              }
              placeholder="Notas de apertura"
              value={openingCash.notes}
            />
            <Button
              className="sm:col-span-2 lg:col-span-3"
              disabled={
                locations.isLoading ||
                closeLocations.length === 0 ||
                !openingCash.terminalId
              }
              type="submit"
            >
              <Plus size={16} /> Abrir turno
            </Button>
          </form>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3">
          <div className="mb-3 flex items-center justify-between px-2">
            <h2 className="font-bold">Jornadas</h2>
            <Button onClick={() => void load()} size="sm" variant="ghost">
              <RefreshCw size={15} />
            </Button>
          </div>
          {loading ? (
            <p className="p-3 text-sm">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-sm text-[var(--erp-muted-foreground)]">
              Aún no hay cierres.
            </p>
          ) : (
            items.map((item) => (
              <button
                className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selected?.id === item.id ? "border-[var(--erp-brand-red)] bg-[var(--erp-surface-muted)]" : "border-transparent hover:bg-[var(--erp-surface-muted)]"}`}
                key={item.id}
                onClick={() => void selectClose(item, true)}
                type="button"
              >
                <span className="block font-semibold">
                  {item.operationalLocation.name}
                </span>
                <span className="mt-1 flex justify-between text-xs text-[var(--erp-muted-foreground)]">
                  <span>{item.businessDate.slice(0, 10)}</span>
                  <span>{statusLabel[item.status]}</span>
                </span>
              </button>
            ))
          )}
        </aside>
        {!selected ? (
          <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-[var(--erp-border)]">
            <p className="text-[var(--erp-muted-foreground)]">
              Abre o selecciona un cierre para comenzar.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            <DailyCloseHeader close={selected} />
            <CashShiftSummary
              canAdministrativelyClose={hasPermission(
                user,
                PERMISSIONS.cashShiftsAdministrativeClose,
              )}
              close={selected}
              currentUserId={user?.id}
              onCloseShift={closeCashShift}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--erp-muted-foreground)]">
                  Las acciones administrativas respetan la versión y la
                  validación vigente.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAutoRefreshDailyClose(selected.status) && (
                  <Button
                    onClick={() => void selectClose(selected)}
                    variant="ghost"
                  >
                    <RefreshCw size={16} /> Actualizar
                  </Button>
                )}
                {canEditDraft && canValidateDailyClose(selected.status) && (
                  <Button
                    onClick={() => transition("validate")}
                    variant="secondary"
                  >
                    <ClipboardCheck size={16} /> Validar
                  </Button>
                )}
                {user?.role === "ADMIN" && selected.status === "DRAFT" && (
                  <Button onClick={() => transition("review")}>
                    Marcar revisado
                  </Button>
                )}
                {user?.role === "ADMIN" && selected.status === "REVIEWED" && (
                  <Button
                    disabled={openShiftCount > 0}
                    onClick={() => transition("close")}
                  >
                    <CheckCircle2 size={16} /> Cerrar jornada
                  </Button>
                )}
                {canReopen && selected.status === "CLOSED" && (
                  <Button
                    onClick={() => transition("reopen")}
                    variant="secondary"
                  >
                    Reabrir
                  </Button>
                )}
                {user?.role === "ADMIN" && selected.status !== "CANCELLED" && (
                  <Button
                    onClick={() => transition("cancel")}
                    variant="destructive"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
            <DailyCloseGuidedFlow
              activeStep={activeStep}
              canAuthorizeDifferences={
                canAuthorizeDifferences && selected.status === "DRAFT"
              }
              canClose={canCloseDaily}
              canEditDifferences={Boolean(editable)}
              canEditInventory={Boolean(editable)}
              canViewFinancials={canViewFinancials}
              canViewInventory={canViewInventory}
              canViewProfit={user?.role === "ADMIN"}
              close={selected}
              expenseForm={expenseForm}
              inventoryReconciliation={inventoryReconciliation}
              onAuthorizeDifference={authorizeDifference}
              onDeleteInventoryCount={deleteInventoryCount}
              onJustifyDifference={justifyDifference}
              onRequestClose={() => transition("close")}
              onSaveInventoryCount={saveInventoryCount}
              onStepChange={setActiveStep}
              products={products.data ?? []}
              scaleTicketForm={scaleTicketForm}
              validationResult={validationResult}
              cashCountForm={cashCountForm}
            />
          </section>
        )}
      </div>
      {selected && reportAction && (
        <DailyCloseTransitionDialog
          action={reportAction}
          close={selected}
          onCancel={() => setReportAction(null)}
          onConfirm={confirmReportTransition}
        />
      )}
    </PageContainer>
  );
}
