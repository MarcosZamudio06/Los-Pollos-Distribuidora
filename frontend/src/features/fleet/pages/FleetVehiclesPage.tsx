import { useMemo, useState } from "react";
import { MapPin, Pencil, Plus, RefreshCw, Search, Truck } from "lucide-react";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { ApiClientError } from "../../../lib/api";
import {
  Card as RouteCard,
  Field,
  PageFrame,
  PageShell,
  PrimaryButton,
  RouteHero,
  SelectInput,
  StatusMessage,
  TextInput,
} from "../../rutas-reparto/components/RouteUi";
import { useFleetOrigins } from "../hooks";
import { VehicleFormPanel } from "../components/VehicleFormPanel";
import {
  useCreateVehicle,
  useUpdateVehicle,
  useVehicles,
} from "../vehicleHooks";
import type {
  UpdateVehiclePayload,
  Vehicle,
  VehicleListFilters,
} from "../vehicleTypes";

const initialFilters: VehicleListFilters = {
  isActive: "",
  limit: 20,
  page: 1,
  search: "",
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function vehicleStatusTone(isActive: boolean) {
  return isActive ? "green" : "slate";
}

export function FleetVehiclesPage() {
  const [filters, setFilters] = useState<VehicleListFilters>(initialFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null | undefined>(
    undefined,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<{
    payload: UpdateVehiclePayload;
    vehicle: Vehicle;
  } | null>(null);

  const vehicles = useVehicles(filters);
  const origins = useFleetOrigins();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle(editingVehicle?.id ?? "");
  const locationNames = useMemo(
    () => new Map((origins.data ?? []).map((location) => [location.id, location.name])),
    [origins.data],
  );
  const items = vehicles.data?.items ?? [];
  const activeVisible = items.filter((vehicle) => vehicle.isActive).length;
  const assignedVisible = items.filter((vehicle) => vehicle.homeLocationId).length;

  function applyFilters() {
    setFilters((current) => ({
      ...current,
      page: 1,
      search: searchDraft.trim(),
    }));
  }

  function clearFilters() {
    setSearchDraft("");
    setFilters(initialFilters);
  }

  function closeForm() {
    setEditingVehicle(undefined);
    setActionError(null);
    setPendingDeactivation(null);
  }

  async function create(payload: Parameters<typeof createVehicle.mutateAsync>[0]) {
    setActionError(null);
    setFeedback(null);
    try {
      await createVehicle.mutateAsync(payload);
      closeForm();
      setFeedback("Unidad registrada correctamente.");
    } catch (error) {
      setActionError(errorMessage(error, "No se pudo registrar la unidad."));
    }
  }

  async function update(vehicleId: string, payload: UpdateVehiclePayload) {
    setActionError(null);
    setFeedback(null);
    const currentVehicle = editingVehicle;
    if (!currentVehicle || currentVehicle.id !== vehicleId) {
      setActionError("La unidad seleccionada ya no está disponible.");
      return;
    }
    if (currentVehicle.isActive && payload.isActive === false) {
      setPendingDeactivation({ payload, vehicle: currentVehicle });
      return;
    }
    try {
      await updateVehicle.mutateAsync(payload);
      closeForm();
      setFeedback("Unidad actualizada correctamente.");
    } catch (error) {
      setActionError(errorMessage(error, "No se pudo actualizar la unidad."));
    }
  }

  async function confirmDeactivation() {
    if (!pendingDeactivation) return;
    setActionError(null);
    try {
      await updateVehicle.mutateAsync(pendingDeactivation.payload);
      closeForm();
      setFeedback("Unidad desactivada correctamente.");
    } catch (error) {
      setActionError(errorMessage(error, "No se pudo desactivar la unidad."));
    }
  }

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={
            <PrimaryButton onClick={() => {
              setActionError(null);
              setFeedback(null);
              setEditingVehicle(null);
            }}>
              <Plus aria-hidden="true" size={17} />
              Nueva unidad
            </PrimaryButton>
          }
          eyebrow="Administración · Flota"
          subtitle="Registra y mantiene las unidades que estarán disponibles para la planeación de rutas. El historial de rutas y posiciones no se elimina al editar o desactivar una unidad."
          title="Unidades de entrega"
        />

        <section aria-label="Indicadores de unidades" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Unidades registradas", vehicles.data?.total ?? 0, "Catálogo completo"],
            ["Activas visibles", activeVisible, "Página actual"],
            ["Con base operativa", assignedVisible, "Página actual"],
            ["Disponibles para rutas", activeVisible, "Unidades activas"],
          ].map(([label, value, hint]) => (
            <RouteCard className="p-4" key={String(label)}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black tracking-[-0.06em] text-[var(--erp-foreground)]">
                {value}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                {hint}
              </p>
            </RouteCard>
          ))}
        </section>

        <Card className="overflow-hidden p-0">
          <CardHeader className="flex flex-col gap-3 bg-[var(--erp-charcoal)] p-4 text-white sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
                <Search className="h-4 w-4" /> Directorio operativo
              </p>
              <CardTitle className="mt-2 text-white">Buscar unidades</CardTitle>
              <p className="mt-1 text-sm text-white/70">
                Consulta por código, nombre operativo o placa.
              </p>
            </div>
            <Button
              onClick={clearFilters}
              type="button"
              variant="secondary"
            >
              Limpiar filtros
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:p-5 md:grid-cols-[1fr_15rem_auto] md:items-end">
            <Field label="Buscar unidad">
              <TextInput
                aria-label="Buscar unidad"
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyFilters();
                }}
                placeholder="Código, nombre o placa"
                value={searchDraft}
              />
            </Field>
            <Field label="Estado">
              <SelectInput
                aria-label="Filtrar por estado"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    isActive: event.target.value as VehicleListFilters["isActive"],
                    page: 1,
                  }))
                }
                value={filters.isActive}
              >
                <option value="">Todas</option>
                <option value="true">Activas</option>
                <option value="false">Inactivas</option>
              </SelectInput>
            </Field>
            <Button onClick={applyFilters} type="button">
              Aplicar filtros
            </Button>
          </CardContent>
        </Card>

        {feedback && <StatusMessage tone="success">{feedback}</StatusMessage>}
        {vehicles.isError && (
          <StatusMessage tone="error">
            {errorMessage(vehicles.error, "No se pudieron cargar las unidades.")}
          </StatusMessage>
        )}
        {origins.isError && (
          <StatusMessage tone="error">
            No se pudieron cargar las bases operativas. Puedes registrar la
            unidad sin asignar una base.
          </StatusMessage>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-2 border-b border-[color:var(--erp-border)] bg-[var(--erp-charcoal)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                Catálogo de flota
              </p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.05em] text-white">
                Unidades registradas
              </h2>
            </div>
            <Button
              aria-label="Actualizar catálogo de unidades"
              onClick={() => void vehicles.refetch()}
              size="sm"
              variant="secondary"
            >
              <RefreshCw className={vehicles.isFetching ? "animate-spin" : ""} size={15} />
              Actualizar
            </Button>
          </div>
          <div className="p-5">
            {vehicles.isLoading ? (
              <StatusMessage>Consultando unidades registradas...</StatusMessage>
            ) : items.length === 0 ? (
              <StatusMessage tone="empty">
                No hay unidades para los filtros actuales. Registra la primera
                unidad para habilitarla en el planificador.
              </StatusMessage>
            ) : (
              <div className="overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)]">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Unidad",
                        "Placa",
                        "Base operativa",
                        "Estado",
                        "Acciones",
                      ].map((label) => (
                        <th
                          className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"
                          key={label}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((vehicle) => (
                      <tr
                        className="transition hover:bg-[var(--erp-surface)]"
                        key={vehicle.id}
                      >
                        <td className="border-b border-[color:var(--erp-border)] px-4 py-4">
                          <p className="flex items-center gap-2 font-black">
                            <Truck className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />
                            {vehicle.code}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">
                            {vehicle.displayName}
                          </p>
                        </td>
                        <td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-mono text-xs font-bold">
                          {vehicle.plateNumber ?? "Sin placa"}
                        </td>
                        <td className="border-b border-[color:var(--erp-border)] px-4 py-4">
                          <span className="inline-flex items-center gap-2 text-sm font-semibold">
                            <MapPin className="h-4 w-4 text-[var(--erp-info)]" />
                            {vehicle.homeLocationId
                              ? locationNames.get(vehicle.homeLocationId) ??
                                "Base no disponible"
                              : "Sin base asignada"}
                          </span>
                        </td>
                        <td className="border-b border-[color:var(--erp-border)] px-4 py-4">
                          <Badge tone={vehicleStatusTone(vehicle.isActive)}>
                            {vehicle.isActive ? "Activa" : "Inactiva"}
                          </Badge>
                        </td>
                        <td className="border-b border-[color:var(--erp-border)] px-4 py-4 text-right">
                          <Button
                            onClick={() => {
                              setActionError(null);
                              setFeedback(null);
                              setEditingVehicle(vehicle);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Pencil size={15} /> Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {vehicles.data && vehicles.data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-[var(--erp-muted-foreground)]">
                <span>
                  Página {vehicles.data.page} de {vehicles.data.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={filters.page <= 1}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: current.page - 1,
                      }))
                    }
                    size="sm"
                    variant="outline"
                  >
                    Anterior
                  </Button>
                  <Button
                    disabled={filters.page >= vehicles.data.totalPages}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: current.page + 1,
                      }))
                    }
                    size="sm"
                    variant="outline"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </PageFrame>

      {editingVehicle !== undefined && (
        <VehicleFormPanel
          error={actionError}
          isSaving={createVehicle.isPending || updateVehicle.isPending}
          key={editingVehicle?.id ?? "new"}
          locations={origins.data ?? []}
          onClose={closeForm}
          onCreate={create}
          onUpdate={update}
          vehicle={editingVehicle}
        />
      )}

      <ConfirmationDialog
        confirmLabel="Desactivar unidad"
        description="La unidad dejará de aparecer como opción para nuevas rutas. Su historial de rutas, posiciones e incidencias permanecerá disponible."
        isLoading={updateVehicle.isPending}
        onConfirm={() => void confirmDeactivation()}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivation(null);
        }}
        open={Boolean(pendingDeactivation)}
        title="Confirmar desactivación"
      >
        <p>
          <strong>Unidad:</strong> {pendingDeactivation?.vehicle.code} · {pendingDeactivation?.vehicle.displayName}
        </p>
      </ConfirmationDialog>
    </PageShell>
  );
}
