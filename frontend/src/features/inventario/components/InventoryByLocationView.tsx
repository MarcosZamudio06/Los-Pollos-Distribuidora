import { AsyncState } from './AsyncState'
import { LowStockBadge } from './LowStockBadge'
import { useInventoryBalances } from '../hooks/useProducts'
import { TablePagination, useTablePagination } from '../../../components/shared/table-pagination'

const cellClass = 'px-4 py-3 align-middle'

export function InventoryByLocationView({ locationId }: { locationId?: string }) {
  const balances = useInventoryBalances({ locationId })
  const pagination = useTablePagination(balances.data ?? [])
  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--erp-foreground)]">Inventario por ubicación</h2>
        <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Usa el endpoint especificado para saldos; aquí no se infiere stock global por producto.</p>
      </div>
      <AsyncState empty={!balances.data?.length} emptyMessage="No hay saldos por ubicación para estos filtros." error={balances.error} isLoading={balances.isLoading}>
        <div className="overflow-hidden rounded-2xl border border-[var(--erp-border)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">
                <tr><th className={cellClass}>Producto</th><th className={cellClass}>Ubicación</th><th className={cellClass}>Kg</th><th className={cellClass}>Piezas</th><th className={cellClass}>Mínimo kg</th><th className={cellClass}>Mínimo piezas</th><th className={cellClass}>Estado</th></tr>
              </thead>
              <tbody>{pagination.pageItems.map((balance) => <tr key={`${balance.productId ?? 'product'}-${balance.locationId}`} className="border-t border-[var(--erp-border)] transition hover:bg-[var(--erp-surface-muted)]/70"><td className={`${cellClass} font-semibold text-[var(--erp-foreground)]`}>{balance.productName ?? balance.productId ?? '—'}</td><td className={cellClass}>{balance.locationName ?? balance.locationId}</td><td className={`${cellClass} text-right font-semibold`}>{balance.quantityKg}</td><td className={`${cellClass} text-right font-semibold`}>{balance.quantityPieces}</td><td className={`${cellClass} text-right text-[var(--erp-muted-foreground)]`}>{balance.minQuantityKg ?? balance.minimumKg ?? '—'}</td><td className={`${cellClass} text-right text-[var(--erp-muted-foreground)]`}>{balance.minQuantityPieces ?? balance.minimumPieces ?? '—'}</td><td className={cellClass}><LowStockBadge isLowStock={balance.isLowStock} /></td></tr>)}</tbody>
            </table>
          </div>
          <TablePagination {...pagination} total={balances.data?.length ?? 0} onPageChange={pagination.setPage} />
        </div>
      </AsyncState>
    </section>
  )
}
