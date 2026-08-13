import type { FormEvent } from "react";
import { ArrowRight, MapPin, Store } from "lucide-react";
import { Button, Card, CardContent, Input, Select } from "../../components/ui";
import type {
  BranchLocationFormValues,
  BranchLocationValidationErrors,
} from "./branchLocationValidation";
import type { CedisLocation } from "./types";

type BranchLocationFormProps = {
  cedisLocations: CedisLocation[];
  values: BranchLocationFormValues;
  errors: BranchLocationValidationErrors;
  globalError?: string | null;
  isCatalogLoading?: boolean;
  isCatalogUnavailable?: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onChange: (
    field: keyof BranchLocationFormValues,
    value: string,
  ) => void;
  onRetryCatalog?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function FieldError({
  field,
  message,
}: {
  field: string;
  message?: string;
}) {
  if (!message) return null;

  return (
    <span
      className="mt-1 block text-xs font-semibold text-[var(--erp-danger)]"
      id={`${field}-error`}
      role="alert"
    >
      {message}
    </span>
  );
}

function fieldDescribedBy(field: string, error?: string) {
  return error ? `${field}-error` : undefined;
}

export function BranchLocationForm({
  cedisLocations,
  errors,
  globalError,
  isCatalogLoading = false,
  isCatalogUnavailable = false,
  isSubmitting = false,
  onCancel,
  onChange,
  onRetryCatalog,
  onSubmit,
  values,
}: BranchLocationFormProps) {
  const selectedCedis = cedisLocations.find(
    (location) => location.id === values.parentId,
  );
  const displayedName = values.name.trim() || "Sucursal nueva";

  return (
    <form className="grid gap-5" noValidate onSubmit={onSubmit}>
      {globalError && (
        <div
          className="rounded-2xl border border-[rgba(157,45,36,0.28)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-semibold text-[var(--erp-danger)]"
          role="alert"
        >
          {globalError}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="bg-[var(--erp-graphite)] p-5 text-white">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
              <Store aria-hidden="true" className="h-4 w-4" />
              Identidad
            </p>
            <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
              Datos de la sucursal
            </h2>
          </div>
          <CardContent className="grid gap-4 p-5">
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-name"
            >
              Nombre de la sucursal
              <Input
                aria-describedby={fieldDescribedBy("branch-name", errors.name)}
                aria-invalid={Boolean(errors.name)}
                autoComplete="organization"
                id="branch-name"
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Ej. Sucursal Centro"
                value={values.name}
              />
              <FieldError field="branch-name" message={errors.name} />
            </label>

            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-code"
            >
              Código opcional
              <Input
                aria-describedby={fieldDescribedBy("branch-code", errors.code)}
                aria-invalid={Boolean(errors.code)}
                id="branch-code"
                onChange={(event) => onChange("code", event.target.value)}
                placeholder="Ej. SUC-CENTRO"
                value={values.code}
              />
              <FieldError field="branch-code" message={errors.code} />
            </label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-[var(--erp-graphite)] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
              Abastecimiento
            </p>
            <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
              Relación CEDIS → sucursal
            </h2>
          </div>
          <CardContent className="grid gap-4 p-5">
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-parent-id"
            >
              CEDIS padre
              <Select
                aria-describedby={fieldDescribedBy(
                  "branch-parent-id",
                  errors.parentId,
                )}
                aria-invalid={Boolean(errors.parentId)}
                disabled={
                  isCatalogLoading ||
                  isCatalogUnavailable ||
                  isSubmitting
                }
                id="branch-parent-id"
                onChange={(event) => onChange("parentId", event.target.value)}
                value={values.parentId}
              >
                <option value="">
                  {isCatalogLoading ? "Cargando CEDIS…" : "Selecciona un CEDIS"}
                </option>
                {cedisLocations
                  .filter((location) => location.isActive !== false)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.code ? ` · ${location.code}` : ""}
                    </option>
                  ))}
              </Select>
              <FieldError field="branch-parent-id" message={errors.parentId} />
            </label>

            <div
              aria-live="polite"
              className="rounded-2xl border border-[rgba(47,111,115,0.2)] bg-[rgba(47,111,115,0.07)] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-info)]">
                CEDIS → sucursal
              </p>
              <div className="mt-3 flex items-center gap-3 text-sm font-black text-[var(--erp-foreground)]">
                <span className="min-w-0 truncate">
                  {selectedCedis?.name ?? "Selecciona un CEDIS"}
                </span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--erp-brand-gold-deep)]" />
                <span className="min-w-0 truncate">{displayedName}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--erp-muted-foreground)]">
                La sucursal quedará lista para operar bajo el CEDIS seleccionado.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-[var(--erp-graphite)] p-5 text-white">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
            <MapPin aria-hidden="true" className="h-4 w-4" />
            Ubicación
          </p>
          <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
            Captura manual disponible
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            El mapa se integrará en una fase posterior. Puedes registrar ahora
            la dirección y las coordenadas sin perder capacidad operativa.
          </p>
        </div>
        <CardContent className="grid gap-4 p-5">
          <label
            className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
            htmlFor="branch-address"
          >
            Dirección operativa
            <Input
              aria-describedby={fieldDescribedBy("branch-address", errors.address)}
              aria-invalid={Boolean(errors.address)}
              autoComplete="street-address"
              id="branch-address"
              onChange={(event) => onChange("address", event.target.value)}
              placeholder="Ej. Av. Principal 123, Col. Centro"
              value={values.address}
            />
            <FieldError field="branch-address" message={errors.address} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-latitude"
            >
              Latitud
              <Input
                aria-describedby={fieldDescribedBy(
                  "branch-latitude",
                  errors.latitude ?? errors.coordinates,
                )}
                aria-invalid={Boolean(errors.latitude ?? errors.coordinates)}
                inputMode="decimal"
                id="branch-latitude"
                onChange={(event) => onChange("latitude", event.target.value)}
                placeholder="19.432608"
                type="number"
                value={values.latitude}
              />
              <FieldError
                field="branch-latitude"
                message={errors.latitude ?? errors.coordinates}
              />
            </label>
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-longitude"
            >
              Longitud
              <Input
                aria-describedby={fieldDescribedBy(
                  "branch-longitude",
                  errors.longitude ?? errors.coordinates,
                )}
                aria-invalid={Boolean(errors.longitude ?? errors.coordinates)}
                inputMode="decimal"
                id="branch-longitude"
                onChange={(event) => onChange("longitude", event.target.value)}
                placeholder="-96.1342"
                type="number"
                value={values.longitude}
              />
              <FieldError
                field="branch-longitude"
                message={errors.longitude ?? errors.coordinates}
              />
            </label>
          </div>

          {isCatalogUnavailable && (
            <div
              className="flex flex-col gap-3 rounded-2xl border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.07)] p-4 text-sm text-[var(--erp-danger)] sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <span>No se pudo cargar el catálogo de CEDIS activos.</span>
              {onRetryCatalog && (
                <Button onClick={onRetryCatalog} size="sm" variant="secondary">
                  Reintentar catálogo
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <Button disabled={isSubmitting} onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={isSubmitting || isCatalogLoading || isCatalogUnavailable}
          type="submit"
        >
          {isSubmitting ? "Guardando…" : "Crear sucursal"}
        </Button>
      </div>
    </form>
  );
}
