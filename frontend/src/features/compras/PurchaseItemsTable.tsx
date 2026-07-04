import type { ChangeEvent } from 'react'
import type { OperationalUnit, Product, ProductPresentation } from '../inventario/types'
import { decimal, money, presentationLabel, unitLabel } from './purchaseLabels'
import type { PurchaseFormItem } from './types'

type PurchaseItemsTableProps = {
  errors?: string[]
  items: PurchaseFormItem[]
  onAddItem: (item: PurchaseFormItem) => void
  onRemoveItem: (productId: string) => void
  onUpdateItem: (productId: string, patch: Partial<PurchaseFormItem>) => void
  products: Product[]
}

function toNumberInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function productPresentation(product: Product): ProductPresentation {
  return (product.presentationType ?? product.presentation ?? 'KG') as ProductPresentation
}

function productUnit(product: Product): OperationalUnit {
  return (product.unit ?? product.operationalUnit ?? 'KG') as OperationalUnit
}

function buildItem(product: Product): PurchaseFormItem {
  return {
    productId: product.id,
    productName: product.name,
    presentationType: productPresentation(product),
    unit: productUnit(product),
    quantityKg: productUnit(product) === 'PIECE' ? 0 : 1,
    quantityPieces: productUnit(product) === 'KG' ? 0 : 1,
    unitCost: Number(product.purchaseCost ?? product.cost ?? 0),
    appliedEquivalentFactor: product.pieceWeightEquivalent ?? product.equivalentWeightKg ?? null,
    availableEquivalences: product.activeEquivalences ?? [],
  }
}

export function PurchaseItemsTable({ errors = [], items, onAddItem, onRemoveItem, onUpdateItem, products }: PurchaseItemsTableProps) {
  function handleAdd(event: ChangeEvent<HTMLSelectElement>) {
    const product = products.find((candidate) => candidate.id === event.target.value)
    if (product && !items.some((item) => item.productId === product.id)) onAddItem(buildItem(product))
    event.target.value = ''
  }

  const total = items.reduce((sum, item) => {
    const quantity = item.quantityKg > 0 ? item.quantityKg : item.quantityPieces
    return sum + quantity * item.unitCost
  }, 0)

  return (
    <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_18px_50px_rgba(32,33,31,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Productos</p>
          <h2 className="text-2xl font-black tracking-[-0.05em]">Captura por kilo, pieza o ambas</h2>
          <p className="mt-1 text-sm text-[#68645c]">Selecciona equivalencia oficial cuando captures kilos y piezas; la confirmación final queda en backend.</p>
        </div>
        <label className="grid gap-2 text-sm font-bold text-[#68645c] md:min-w-80">
          Agregar producto
          <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={handleAdd} defaultValue="">
            <option value="">Selecciona producto</option>
            {products.map((product) => <option disabled={items.some((item) => item.productId === product.id)} key={product.id} value={product.id}>{product.name} · {unitLabel(productUnit(product))}</option>)}
          </select>
        </label>
      </div>

      {errors.map((error) => <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]" key={error}>{error}</p>)}

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[#20211f]/20 p-5 text-sm text-[#68645c]">Agrega al menos un producto para registrar la compra.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-[#68645c]">
              <tr className="border-b border-[#20211f]/10"><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Presentación</th><th className="px-3 py-3">Unidad</th><th className="px-3 py-3">Kilos</th><th className="px-3 py-3">Piezas</th><th className="px-3 py-3">Equivalencia</th><th className="px-3 py-3">Costo unitario</th><th className="px-3 py-3">Subtotal</th><th className="px-3 py-3">Acción</th></tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const subtotal = (item.quantityKg > 0 ? item.quantityKg : item.quantityPieces) * item.unitCost
                return (
                  <tr className="border-b border-[#20211f]/8 align-top" key={item.productId}>
                    <td className="px-3 py-4 font-black">{item.productName}</td>
                    <td className="px-3 py-4">{presentationLabel(item.presentationType)}</td>
                    <td className="px-3 py-4">{unitLabel(item.unit)}</td>
                    <td className="px-3 py-4"><input aria-label={`Kilos de ${item.productName}`} className="w-28 rounded-xl border border-[#20211f]/15 px-3 py-2" disabled={item.unit === 'PIECE'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityKg: toNumberInput(event.target.value) })} step="0.001" type="number" value={item.quantityKg} /></td>
                    <td className="px-3 py-4"><input aria-label={`Piezas de ${item.productName}`} className="w-28 rounded-xl border border-[#20211f]/15 px-3 py-2" disabled={item.unit === 'KG'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityPieces: Math.trunc(toNumberInput(event.target.value)) })} step="1" type="number" value={item.quantityPieces} /></td>
                    <td className="px-3 py-4 text-[#68645c]">
                      {item.unit === 'KG_AND_PIECE' && item.availableEquivalences && item.availableEquivalences.length > 0 ? (
                        <select
                          aria-label={`Equivalencia de ${item.productName}`}
                          className="min-w-44 rounded-xl border border-[#20211f]/15 px-3 py-2 text-[#20211f]"
                          onChange={(event) => {
                            const equivalent = item.availableEquivalences?.find((candidate) => candidate.id === event.target.value)
                            onUpdateItem(item.productId, {
                              appliedEquivalentFactor: equivalent?.factor ?? null,
                              unitEquivalentId: equivalent?.id,
                            })
                          }}
                          value={item.unitEquivalentId ?? ''}
                        >
                          <option value="">Selecciona equivalencia</option>
                          {item.availableEquivalences.map((equivalent) => <option key={equivalent.id} value={equivalent.id}>{decimal(equivalent.factor)} kg/pza</option>)}
                        </select>
                      ) : item.appliedEquivalentFactor ? `${decimal(item.appliedEquivalentFactor)} kg/pza` : 'Sin equivalencia aplicada'}
                    </td>
                    <td className="px-3 py-4"><input aria-label={`Costo de ${item.productName}`} className="w-32 rounded-xl border border-[#20211f]/15 px-3 py-2" min="0" onChange={(event) => onUpdateItem(item.productId, { unitCost: toNumberInput(event.target.value) })} step="0.01" type="number" value={item.unitCost} /></td>
                    <td className="px-3 py-4 font-black">{money(subtotal)}</td>
                    <td className="px-3 py-4"><button className="font-black text-[#9d2d24]" onClick={() => onRemoveItem(item.productId)} type="button">Quitar</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 flex justify-end rounded-2xl bg-[#20211f] px-5 py-4 text-white"><span className="text-sm font-bold text-white/65">Total de vista previa&nbsp;</span><strong>{money(total)}</strong></div>
    </section>
  )
}
