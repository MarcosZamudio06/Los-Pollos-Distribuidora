import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui";
import { PageContainer } from "../../components/layout/PageContainer";
import { useAuth } from "../auth/useAuth";
import { useMapClientConfig } from "../maps/hooks";
import type { MapCoordinates } from "../maps/types";
import { BranchLocationForm } from "./BranchLocationForm";
import {
  buildCreateBranchLocationPayload,
  emptyBranchLocationFormValues,
  getBranchLocationSubmitError,
  validateBranchLocation,
} from "./branchLocationValidation";
import { useCedisLocations, useCreateBranchLocation } from "./hooks";
import type { BranchLocationFormValues } from "./branchLocationValidation";

const BranchLocationPicker = lazy(() => import("../maps/BranchLocationPicker"));

export function CedisBranchCreatePage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const cedisLocationsQuery = useCedisLocations();
  const createBranchLocation = useCreateBranchLocation();
  const mapConfig = useMapClientConfig().data;
  const [values, setValues] = useState<BranchLocationFormValues>(
    emptyBranchLocationFormValues,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const validationErrors = useMemo(
    () => validateBranchLocation(values),
    [values],
  );

  function handleChange(field: keyof BranchLocationFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setSubmitError(null);
  }

  function handleCoordinatesChange({ latitude, longitude }: MapCoordinates) {
    setValues((current) => ({
      ...current,
      latitude: String(latitude),
      longitude: String(longitude),
    }));
    setSubmitError(null);
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (Object.keys(validationErrors).length > 0) return;

    try {
      await createBranchLocation.mutateAsync(
        buildCreateBranchLocationPayload(values),
      );
      toast.success("Sucursal creada correctamente.");
      navigate("/cedis");
    } catch (error) {
      setSubmitError(getBranchLocationSubmitError(error));
    }
  }

  return (
    <PageContainer>
      <section className="mx-auto grid max-w-[80rem] gap-6">
        <header className="relative overflow-hidden rounded-[2rem] bg-[var(--erp-graphite)] p-6 text-white shadow-[var(--erp-shadow-elevated)] sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(214,155,45,0.24),transparent_34%),linear-gradient(135deg,transparent,rgba(182,42,34,0.16))]" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-brand-gold-soft)]">
                <Building2 aria-hidden="true" className="h-4 w-4" />
                Configuración operativa
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">
                Nueva sucursal
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
                Crea una ubicación que será abastecida desde un CEDIS activo.
                Esta captura no abre ciclos ni modifica inventario.
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-black text-white transition hover:border-white/40 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
              to="/cedis"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Volver a CEDIS
            </Link>
          </div>
        </header>

        <Card className="overflow-hidden border-[rgba(47,111,115,0.2)]">
          <CardContent className="grid gap-3 bg-[rgba(47,111,115,0.07)] p-5 sm:grid-cols-3 sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
                Flujo de alta
              </p>
              <p className="mt-2 text-sm font-bold text-[var(--erp-foreground)]">
                Identidad → CEDIS → ubicación
              </p>
            </div>
            <p className="text-sm leading-6 text-[var(--erp-muted-foreground)] sm:col-span-2">
              La dirección y las coordenadas siguen bajo control manual; el
              mapa es un asistente opcional dentro de la misma captura.
            </p>
          </CardContent>
        </Card>

        <BranchLocationForm
          cedisLocations={cedisLocationsQuery.data ?? []}
          errors={validationErrors}
          globalError={submitError}
          isCatalogLoading={cedisLocationsQuery.isLoading}
          isCatalogUnavailable={Boolean(cedisLocationsQuery.error)}
          isSubmitting={createBranchLocation.isPending}
          locationAssistant={
            <Suspense
              fallback={
                <div
                  aria-live="polite"
                  className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm text-[var(--erp-muted-foreground)]"
                  role="status"
                >
                  Cargando asistente cartográfico…
                </div>
              }
            >
              <BranchLocationPicker
                accessToken={accessToken}
                address={values.address}
                config={mapConfig}
                coordinates={(() => {
                  const latitude = Number(values.latitude);
                  const longitude = Number(values.longitude);
                  return values.latitude.trim() &&
                    values.longitude.trim() &&
                    Number.isFinite(latitude) &&
                    Number.isFinite(longitude)
                    ? { latitude, longitude }
                    : null;
                })()}
                disabled={
                  createBranchLocation.isPending ||
                  Boolean(cedisLocationsQuery.error)
                }
                onAddressChange={(address) => handleChange("address", address)}
                onCoordinatesChange={handleCoordinatesChange}
                showFields={false}
              />
            </Suspense>
          }
          onCancel={() => navigate("/cedis")}
          onChange={handleChange}
          onRetryCatalog={() => void cedisLocationsQuery.refetch()}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          values={values}
        />
      </section>
    </PageContainer>
  );
}
