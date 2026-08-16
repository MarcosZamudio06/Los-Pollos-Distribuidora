import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ConfirmationDialog } from "../../../components/shared/confirmation-dialog";
import { Card, PrimaryButton, StatusMessage } from "./RouteUi";

type RouteCompletionControlProps = {
  completedOrders: number;
  error?: string | null;
  isCompleting: boolean;
  onComplete: () => void | Promise<void>;
  routeName: string;
  totalOrders: number;
};

export function RouteCompletionControl({
  completedOrders,
  error,
  isCompleting,
  onComplete,
  routeName,
  totalOrders,
}: RouteCompletionControlProps) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const canComplete = totalOrders > 0 && completedOrders === totalOrders;

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
              <CheckCircle2 className="h-4 w-4" />
              Cierre de ruta
            </p>
            <h3 className="mt-1 text-xl font-black tracking-[-0.04em] text-white">
              {canComplete
                ? "Ruta lista para terminar"
                : "Completa los pedidos para cerrar"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              {canComplete
                ? "Todos los pedidos tienen un estado final. Confirma para marcar la ruta como completada y detener el seguimiento GPS."
                : "Cada pedido debe quedar entregado, no entregado, cancelado, rechazado parcialmente o devuelto antes de terminar la ruta."}
            </p>
          </div>
          <PrimaryButton
            className="w-full sm:w-auto"
            disabled={!canComplete || isCompleting}
            onClick={() => setIsConfirmationOpen(true)}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleting ? "Terminando..." : "Terminar ruta"}
          </PrimaryButton>
        </div>
        <div className="grid gap-3 p-4 sm:p-5">
          <p className="text-sm font-bold text-[var(--erp-muted-foreground)]">
            Pedidos en estado final: {completedOrders} de {totalOrders}
          </p>
          {error && <StatusMessage tone="error">{error}</StatusMessage>}
        </div>
      </Card>

      <ConfirmationDialog
        confirmLabel="Confirmar término"
        description="La ruta pasará a Completada y el seguimiento GPS dejará de aceptar nuevas posiciones."
        isLoading={isCompleting}
        onConfirm={confirmCompletion}
        onOpenChange={setIsConfirmationOpen}
        open={isConfirmationOpen}
        title="¿Terminar esta ruta?"
      >
        <p>
          <strong>Ruta:</strong> {routeName}
        </p>
        <p>
          <strong>Pedidos cerrados:</strong> {completedOrders} de {totalOrders}
        </p>
      </ConfirmationDialog>
    </>
  );
}
