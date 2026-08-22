import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ConfirmationDialog } from "../../../components/shared/confirmation-dialog";
import { Card, PrimaryButton, StatusMessage } from "./RouteUi";

type LogisticsRouteCompletionControlProps = {
  error?: string | null;
  isCompleting: boolean;
  onComplete: () => void | Promise<void>;
  routeName: string;
  stopCompleted: boolean;
};

export function LogisticsRouteCompletionControl({
  error,
  isCompleting,
  onComplete,
  routeName,
  stopCompleted,
}: LogisticsRouteCompletionControlProps) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  async function confirmCompletion() {
    await onComplete();
    setIsConfirmationOpen(false);
  }

  return (
    <>
      <Card className="overflow-hidden border-[rgba(47,111,115,0.30)] bg-white p-0">
        <div className="flex min-w-0 flex-col gap-4 bg-[var(--erp-info)] p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">
              <CheckCircle2 className="h-4 w-4" />
              Cierre de transporte
            </p>
            <h3 className="mt-1 break-words text-xl font-black tracking-[-0.04em] text-white">
              {stopCompleted
                ? "Ruta logística lista para terminar"
                : "Completa la parada para cerrar"}
            </h3>
            <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-white/75">
              {stopCompleted
                ? "La parada física está confirmada. Puedes finalizar el transporte sin revisar cuentas por cobrar de clientes."
                : "La ruta se puede cerrar después de confirmar la entrega o recepción física en el destino."}
            </p>
          </div>
          <PrimaryButton
            className="min-w-0 max-w-full w-full whitespace-normal px-3 text-center leading-5 sm:w-auto sm:px-5"
            disabled={!stopCompleted || isCompleting}
            onClick={() => setIsConfirmationOpen(true)}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleting ? "Terminando..." : "Terminar ruta"}
          </PrimaryButton>
        </div>
        <div className="grid min-w-0 gap-3 p-4 sm:p-5">
          <p className="text-sm font-bold text-[var(--erp-muted-foreground)]">
            Parada física: {stopCompleted ? "confirmada" : "pendiente"}
          </p>
          {error && <StatusMessage tone="error">{error}</StatusMessage>}
        </div>
      </Card>

      <ConfirmationDialog
        confirmLabel="Confirmar término"
        description="La ruta logística pasará a Completada y el seguimiento GPS dejará de aceptar nuevas posiciones."
        isLoading={isCompleting}
        onConfirm={confirmCompletion}
        onOpenChange={setIsConfirmationOpen}
        open={isConfirmationOpen}
        title="¿Terminar esta ruta logística?"
      >
        <p>
          <strong>Ruta:</strong> {routeName}
        </p>
        <p>
          <strong>Parada física:</strong> Confirmada
        </p>
      </ConfirmationDialog>
    </>
  );
}
