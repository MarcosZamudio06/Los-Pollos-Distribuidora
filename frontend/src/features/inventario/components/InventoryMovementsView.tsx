import { useState } from 'react'
import { AsyncState } from './AsyncState'
import { useInventoryMovements } from '../hooks/useProducts'

const fieldClass =
  'h-11 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm text-[var(--erp-foreground)] shadow-sm outline-none transition placeholder:text-[var(--erp-muted-foreground)] focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]'
const cellClass = 'px-4 py-3 align-middle'

export function InventoryMovementsView() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({})
  const movements = useInventoryMovements(filters)
  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--erp-foreground)]">Movimientos de inventario</h2>
        <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Consulta operativa de entradas, salidas, ajustes, mermas y traspasos.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 md:grid-cols-6">
        <input className={fieldClass} placeholder="ID del producto" onChange={(event) => setFilters({ ...filters, productId: event.target.value })} />
        <input className={fieldClass} placeholder="ID de ubicación" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} />
        <select className={fieldClass} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Tipo de movimiento</option><option value="IN">Entrada</option><option value="OUT">Salida</option><option value="ADJUSTMENT">Ajuste</option><option value="SHRINKAGE">Merma</option><option value="RETURN">Devolución</option><option value="TRANSFER_OUT">Traspaso de salida</option><option value="TRANSFER_IN">Traspaso de entrada</option><option value="SALE">Venta</option><option value="PURCHASE">Compra</option></select>
        <input className={fieldClass} placeholder="Tipo de referencia" onChange={(event) => setFilters({ ...filters, referenceType: event.target.value })} />
        <input className={fieldClass} placeholder="ID de referencia" onChange={(event) => setFilters({ ...filters, referenceId: event.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2 md:col-span-6"><label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Desde<input className={`${fieldClass} text-sm normal-case tracking-normal`} type="date" onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label><label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Hasta<input className={`${fieldClass} text-sm normal-case tracking-normal`} type="date" onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label></div>
      </div>
      <AsyncState empty={!movements.data?.length} emptyMessage="No hay movimientos para estos filtros." error={movements.error} isLoading={movements.isLoading}>
        <div className="overflow-hidden rounded-2xl border border-[var(--erp-border)]"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><tr><th className={cellClass}>Producto</th><th className={cellClass}>Ubicación</th><th className={cellClass}>Tipo</th><th className={cellClass}>Kg</th><th className={cellClass}>Piezas</th><th className={cellClass}>Anterior / nuevo</th><th className={cellClass}>Motivo</th><th className={cellClass}>Referencia</th><th className={cellClass}>Usuario</th><th className={cellClass}>Fecha</th></tr></thead><tbody>{movements.data?.map((movement) => <tr key={movement.id} className="border-t border-[var(--erp-border)] transition hover:bg-[var(--erp-surface-muted)]/70"><td className={`${cellClass} font-semibold text-[var(--erp-foreground)]`}>{movement.productName ?? movement.productId ?? '—'}</td><td className={cellClass}>{movement.locationName ?? movement.locationId ?? '—'}</td><td className={cellClass}><span className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">{movement.type}</span></td><td className={`${cellClass} text-right font-semibold`}>{movement.quantityKg ?? '—'}</td><td className={`${cellClass} text-right font-semibold`}>{movement.quantityPieces ?? '—'}</td><td className={cellClass}>{movement.previousQuantityKg ?? movement.previousQuantityPieces ?? '—'} / {movement.newQuantityKg ?? movement.newQuantityPieces ?? '—'}</td><td className={`${cellClass} min-w-48 text-[var(--erp-muted-foreground)]`}>{movement.reason ?? '—'}</td><td className={cellClass}>{movement.referenceType || movement.referenceId ? `${movement.referenceType ?? 'REFERENCE'} ${movement.referenceId ?? ''}`.trim() : movement.reference ?? '—'}</td><td className={cellClass}>{movement.userName ?? movement.userId ?? '—'}</td><td className={`${cellClass} whitespace-nowrap text-[var(--erp-muted-foreground)]`}>{new Date(movement.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></div>
      </AsyncState>
    </section>
  )
}
