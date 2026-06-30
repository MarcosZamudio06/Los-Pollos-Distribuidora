import { AsyncState } from './AsyncState'
import { LowStockBadge } from './LowStockBadge'
import { useInventoryBalances } from '../hooks/useProducts'

export function InventoryByLocationView({ locationId }: { locationId?: string }) {
  const balances = useInventoryBalances({ locationId })
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.04em]">Inventario por ubicación</h2>
        <p className="mt-1 text-sm text-[#68645c]">Usa el endpoint especificado para saldos; aquí no se infiere stock global por producto.</p>
      </div>
      <AsyncState empty={!balances.data?.length} emptyMessage="No hay saldos por ubicación para estos filtros." error={balances.error} isLoading={balances.isLoading}>
        <div className="overflow-x-auto rounded-3xl border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f3ee] text-xs uppercase tracking-[0.16em] text-[#68645c]"><tr><th className="p-4">Producto</th><th className="p-4">Ubicación</th><th className="p-4">Kg</th><th className="p-4">Piezas</th><th className="p-4">Mínimo kg</th><th className="p-4">Mínimo piezas</th><th className="p-4">Estado</th></tr></thead><tbody>{balances.data?.map((balance) => <tr key={`${balance.productId ?? 'product'}-${balance.locationId}`} className="border-t"><td className="p-4 font-bold">{balance.productName ?? balance.productId ?? '—'}</td><td className="p-4">{balance.locationName ?? balance.locationId}</td><td className="p-4">{balance.quantityKg}</td><td className="p-4">{balance.quantityPieces}</td><td className="p-4">{balance.minQuantityKg ?? balance.minimumKg ?? '—'}</td><td className="p-4">{balance.minQuantityPieces ?? balance.minimumPieces ?? '—'}</td><td className="p-4"><LowStockBadge isLowStock={balance.isLowStock} /></td></tr>)}</tbody></table></div>
      </AsyncState>
    </section>
  )
}
