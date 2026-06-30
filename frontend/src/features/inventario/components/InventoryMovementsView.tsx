import { useState } from 'react'
import { AsyncState } from './AsyncState'
import { useInventoryMovements } from '../hooks/useProducts'

export function InventoryMovementsView() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({})
  const movements = useInventoryMovements(filters)
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-black tracking-[-0.04em]">Movimientos de inventario</h2>
      <div className="grid gap-3 rounded-3xl bg-white p-4 md:grid-cols-6">
        <input className="rounded-xl border p-3" placeholder="ID del producto" onChange={(event) => setFilters({ ...filters, productId: event.target.value })} />
        <input className="rounded-xl border p-3" placeholder="ID de ubicación" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} />
        <select className="rounded-xl border p-3" onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Tipo de movimiento</option><option value="IN">Entrada</option><option value="OUT">Salida</option><option value="ADJUSTMENT">Ajuste</option><option value="SHRINKAGE">Merma</option><option value="RETURN">Devolución</option><option value="TRANSFER_OUT">Traspaso de salida</option><option value="TRANSFER_IN">Traspaso de entrada</option><option value="SALE">Venta</option><option value="PURCHASE">Compra</option></select>
        <input className="rounded-xl border p-3" placeholder="Tipo de referencia" onChange={(event) => setFilters({ ...filters, referenceType: event.target.value })} />
        <input className="rounded-xl border p-3" placeholder="ID de referencia" onChange={(event) => setFilters({ ...filters, referenceId: event.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2 md:col-span-6"><label className="grid gap-1 text-xs font-bold uppercase tracking-[0.14em] text-[#68645c]">Desde<input className="rounded-xl border p-3 text-sm normal-case tracking-normal" type="date" onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label><label className="grid gap-1 text-xs font-bold uppercase tracking-[0.14em] text-[#68645c]">Hasta<input className="rounded-xl border p-3 text-sm normal-case tracking-normal" type="date" onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label></div>
      </div>
      <AsyncState empty={!movements.data?.length} emptyMessage="No hay movimientos para estos filtros." error={movements.error} isLoading={movements.isLoading}>
        <div className="overflow-x-auto rounded-3xl border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f3ee] text-xs uppercase tracking-[0.16em]"><tr><th className="p-4">Producto</th><th className="p-4">Ubicación</th><th className="p-4">Tipo</th><th className="p-4">Kg</th><th className="p-4">Piezas</th><th className="p-4">Anterior / nuevo</th><th className="p-4">Motivo</th><th className="p-4">Referencia</th><th className="p-4">Usuario</th><th className="p-4">Fecha</th></tr></thead><tbody>{movements.data?.map((movement) => <tr key={movement.id} className="border-t"><td className="p-4 font-bold">{movement.productName ?? movement.productId ?? '—'}</td><td className="p-4">{movement.locationName ?? movement.locationId ?? '—'}</td><td className="p-4">{movement.type}</td><td className="p-4">{movement.quantityKg ?? '—'}</td><td className="p-4">{movement.quantityPieces ?? '—'}</td><td className="p-4">{movement.previousQuantityKg ?? movement.previousQuantityPieces ?? '—'} / {movement.newQuantityKg ?? movement.newQuantityPieces ?? '—'}</td><td className="p-4">{movement.reason ?? '—'}</td><td className="p-4">{movement.referenceType || movement.referenceId ? `${movement.referenceType ?? 'REFERENCE'} ${movement.referenceId ?? ''}`.trim() : movement.reference ?? '—'}</td><td className="p-4">{movement.userName ?? movement.userId ?? '—'}</td><td className="p-4">{new Date(movement.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      </AsyncState>
    </section>
  )
}
