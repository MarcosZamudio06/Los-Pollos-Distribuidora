import { useMemo, useState } from "react";
import {
  CalendarDays,
  PackageCheck,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getOperationalDate } from "../../../lib/operationalDate";
import { CardDescription, CardTitle } from "../../../components/ui";
import {
  useCedisInventorySummary,
  useInventoryLocations,
} from "../hooks/useProducts";
import type { InventoryQuantity } from "../types";

function formatQuantity(value: InventoryQuantity) {
  const parts: string[] = [];
  if (Number(value.kg) !== 0) parts.push(`${value.kg} kg`);
  if (Number(value.pieces) !== 0) parts.push(`${value.pieces} pzas`);
  return parts.length > 0 ? parts.join(" · ") : "0";
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
      <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-3 text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}

export function CedisInventorySummaryPanel() {
  const locations = useInventoryLocations();
  const cedisLocations = useMemo(
    () =>
      (locations.data ?? []).filter(
        (location) => location.type === "DISTRIBUTION_CENTER",
      ),
    [locations.data],
  );
  const [selectedCedisId, setSelectedCedisId] = useState("");
  const [businessDate, setBusinessDate] = useState(getOperationalDate());
  const cedisLocationId = selectedCedisId || cedisLocations[0]?.id;
  const summary = useCedisInventorySummary(cedisLocationId, businessDate);
  const summaryData = summary.data;

  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-info)]">
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Conciliación CEDIS
          </p>
          <CardTitle className="mt-2">Inventario recibido y restante</CardTitle>
          <CardDescription className="mt-1">
            El restante es el saldo físico total del CEDIS, incluyendo
            existencias anteriores.
          </CardDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
            CEDIS
            <select
              className="h-10 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 text-sm font-semibold text-[var(--erp-foreground)]"
              disabled={locations.isLoading || cedisLocations.length === 0}
              onChange={(event) => setSelectedCedisId(event.target.value)}
              value={cedisLocationId ?? ""}
            >
              <option value="">Sin CEDIS disponible</option>
              {cedisLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
            Fecha operativa
            <span className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-3 h-4 w-4"
                aria-hidden="true"
              />
              <input
                className="h-10 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] pl-9 pr-3 text-sm font-semibold text-[var(--erp-foreground)]"
                onChange={(event) => setBusinessDate(event.target.value)}
                type="date"
                value={businessDate}
              />
            </span>
          </label>
        </div>
      </div>

      {locations.error || summary.error ? (
        <p className="rounded-xl border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">
          No se pudo cargar la conciliación del CEDIS.
        </p>
      ) : summary.isLoading ? (
        <p className="rounded-xl border border-[var(--erp-border)] p-3 text-sm text-[var(--erp-muted-foreground)]">
          Cargando movimientos del CEDIS...
        </p>
      ) : summaryData ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric
              icon={Truck}
              label="Recibido de proveedores"
              value={formatQuantity(summaryData.totals.receivedFromSuppliers)}
            />
            <SummaryMetric
              icon={PackageCheck}
              label="Enviado a sucursales"
              value={formatQuantity(summaryData.totals.sentToBranches)}
            />
            <SummaryMetric
              icon={RotateCcw}
              label="Devuelto al CEDIS"
              value={formatQuantity(summaryData.totals.returnedFromBranches)}
            />
            <SummaryMetric
              icon={PackageCheck}
              label="Restante físico"
              value={formatQuantity(summaryData.totals.remaining)}
            />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--erp-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--erp-surface-muted)] text-[11px] uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Recibido</th>
                  <th className="px-4 py-3">Enviado</th>
                  <th className="px-4 py-3">Devuelto</th>
                  <th className="px-4 py-3">Restante</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.items.map((item) => (
                  <tr
                    className="border-t border-[var(--erp-border)]"
                    key={item.productId}
                  >
                    <td className="px-4 py-3 font-semibold">
                      {item.productName}
                      <span className="ml-2 text-xs text-[var(--erp-muted-foreground)]">
                        {item.sku ?? item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatQuantity(item.opening)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatQuantity(item.receivedFromSuppliers)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatQuantity(item.sentToBranches)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatQuantity(item.returnedFromBranches)}
                    </td>
                    <td className="px-4 py-3 font-black tabular-nums">
                      {formatQuantity(item.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-[var(--erp-border)] p-3 text-sm text-[var(--erp-muted-foreground)]">
          Selecciona un CEDIS para consultar su inventario.
        </p>
      )}
    </section>
  );
}
