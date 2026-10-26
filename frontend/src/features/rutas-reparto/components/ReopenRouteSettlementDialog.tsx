import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "../../../components/ui/alert-dialog";
import { ApiClientError } from "../../../lib/api";
import { useReopenRouteSettlement } from "../hooks";
import type {
  ReopenRouteSettlementPayload,
  RouteSettlementDetail,
} from "../types";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  StatusMessage,
  TextInput,
} from "./RouteUi";

type Command = {
  idempotencyKey: string;
  payload: ReopenRouteSettlementPayload;
};
export function ReopenRouteSettlementDialog({
  settlementId,
  version,
  onClose,
  onReopened,
  onRefresh,
}: {
  settlementId: string;
  version: number;
  onClose: () => void;
  onReopened: () => void;
  onRefresh: () => Promise<RouteSettlementDetail>;
}) {
  const reopen = useReopenRouteSettlement(settlementId);
  const [reason, setReason] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(version);
  const [command, setCommand] = useState<Command>();
  const [error, setError] = useState<unknown>();
  const [refreshing, setRefreshing] = useState(false);
  const submitting = useRef(false);
  const conflict = error instanceof ApiClientError && error.statusCode === 409;
  const busy = reopen.isPending || refreshing;

  async function confirm() {
    if (submitting.current || conflict || !reason.trim() || expectedVersion < 1)
      return;
    submitting.current = true;
    const next = command ?? {
      idempotencyKey: crypto.randomUUID(),
      payload: { reason: reason.trim(), expectedVersion },
    };
    setCommand(next);
    setError(undefined);
    try {
      await reopen.mutateAsync(next);
      onReopened();
    } catch (cause) {
      setError(cause);
    } finally {
      submitting.current = false;
    }
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const current = await onRefresh();
      if (current.status !== "CLOSED") {
        onClose();
        return;
      }
      const currentVersion = Number(
        current.version ?? current.expectedVersion ?? 0,
      );
      if (currentVersion !== expectedVersion) {
        // An explicit authoritative refresh starts a new command, never a changed replay.
        setExpectedVersion(currentVersion);
        setCommand(undefined);
        setError(undefined);
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader className="rounded-xl bg-[var(--erp-brand-red)] p-4">
          <AlertDialogTitle className="text-white">
            Reabrir liquidación
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white">
            Confirma la reapertura para realizar correcciones autorizadas. Se
            conservarán los pagos, las evidencias y el cierre histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">
          Versión a reabrir: <strong>{expectedVersion}</strong>
        </p>
        <Field
          label="Motivo de reapertura"
          hint="El motivo quedará registrado junto con tu usuario y la fecha."
        >
          <TextInput
            autoFocus
            required
            value={reason}
            disabled={busy || Boolean(command)}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {error !== undefined && (
          <StatusMessage tone="error">
            {error instanceof Error
              ? error.message
              : "No se pudo reabrir la liquidación."}
            {conflict
              ? " Consulta el estado actual antes de confirmar de nuevo."
              : " Puedes reintentar el mismo comando; no se duplicará la reapertura."}
          </StatusMessage>
        )}
        {conflict && (
          <SecondaryButton disabled={busy} onClick={() => void refresh()}>
            Consultar estado actual
          </SecondaryButton>
        )}
        <AlertDialogFooter>
          <SecondaryButton disabled={busy} onClick={onClose}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            disabled={busy || conflict || !reason.trim() || expectedVersion < 1}
            onClick={() => void confirm()}
          >
            {busy ? "Procesando..." : "Confirmar reapertura"}
          </PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
