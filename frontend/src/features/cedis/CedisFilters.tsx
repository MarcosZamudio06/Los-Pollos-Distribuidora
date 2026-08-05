import { Filter } from "lucide-react";
import { Button, Card, CardContent, Input, Select } from "../../components/ui";
import { FieldLabel } from "../dashboard/dashboardComponents";
import type { CedisCycleStatus, CedisLocation } from "./types";

const statusOptions: Array<{ label: string; value: CedisCycleStatus | "" }> = [
  { label: "Todos los estados", value: "" },
  { label: "Abierto", value: "OPEN" },
  { label: "Listo para revisión", value: "READY_FOR_REVIEW" },
  { label: "Cerrado", value: "CLOSED" },
  { label: "Cancelado", value: "CANCELLED" },
];

export type CedisFilterValues = {
  businessDate: string;
  cedisLocationId: string;
  status?: CedisCycleStatus;
  search: string;
};

export function CedisFilters({
  cedisLocations,
  cedisLocationsError,
  cedisLocationsLoading,
  filters,
  onChange,
  onClear,
}: {
  cedisLocations: CedisLocation[];
  cedisLocationsError?: unknown;
  cedisLocationsLoading: boolean;
  filters: CedisFilterValues;
  onChange: (filters: CedisFilterValues) => void;
  onClear: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
            <Filter aria-hidden="true" className="h-4 w-4" />
            Filtros de operación
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">
            Consulta la jornada de las sucursales dentro del CEDIS autorizado.
          </p>
        </div>
        <Button onClick={onClear} variant="secondary">
          Limpiar filtros
        </Button>
      </div>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <FieldLabel htmlFor="cedis-business-date">
          Fecha operativa
          <Input
            id="cedis-business-date"
            onChange={(event) =>
              onChange({ ...filters, businessDate: event.target.value })
            }
            type="date"
            value={filters.businessDate}
          />
        </FieldLabel>
        <FieldLabel htmlFor="cedis-location">
          CEDIS
          <Select
            aria-describedby={
              cedisLocationsError ? "cedis-location-error" : undefined
            }
            disabled={cedisLocationsLoading || Boolean(cedisLocationsError)}
            id="cedis-location"
            onChange={(event) =>
              onChange({ ...filters, cedisLocationId: event.target.value })
            }
            value={filters.cedisLocationId}
          >
            <option value="">
              {cedisLocationsLoading ? "Cargando CEDIS…" : "Selecciona un CEDIS"}
            </option>
            {cedisLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.code ? ` · ${location.code}` : ""}
              </option>
            ))}
          </Select>
          {Boolean(cedisLocationsError) && (
            <span
              className="normal-case tracking-normal text-[var(--erp-danger)]"
              id="cedis-location-error"
              role="alert"
            >
              No se pudo cargar el catálogo de CEDIS.
            </span>
          )}
        </FieldLabel>
        <FieldLabel htmlFor="cedis-status">
          Estado del día
          <Select
            id="cedis-status"
            onChange={(event) =>
              onChange({
                ...filters,
                status: (event.target.value || undefined) as
                  | CedisCycleStatus
                  | undefined,
              })
            }
            value={filters.status ?? ""}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <FieldLabel htmlFor="cedis-search">
          Buscar sucursal
          <Input
            id="cedis-search"
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
            placeholder="Nombre o código"
            type="search"
            value={filters.search}
          />
        </FieldLabel>
      </CardContent>
    </Card>
  );
}
