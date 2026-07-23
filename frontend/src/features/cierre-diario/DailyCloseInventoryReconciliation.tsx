import { useState, type FormEvent } from 'react'
import { ClipboardList, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import type { Product } from '../inventario/types'
import type { DailyCloseInventoryReconciliation } from './types'

type CountValues = { physicalQuantityKg?: number; physicalQuantityPieces?: number; reason: string }

function quantity(value: number | string | null | undefined) {
  return value === null || value === undefined ? 'Pendiente' : Number(value).toFixed(3)
}

function CountFields({ product, values }: { product: { unit?: string | null }; values?: { physicalQuantityKg: number | string | null; physicalQuantityPieces: number | null; reason: string } }) {
  return <>
    {product.unit !== 'PIECE' && <Input defaultValue={values?.physicalQuantityKg ?? ''} min="0" name="physicalQuantityKg" placeholder="Kg físicos" step="0.001" type="number" />}
    {product.unit !== 'KG' && <Input defaultValue={values?.physicalQuantityPieces ?? ''} min="0" name="physicalQuantityPieces" placeholder="Piezas físicas" step="1" type="number" />}
    <Input defaultValue={values?.reason ?? ''} name="reason" placeholder="Motivo del conteo" required />
  </>
}

function countValues(form: HTMLFormElement): CountValues {
  const data = new FormData(form)
  const kg = data.get('physicalQuantityKg')
  const pieces = data.get('physicalQuantityPieces')
  return {
    ...(typeof kg === 'string' && kg !== '' ? { physicalQuantityKg: Number(kg) } : {}),
    ...(typeof pieces === 'string' && pieces !== '' ? { physicalQuantityPieces: Number(pieces) } : {}),
    reason: String(data.get('reason') ?? '').trim(),
  }
}

function QuantityCell({ kg, pieces, tone }: { kg: number | string | null | undefined; pieces: number | null | undefined; tone?: string }) {
  return <td className={`px-3 py-3 tabular-nums ${tone ?? ''}`}>{quantity(kg)} kg<br />{pieces ?? 'Pendiente'} pz</td>
}

export function DailyCloseInventoryReconciliation({ canEdit, products, reconciliation, onDelete, onSave }: {
  canEdit: boolean
  products: Product[]
  reconciliation: DailyCloseInventoryReconciliation | null
  onDelete: (countId: string) => void
  onSave: (countId: string | undefined, productId: string, values: CountValues) => void
}) {
  const [productId, setProductId] = useState('')
  const selectedProduct = products.find((product) => product.id === productId)
  const countedProductIds = new Set(reconciliation?.items.filter((item) => item.count).map((item) => item.product.id))
  const availableProducts = products.filter((product) => !countedProductIds.has(product.id))
  const submitNewCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!productId) return
    onSave(undefined, productId, countValues(event.currentTarget))
    event.currentTarget.reset()
    setProductId('')
  }

  return <article className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)]">
    <header className="border-b border-[var(--erp-border)] p-5"><h3 className="flex items-center gap-2 font-bold"><ClipboardList size={18} /> Conteo físico por producto</h3><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">La existencia teórica se calcula con movimientos y ventas. Guardar un conteo nunca ajusta inventario.</p></header>
    {canEdit && <form className="grid gap-2 border-b border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 md:grid-cols-5" onSubmit={submitNewCount}>
      <Select aria-label="Producto para conteo" onChange={(event) => setProductId(event.target.value)} required value={productId}><option value="">Agregar producto al conteo</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</Select>
      {selectedProduct ? <CountFields product={selectedProduct} /> : <><Input disabled placeholder="Kg físicos" /><Input disabled placeholder="Piezas físicas" /><Input disabled placeholder="Motivo del conteo" /></>}
      <Button disabled={!selectedProduct} type="submit">Agregar conteo</Button>
    </form>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-left text-xs"><thead className="bg-[var(--erp-surface-muted)] uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]"><tr>{['Producto','Inicial','Entradas','Ventas','Otras salidas','Teórica','Física','Sobrante','Faltante','Motivo y responsable','Acciones'].map((label) => <th className="px-3 py-3 font-bold" key={label}>{label}</th>)}</tr></thead><tbody>{!reconciliation?.items.length ? <tr><td className="p-8 text-center text-[var(--erp-muted-foreground)]" colSpan={11}>No hay movimientos ni conteos para conciliar.</td></tr> : reconciliation.items.map((item) => {
      const values = item.count ? { physicalQuantityKg: item.physicalQuantityKg, physicalQuantityPieces: item.physicalQuantityPieces, reason: item.count.reason } : undefined
      return <tr className="border-t border-[var(--erp-border)] align-top" key={item.product.id}>
        <td className="px-3 py-3 font-bold"><p>{item.product.name}</p><p className="mt-1 font-normal text-[var(--erp-muted-foreground)]">{item.product.sku ?? item.product.unit}</p></td>
        <QuantityCell kg={item.openingQuantityKg} pieces={item.openingQuantityPieces} />
        <QuantityCell kg={item.entriesQuantityKg} pieces={item.entriesQuantityPieces} />
        <QuantityCell kg={item.soldQuantityKg} pieces={item.soldQuantityPieces} />
        <QuantityCell kg={item.otherOutputsQuantityKg} pieces={item.otherOutputsQuantityPieces} />
        <QuantityCell kg={item.theoreticalQuantityKg} pieces={item.theoreticalQuantityPieces} tone="font-bold" />
        <td className="px-3 py-3">{canEdit ? <form className="grid min-w-[300px] grid-cols-3 gap-2" onSubmit={(event) => { event.preventDefault(); onSave(item.count?.id, item.product.id, countValues(event.currentTarget)) }}><CountFields product={item.product} values={values} /><Button type="submit">Guardar</Button></form> : <span className="font-bold tabular-nums">{quantity(item.physicalQuantityKg)} kg<br />{item.physicalQuantityPieces ?? 'Pendiente'} pz</span>}</td>
        <QuantityCell kg={item.surplusQuantityKg} pieces={item.surplusQuantityPieces} tone="text-emerald-700" />
        <QuantityCell kg={item.shortageQuantityKg} pieces={item.shortageQuantityPieces} tone="text-amber-800" />
        <td className="px-3 py-3">{item.count ? <><p>{item.count.reason}</p><p className="mt-1 text-[var(--erp-muted-foreground)]">{item.count.countedBy.name}</p></> : 'Sin conteo'}</td>
        <td className="px-3 py-3">{canEdit && item.count && <Button aria-label={`Eliminar conteo de ${item.product.name}`} onClick={() => onDelete(item.count!.id)} size="sm" type="button" variant="ghost"><Trash2 size={16} /></Button>}</td>
      </tr>
    })}</tbody></table></div>
  </article>
}
