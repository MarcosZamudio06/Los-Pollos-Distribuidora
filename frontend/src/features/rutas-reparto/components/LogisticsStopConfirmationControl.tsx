import { CheckCircle2, MapPin, PackageCheck } from "lucide-react";
import { useState } from "react";
import { ConfirmationDialog } from "../../../components/shared/confirmation-dialog";
import { Card, PrimaryButton, StatusMessage } from "./RouteUi";
import type { LogisticsStop } from "../types";

type LogisticsStopConfirmationControlProps = {
  error?: string | null;
  isCompleting: boolean;
  onComplete: () => void | Promise<void>;
  routeName: string;
  stop: LogisticsStop;
};

export function LogisticsStopConfirmationControl({
  error,
  isCompleting,
  onComplete,
  routeName,
  stop,
}: LogisticsStopConfirmationControlProps) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const isCompleted = stop.status === "COMPLETED";

  async function confirmCompletion() {
    await onComplete();
    setIsConfirmationOpen(false);
  }

  return (
    <>
      <Card className="overflow-hidden border-[rgba(47,111,115,0.30)] bg-white p-0">
        <div className="flex flex-col gap-4 bg-[var(--erp-info)] p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">
              <PackageCheck className="h-4 w-4" />
              Parada logística
            </p>
            <h3 className="mt-1 text-xl font-black tracking-[-0.04em] text-white">
              {isCompleted
                ? "Recepción física confirmada"
                : "Confirma la llegada al destino"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              {isCompleted
                ? "La parada de transporte quedó registrada. El control de inventario continúa en el módulo de inventario."
                : "Cuando estés en destino, confirma la entrega o recepción física del traslado. Esta acción no registra cobros ni movimientos de inventario."}
            </p>
          </div>
          {!isCompleted && (
            <PrimaryButton
              className="w-full sm:w-auto"
              disabled={isCompleting}
              onClick={() => setIsConfirmationOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isCompleting ? "Confirmando..." : "Confirmar recepción"}
            </PrimaryButton>
          )}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              Traslado
            </p>
            <p className="mt-1 break-words font-black">{stop.transferNumber}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
              <MapPin className="h-3.5 w-3.5" />
              Destino
            </p>
            <p className="mt-1 break-words font-black">
              {stop.destination?.name ?? "Sin ubicación de destino"}
            </p>
          </div>
          <p className="text-sm font-bold text-[var(--erp-muted-foreground)] sm:col-span-2">
            Productos en traslado: {stop.items.length}
          </p>
          {error && (
            <div className="sm:col-span-2">
              <StatusMessage tone="error">{error}</StatusMessage>
            </div>
          )}
        </div>
      </Card>

      <ConfirmationDialog
        confirmLabel="Confirmar recepción"
        description="Registra que llegaste al destino y que la entrega o recepción física del traslado fue confirmada. No registra cobros ni modifica existencias."
        isLoading={isCompleting}
        onConfirm={confirmCompletion}
        onOpenChange={setIsConfirmationOpen}
        open={isConfirmationOpen}
        title="¿Confirmar recepción física?"
      >
        <p>
          <strong>Ruta:</strong> {routeName}
        </p>
        <p>
          <strong>Traslado:</strong> {stop.transferNumber}
        </p>
        <p>
          <strong>Destino:</strong>{" "}
          {stop.destination?.name ?? "Sin ubicación de destino"}
        </p>
      </ConfirmationDialog>
    </>
  );
}
