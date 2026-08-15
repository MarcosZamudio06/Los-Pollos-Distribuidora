import { Play } from "lucide-react";
import { useState } from "react";
import { ConfirmationDialog } from "../../../components/shared/confirmation-dialog";
import {
  Card,
  PrimaryButton,
  StatusMessage,
} from "./RouteUi";

type RouteStartControlProps = {
  error?: string | null;
  hasVehicle: boolean;
  isStarting: boolean;
  onStart: () => void | Promise<void>;
  routeName: string;
  vehicleName?: string | null;
};

export function RouteStartControl({
  error,
  hasVehicle,
  isStarting,
  onStart,
  routeName,
  vehicleName,
}: RouteStartControlProps) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  async function confirmStart() {
    await onStart();
    setIsConfirmationOpen(false);
  }

  return (
    <>
      <Card className="border-[rgba(214,155,45,0.34)] bg-[rgba(214,155,45,0.07)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
              <Play className="h-4 w-4" />
              Salida de ruta
            </p>
            <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">
              Ruta pendiente de iniciar
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">
              Inicia la ruta cuando estés listo. Después podrás habilitar el
              seguimiento GPS de {vehicleName ?? "la unidad asignada"}.
            </p>
          </div>
          {hasVehicle ? (
            <PrimaryButton
              disabled={isStarting}
              onClick={() => setIsConfirmationOpen(true)}
            >
              <Play className="h-4 w-4" />
              {isStarting ? "Iniciando..." : "Iniciar ruta"}
            </PrimaryButton>
          ) : (
            <StatusMessage tone="error">
              No puedes iniciar esta ruta porque no tiene una unidad asignada.
            </StatusMessage>
          )}
        </div>
        {error && (
          <div className="mt-4">
            <StatusMessage tone="error">{error}</StatusMessage>
          </div>
        )}
      </Card>

      <ConfirmationDialog
        confirmLabel="Confirmar inicio"
        description="La ruta pasará a En ruta y el seguimiento GPS podrá iniciarse desde este dispositivo."
        isLoading={isStarting}
        onConfirm={confirmStart}
        onOpenChange={setIsConfirmationOpen}
        open={isConfirmationOpen}
        title="¿Iniciar esta ruta?"
      >
        <p>
          <strong>Ruta:</strong> {routeName}
        </p>
        <p>
          <strong>Unidad:</strong> {vehicleName ?? "Sin unidad asignada"}
        </p>
      </ConfirmationDialog>
    </>
  );
}
