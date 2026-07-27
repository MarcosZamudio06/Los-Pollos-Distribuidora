import { memo } from 'react'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { calculateItemSubtotal, getQuantityValidationError, toMoney } from '../posLogic'
import type { CartItem } from '../types'

type CartPanelProps = {
  activeItemId?: string
  highlightedItemId?: string
  items: CartItem[]
  onActivate?: (productId: string) => void
  onQuantityFocus?: (productId: string, field: 'kg' | 'pieces') => void
  onRemove: (productId: string) => void
  onQuantityChange: (productId: string, quantityKg: number, quantityPieces: number) => void
}

type CartTableProps = Pick<CartPanelProps, 'activeItemId' | 'highlightedItemId' | 'items' | 'onActivate' | 'onQuantityChange' | 'onQuantityFocus' | 'onRemove'>

function CartTable({ activeItemId, highlightedItemId, items, onActivate, onQuantityChange, onQuantityFocus, onRemove }: CartTableProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left xl:min-w-[42rem]">
        <caption className="sr-only">Partidas activas de la venta</caption>
        <thead className="sticky top-0 z-10 h-9 bg-[var(--pos-porcelain)] font-[var(--pos-mono)] text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]"><tr><th className="px-3" scope="col">Producto</th><th scope="col">Cantidad</th><th className="text-right" scope="col">Precio</th><th className="text-right" scope="col">Importe</th><th className="w-10" scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{items.map((item) => {
          const validation = getQuantityValidationError(item)
          const validationId = `cart-validation-${item.productId}`
          return <tr aria-selected={activeItemId === item.productId} className={`min-h-16 border-b border-[var(--pos-steel)] transition ${highlightedItemId === item.productId ? 'pos-cart-row-added' : ''} ${activeItemId === item.productId ? 'bg-[rgba(35,113,90,0.08)] shadow-[inset_3px_0_0_var(--pos-green)]' : 'hover:bg-[var(--pos-porcelain)]'}`} key={item.productId} onClick={() => onActivate?.(item.productId)}>
            <td className="max-w-0 px-3 align-middle"><p className="truncate text-sm font-bold">{item.name}</p><p className="font-[var(--pos-mono)] text-[0.65rem] font-bold text-[var(--pos-muted)]">{item.unit}</p>{item.unit === 'KG_AND_PIECE' && <p className="text-[0.62rem] text-[var(--pos-muted)]">Equivalencia activa</p>}</td>
            <td className="align-middle"><div className="flex gap-1.5">
              {(item.unit === 'KG' || item.unit === 'KG_AND_PIECE') && <label className="grid gap-0.5 text-[0.6rem] font-bold text-[var(--pos-muted)]">Kg
                <input aria-describedby={validation ? validationId : undefined} aria-label={`Kilos capturados de ${item.name}`} className="h-11 w-20 border border-[var(--pos-steel)] bg-white px-2 font-[var(--pos-mono)] text-sm text-[var(--pos-ink)] outline-none focus:border-[var(--pos-focus)]" min="0" onChange={(event) => onQuantityChange(item.productId, Number(event.target.value), item.quantityPieces)} onFocus={() => { onActivate?.(item.productId); onQuantityFocus?.(item.productId, 'kg') }} step="0.01" type="number" value={item.quantityKg || ''} />
              </label>}
              {(item.unit === 'PIECE' || item.unit === 'KG_AND_PIECE') && <label className="grid gap-0.5 text-[0.6rem] font-bold text-[var(--pos-muted)]">Pzas.
                <input aria-describedby={validation ? validationId : undefined} aria-label={`Piezas capturadas de ${item.name}`} className="h-11 w-20 border border-[var(--pos-steel)] bg-white px-2 font-[var(--pos-mono)] text-sm text-[var(--pos-ink)] outline-none focus:border-[var(--pos-focus)]" min="0" onChange={(event) => onQuantityChange(item.productId, item.quantityKg, Number(event.target.value))} onFocus={() => { onActivate?.(item.productId); onQuantityFocus?.(item.productId, 'pieces') }} step="1" type="number" value={item.quantityPieces || ''} />
              </label>}
            </div>{validation && <p className="mt-1 max-w-48 text-[0.62rem] font-bold text-[var(--pos-red)]" id={validationId} role="alert">{validation}</p>}</td>
            <td className="text-right align-middle font-[var(--pos-mono)] text-sm font-bold">{toMoney(item.unitPrice)}</td><td className="text-right align-middle font-[var(--pos-mono)] text-base font-black">{toMoney(calculateItemSubtotal(item))}</td>
            <td className="px-2 text-right align-middle"><button aria-label={`Eliminar ${item.name}`} className="inline-grid h-11 w-11 place-items-center text-[var(--pos-red)] transition hover:bg-[rgba(182,42,34,0.08)]" onClick={() => onRemove(item.productId)} type="button"><Trash2 className="h-4 w-4" /></button></td>
          </tr>
        })}</tbody>
      </table>
    </div>
  )
}

export const CartPanel = memo(function CartPanel({ activeItemId, highlightedItemId, items, onActivate, onQuantityChange, onQuantityFocus, onRemove }: CartPanelProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pos-steel)] px-3"><div className="flex items-baseline gap-2"><h2 className="text-sm font-bold">Carrito</h2><span className="font-[var(--pos-mono)] text-[0.65rem] font-bold text-[var(--pos-muted)]">{items.length} en carrito</span></div><ShoppingCart className="h-4 w-4 text-[var(--pos-muted)]" /></div>
      {items.length === 0 ? <p className="m-3 border border-dashed border-[var(--pos-steel)] p-4 text-sm text-[var(--pos-muted)]">Agrega productos para iniciar una venta. Los carritos vacíos no se pueden confirmar.</p> : <CartTable activeItemId={activeItemId} highlightedItemId={highlightedItemId} items={items} onActivate={onActivate} onQuantityChange={onQuantityChange} onQuantityFocus={onQuantityFocus} onRemove={onRemove} />}
    </section>
  )
})

export type { CartPanelProps }
