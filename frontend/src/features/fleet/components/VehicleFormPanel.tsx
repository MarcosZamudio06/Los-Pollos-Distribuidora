import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@/components/ui";
import {
  createVehicleFormDraft,
  hasVehicleFormErrors,
  normalizeVehicleTextInput,
  toCreateVehiclePayload,
  toUpdateVehiclePayload,
  validateVehicleForm,
  type VehicleFormDraft,
  type VehicleFormField,
} from "../vehicleFormUtils";
import type { FleetLocation } from "../types";
import type { UpdateVehiclePayload, Vehicle } from "../vehicleTypes";

type VehicleFormPanelProps = {
  error?: string | null;
  isSaving?: boolean;
  locations: FleetLocation[];
  onClose: () => void;
  onCreate: (payload: ReturnType<typeof toCreateVehiclePayload>) => Promise<void> | void;
  onUpdate: (vehicleId: string, payload: UpdateVehiclePayload) => Promise<void> | void;
  vehicle?: Vehicle | null;
};

const fieldClass =
  "grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]";
type VehicleTextField = Exclude<VehicleFormField, "homeLocationId" | "isActive">;

export function VehicleFormPanel({
  error,
  isSaving = false,
  locations,
  onClose,
  onCreate,
  onUpdate,
  vehicle,
}: VehicleFormPanelProps) {
  const originalDraft = useMemo(
    () => createVehicleFormDraft(vehicle),
    [vehicle],
  );
  const [draft, setDraft] = useState<VehicleFormDraft>(originalDraft);
  const [errors, setErrors] = useState(validateVehicleForm(originalDraft));
  const isEditing = Boolean(vehicle);

  function updateField(field: VehicleFormField, value: string | boolean) {
    const nextDraft = { ...draft, [field]: value } as VehicleFormDraft;
    setDraft(nextDraft);
    setErrors(validateVehicleForm(nextDraft));
  }

  function blurTextField(field: VehicleTextField) {
    const nextDraft = {
      ...draft,
      [field]: normalizeVehicleTextInput(draft[field]),
    };
    setDraft(nextDraft);
    setErrors(validateVehicleForm(nextDraft));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateVehicleForm(draft);
    setErrors(nextErrors);
    if (hasVehicleFormErrors(nextErrors)) return;

    if (vehicle) {
      await onUpdate(vehicle.id, toUpdateVehiclePayload(draft, originalDraft));
    } else {
      await onCreate(toCreateVehiclePayload(draft));
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[rgba(17,24,21,0.46)]"
      />
      <aside
        aria-label={isEditing ? "Editar unidad" : "Registrar unidad"}
        className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-[color:var(--erp-border)] bg-[var(--erp-background)] p-4 shadow-2xl sm:p-6 md:w-[34rem]"
      >
        <Card className="overflow-hidden">
          <CardHeader className="bg-[var(--erp-charcoal)] p-5 text-white sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                  Flota operativa
                </p>
                <CardTitle className="mt-2 text-white">
                  {isEditing ? "Editar unidad" : "Registrar unidad"}
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  La unidad quedará disponible para asignarla a una ruta nueva.
                </p>
              </div>
              <button
                aria-label="Cerrar formulario de unidad"
                className="rounded-xl border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {error && (
              <p
                className="mb-4 rounded-xl border border-[rgba(157,45,36,.25)] bg-[rgba(157,45,36,.08)] p-3 text-sm font-bold text-[var(--erp-danger)]"
                role="alert"
              >
                {error}
              </p>
            )}
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className={fieldClass}>
                Código de unidad
                <Input
                  aria-invalid={Boolean(errors.code)}
                  autoComplete="off"
                  maxLength={80}
                  name="code"
                  onBlur={() => blurTextField("code")}
                  onChange={(event) => updateField("code", event.target.value)}
                  placeholder="UNIDAD-01"
                  required
                  value={draft.code}
                />
                {errors.code && (
                  <span className="normal-case tracking-normal text-[var(--erp-danger)]">
                    {errors.code}
                  </span>
                )}
              </label>
              <label className={fieldClass}>
                Nombre operativo
                <Input
                  aria-invalid={Boolean(errors.displayName)}
                  maxLength={160}
                  name="displayName"
                  onBlur={() => blurTextField("displayName")}
                  onChange={(event) =>
                    updateField("displayName", event.target.value)
                  }
                  placeholder="Reparto Centro"
                  required
                  value={draft.displayName}
                />
                {errors.displayName && (
                  <span className="normal-case tracking-normal text-[var(--erp-danger)]">
                    {errors.displayName}
                  </span>
                )}
              </label>
              <label className={fieldClass}>
                Placa <span className="font-semibold normal-case tracking-normal">(opcional)</span>
                <Input
                  aria-invalid={Boolean(errors.plateNumber)}
                  maxLength={40}
                  name="plateNumber"
                  onBlur={() => blurTextField("plateNumber")}
                  onChange={(event) =>
                    updateField("plateNumber", event.target.value)
                  }
                  placeholder="ABC-123"
                  value={draft.plateNumber}
                />
                {errors.plateNumber && (
                  <span className="normal-case tracking-normal text-[var(--erp-danger)]">
                    {errors.plateNumber}
                  </span>
                )}
              </label>
              <label className={fieldClass}>
                Base operativa <span className="font-semibold normal-case tracking-normal">(opcional)</span>
                <Select
                  aria-label="Base operativa"
                  name="homeLocationId"
                  onChange={(event) =>
                    updateField("homeLocationId", event.target.value)
                  }
                  value={draft.homeLocationId}
                >
                  <option value="">Sin base operativa</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
                <span className="normal-case tracking-normal text-[var(--erp-muted-foreground)]">
                  Solo se muestran ubicaciones operativas activas.
                </span>
              </label>
              {isEditing && (
                <label className={fieldClass}>
                  Estado de la unidad
                  <Select
                    aria-label="Estado de la unidad"
                    name="isActive"
                    onChange={(event) =>
                      updateField("isActive", event.target.value === "true")
                    }
                    value={String(draft.isActive)}
                  >
                    <option value="true">Activa</option>
                    <option value="false">Inactiva</option>
                  </Select>
                  <span className="normal-case tracking-normal text-[var(--erp-muted-foreground)]">
                    Una unidad con ruta en curso no puede desactivarse.
                  </span>
                </label>
              )}
              {!isEditing && (
                <p className="rounded-xl border border-[rgba(47,111,115,.20)] bg-[rgba(47,111,115,.08)] p-3 text-sm font-semibold leading-5 text-[var(--erp-info)]">
                  Las unidades nuevas se registran activas y aparecerán en el
                  selector del planificador.
                </p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button onClick={onClose} type="button" variant="outline">
                  Cancelar
                </Button>
                <Button
                  disabled={isSaving || hasVehicleFormErrors(errors)}
                  type="submit"
                >
                  {isSaving
                    ? "Guardando..."
                    : isEditing
                      ? "Guardar cambios"
                      : "Registrar unidad"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </aside>
    </>
  );
}
