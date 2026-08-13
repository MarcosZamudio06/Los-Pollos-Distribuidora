import {
  Check,
  Edit3,
  MapPinned,
  MinusCircle,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusMessage,
  TextInput,
} from "../../rutas-reparto/components/RouteUi";
import { closeZonePolygon, isEditableZonePolygon } from "../deliveryZoneUtils";
import type {
  DeliveryZone,
  FleetCoordinate,
  FleetLocation,
} from "../types";

export type DeliveryZoneDraft = {
  id?: string;
  name: string;
  originLocationId: string;
  isActive: boolean;
  points: FleetCoordinate[];
};

type Props = {
  zones: DeliveryZone[];
  origins: FleetLocation[];
  canManage: boolean;
  selectedZoneId: string | null;
  draft: DeliveryZoneDraft | null;
  saving: boolean;
  error: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onStartCreate: () => void;
  onStartEdit: (zone: DeliveryZone) => void;
  onCancelDraft: () => void;
  onDraftChange: (patch: Partial<DeliveryZoneDraft>) => void;
  onClearPoints: () => void;
  onSave: () => void;
  onToggleActive: (zone: DeliveryZone) => void;
};

export function DeliveryZonesPanel({
  zones,
  origins,
  canManage,
  selectedZoneId,
  draft,
  saving,
  error,
  onSelectZone,
  onStartCreate,
  onStartEdit,
  onCancelDraft,
  onDraftChange,
  onClearPoints,
  onSave,
  onToggleActive,
}: Props) {
  const draftPolygon = draft ? closeZonePolygon(draft.points) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
            Geocercas persistidas
          </p>
          <h2 className="mt-2 text-xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">
            Zonas de reparto
          </h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[var(--erp-muted-foreground)]">
            El mapa representa polígonos calculados por backend. Los eventos ENTER y EXIT nunca se calculan en el navegador.
          </p>
        </div>
        {canManage && (
          <PrimaryButton onClick={onStartCreate}>
            <Plus aria-hidden="true" size={16} />
            Nueva zona
          </PrimaryButton>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      )}

      {canManage && draft && (
        <div className="mt-5 grid gap-4 rounded-2xl border border-[rgba(214,155,45,0.36)] bg-[rgba(214,155,45,0.08)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-brand-gold-deep)]">
                {draft.id ? "Editar zona" : "Crear zona"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--erp-foreground)]">
                Agrega o reemplaza el polígono haciendo clic sobre el mapa.
              </p>
            </div>
            <SecondaryButton onClick={onCancelDraft}>
              <X aria-hidden="true" size={15} />
              Cancelar
            </SecondaryButton>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <TextInput
                aria-label="Nombre de zona"
                autoComplete="off"
                onChange={(event) => onDraftChange({ name: event.target.value })}
                value={draft.name}
              />
            </Field>
            <Field label="Origen / CEDIS">
              <SelectInput
                aria-label="Origen de zona"
                onChange={(event) =>
                  onDraftChange({ originLocationId: event.target.value })
                }
                value={draft.originLocationId}
              >
                <option value="">Selecciona un origen</option>
                {origins.map((origin) => (
                  <option key={origin.id} value={origin.id}>
                    {origin.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[var(--erp-muted-foreground)]">
            <span className="inline-flex items-center gap-2">
              <MapPinned aria-hidden="true" size={15} />
              {draft.points.length} vértices capturados
            </span>
            <span>{draftPolygon ? "Polígono cerrado listo para validar" : "Se requieren 3 vértices distintos"}</span>
            <SecondaryButton onClick={onClearPoints}>
              <RotateCcw aria-hidden="true" size={14} />
              Limpiar polígono
            </SecondaryButton>
            <span className="ml-auto inline-flex items-center gap-2">
              <input
                aria-label="Zona activa"
                checked={draft.isActive}
                disabled={!draft.id}
                onChange={(event) => onDraftChange({ isActive: event.target.checked })}
                type="checkbox"
              />
              {draft.id ? "Activa" : "Se crea activa"}
            </span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <PrimaryButton
              disabled={
                saving ||
                !draft.name.trim() ||
                !draft.originLocationId ||
                !isEditableZonePolygon(draft.points)
              }
              onClick={onSave}
            >
              <Check aria-hidden="true" size={16} />
              {saving ? "Guardando..." : "Guardar zona"}
            </PrimaryButton>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-2">
        {zones.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] p-5 text-sm font-semibold text-[var(--erp-muted-foreground)]">
            No hay zonas para el origen seleccionado.
          </p>
        ) : (
          zones.map((zone) => {
            const selected = zone.id === selectedZoneId;
            const origin = origins.find((candidate) => candidate.id === zone.originLocationId);
            return (
              <div
                className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition ${selected ? "border-[var(--erp-brand-red)] bg-[rgba(182,42,34,0.06)]" : "border-[color:var(--erp-border)] bg-[var(--erp-surface)]"}`}
                key={zone.id}
              >
                <button
                  aria-pressed={selected}
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectZone(selected ? null : zone.id)}
                  type="button"
                >
                  <span className="block truncate text-sm font-black text-[var(--erp-foreground)]">
                    {zone.name}
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--erp-muted-foreground)]">
                    {origin?.name ?? zone.originLocationId} · {zone.isActive ? "Activa" : "Inactiva"}
                  </span>
                </button>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      aria-label={`Editar zona ${zone.name}`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-[color:var(--erp-border)] bg-white px-2.5 text-xs font-black text-[var(--erp-foreground)] hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)]"
                      onClick={() => onStartEdit(zone)}
                      type="button"
                    >
                      <Edit3 aria-hidden="true" size={14} />
                      Editar
                    </button>
                    <button
                      aria-label={`${zone.isActive ? "Desactivar" : "Activar"} zona ${zone.name}`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-[color:var(--erp-border)] bg-white px-2.5 text-xs font-black text-[var(--erp-foreground)] hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)]"
                      onClick={() => onToggleActive(zone)}
                      type="button"
                    >
                      <MinusCircle aria-hidden="true" size={14} />
                      {zone.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
