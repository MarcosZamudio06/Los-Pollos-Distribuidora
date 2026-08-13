import { useState } from "react";
import { PackageX, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardDescription, CardTitle } from "../../../components/ui";
import { getOperationalDate } from "../../../lib/operationalDate";
import { CedisTransferCommandPanel } from "../../cedis/CedisTransferCommandPanel";
import {
  useCedisBranchHistory,
  useCedisCycleSummary,
  useCreateCedisReturn,
  useOperationalLocation,
} from "../../cedis/hooks";
import type { CedisCycleCommand } from "../../cedis/types";
import { useProducts } from "../hooks/useProducts";
import { useAuth } from "../../auth";

export function BranchReturnsView() {
  const { user } = useAuth();
  const operationalLocation = useOperationalLocation(
    user?.operationalLocationId,
  );
  const businessDate = getOperationalDate();
  const isBranchWorker = Boolean(
    operationalLocation.data?.type === "BRANCH" &&
      (user?.role === "ADMIN" ||
        user?.role === "WAREHOUSE" ||
        user?.role === "SELLER"),
  );
  const branchHistory = useCedisBranchHistory(
    isBranchWorker ? user?.operationalLocationId : undefined,
    {
      dateFrom: businessDate,
      dateTo: businessDate,
      page: 1,
      limit: 1,
    },
  );
  const cycleId = isBranchWorker
    ? branchHistory.data?.items[0]?.cycle?.id
    : undefined;
  const cycleSummary = useCedisCycleSummary(cycleId);
  const products = useProducts(
    {
      isActive: "true",
      locationId: user?.operationalLocationId,
    },
    { enabled: Boolean(isBranchWorker && cycleId) },
  );
  const createReturn = useCreateCedisReturn(cycleId ?? "disabled");
  const [registrationOpen, setRegistrationOpen] = useState(false);

  async function handleRegisterReturn(
    payload: CedisCycleCommand,
    idempotencyKey: string,
  ) {
    await createReturn.mutateAsync({ payload, idempotencyKey });
    setRegistrationOpen(false);
    toast.success("Devolución registrada y enviada a CEDIS.");
  }

  if (user?.operationalLocationId && operationalLocation.isLoading) {
    return (
      <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
        <Card
          className="p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]"
          role="status"
        >
          Cargando ubicación operativa…
        </Card>
      </section>
    );
  }

  if (operationalLocation.error) {
    return (
      <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
        <p
          className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]"
          role="alert"
        >
          No se pudo identificar la ubicación operativa.
        </p>
      </section>
    );
  }

  if (!isBranchWorker) {
    return (
      <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
        <header className="rounded-2xl bg-[var(--erp-brand-red)] p-5 text-white shadow-[0_14px_32px_rgba(157,45,36,0.16)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
            Registro en sucursal
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-white">
            Devoluciones a CEDIS
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
            Esta pantalla se utiliza desde una sucursal para crear la
            devolución. La verificación se realiza en la sesión CEDIS de la
            sucursal.
          </p>
        </header>
        <Card className="p-8 text-center">
          <CardTitle>Registro disponible en sucursal</CardTitle>
          <CardDescription className="mt-2">
            Asigna una ubicación de sucursal para capturar productos no
            vendidos.
          </CardDescription>
        </Card>
      </section>
    );
  }

  const cycle = cycleSummary.data;
  const cycleError = branchHistory.error ?? cycleSummary.error;
  const branch = cycle?.branch;
  const cedis = cycle?.distributionCenter;

  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <header className="rounded-2xl bg-[var(--erp-brand-red)] p-5 text-white shadow-[0_14px_32px_rgba(157,45,36,0.16)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
          Registro en sucursal
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-white">
          Devoluciones a CEDIS
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
          Registra los productos no vendidos del ciclo operativo. La solicitud
          quedará disponible para verificación en la sesión CEDIS.
        </p>
      </header>

      {cycleError && (
        <p
          className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]"
          role="alert"
        >
          No se pudo cargar el ciclo operativo de la sucursal.
        </p>
      )}

      {branchHistory.isLoading || cycleSummary.isLoading ? (
        <Card
          className="p-8 text-center text-sm font-semibold text-[var(--erp-muted-foreground)]"
          role="status"
        >
          Cargando ciclo operativo…
        </Card>
      ) : !cycle || !branch || !cedis ? (
        <Card className="p-8 text-center">
          <PackageX className="mx-auto h-10 w-10 text-[var(--erp-muted-foreground)]" />
          <CardTitle className="mt-4">
            No hay ciclo operativo disponible
          </CardTitle>
          <CardDescription className="mt-2">
            La devolución estará disponible cuando CEDIS abra el ciclo de la
            sucursal para la fecha operativa actual.
          </CardDescription>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Productos no vendidos del ciclo</CardTitle>
              <CardDescription className="mt-1">
                Selecciona las cantidades que regresarán a {cedis.name}. La
                solicitud se reflejará en la sesión CEDIS.
              </CardDescription>
            </div>
            <Button onClick={() => setRegistrationOpen(true)}>
              <RotateCcw className="h-4 w-4" />
              Registrar devolución
            </Button>
          </Card>
          {registrationOpen && (
            <CedisTransferCommandPanel
              branch={branch}
              cedis={cedis}
              contextKey={`${cycle.id}:${cycle.version}:${businessDate}`}
              expectedVersion={cycle.version}
              mode="RETURN"
              onClose={() => setRegistrationOpen(false)}
              onSubmit={handleRegisterReturn}
              products={products.data ?? []}
              productsError={products.error}
              productsLoading={products.isLoading}
              sourceLocationId={user?.operationalLocationId}
              cycleItems={cycle.items}
              expectedSales={cycle.totals.expectedSales}
            />
          )}
        </>
      )}
    </section>
  );
}
