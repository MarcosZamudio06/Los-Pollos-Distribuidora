import type { ChangeEvent } from 'react'
import { PackagePlus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Input, Select, Table, Td, Th } from '@/components/ui'
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
    <Card className="overflow-hidden p-0">
      <CardHeader className="flex flex-col gap-4 border-b border-[color:var(--erp-border)] bg-white/70 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">
            <PackagePlus className="h-4 w-4" />
            Productos
          </div>
          <CardTitle className="mt-1">Captura por kilo, pieza o ambas</CardTitle>
          <CardDescription className="mt-2">Selecciona equivalencia oficial cuando captures kilos y piezas; la confirmación final queda en backend.</CardDescription>
        </div>
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)] lg:min-w-80">
          Agregar producto
          <Select onChange={handleAdd} defaultValue="">
            <option value="">Selecciona producto</option>
            {products.map((product) => <option disabled={items.some((item) => item.productId === product.id)} key={product.id} value={product.id}>{product.name} · {unitLabel(productUnit(product))}</option>)}
          </Select>
        </label>
      </CardHeader>

      <div className="p-5">
        {errors.map((error) => <p role="alert" className="mt-3 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)] first:mt-0" key={error}>{error}</p>)}

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-[var(--erp-muted-foreground)]">Agrega al menos un producto para registrar la compra.</p>
        ) : (
          <>
            <div className="grid gap-3 lg:hidden">
              {items.map((item) => {
                const subtotal = (item.quantityKg > 0 ? item.quantityKg : item.quantityPieces) * item.unitCost
                return (
                  <div className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4" key={item.productId}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{item.productName}</p>
                        <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{presentationLabel(item.presentationType)}</p>
                      </div>
                      <Badge tone="slate">{unitLabel(item.unit)}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Kilos<Input aria-label={`Kilos de ${item.productName}`} disabled={item.unit === 'PIECE'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityKg: toNumberInput(event.target.value) })} step="0.001" type="number" value={item.quantityKg} /></label>
                      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Piezas<Input aria-label={`Piezas de ${item.productName}`} disabled={item.unit === 'KG'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityPieces: Math.trunc(toNumberInput(event.target.value)) })} step="1" type="number" value={item.quantityPieces} /></label>
                      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Costo unitario<Input aria-label={`Costo de ${item.productName}`} min="0" onChange={(event) => onUpdateItem(item.productId, { unitCost: toNumberInput(event.target.value) })} step="0.01" type="number" value={item.unitCost} /></label>
                      <div className="rounded-xl bg-[var(--erp-surface)] p-3"><span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Subtotal</span><strong className="mt-1 block text-lg tabular-nums">{money(subtotal)}</strong></div>
                    </div>
                    {item.unit === 'KG_AND_PIECE' && item.availableEquivalences && item.availableEquivalences.length > 0 ? (
                      <label className="mt-3 grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Equivalencia<Select aria-label={`Equivalencia de ${item.productName}`} onChange={(event) => { const equivalent = item.availableEquivalences?.find((candidate) => candidate.id === event.target.value); onUpdateItem(item.productId, { appliedEquivalentFactor: equivalent?.factor ?? null, unitEquivalentId: equivalent?.id }) }} value={item.unitEquivalentId ?? ''}><option value="">Selecciona equivalencia</option>{item.availableEquivalences.map((equivalent) => <option key={equivalent.id} value={equivalent.id}>{decimal(equivalent.factor)} kg/pza</option>)}</Select></label>
                    ) : <p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">{item.appliedEquivalentFactor ? `${decimal(item.appliedEquivalentFactor)} kg/pza` : 'Sin equivalencia aplicada'}</p>}
                    <Button className="mt-4 w-full" onClick={() => onRemoveItem(item.productId)} variant="outline"><Trash2 className="h-4 w-4" />Quitar</Button>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)] lg:block">
              <Table className="min-w-[1120px]">
                <thead>
                  <tr><Th>Producto</Th><Th>Presentación</Th><Th>Unidad</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th>Equivalencia</Th><Th className="text-right">Costo unitario</Th><Th className="text-right">Subtotal</Th><Th className="text-right">Acción</Th></tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const subtotal = (item.quantityKg > 0 ? item.quantityKg : item.quantityPieces) * item.unitCost
                    return (
                      <tr className="transition hover:bg-[var(--erp-surface)]" key={item.productId}>
                        <Td className="font-black">{item.productName}</Td>
                        <Td>{presentationLabel(item.presentationType)}</Td>
                        <Td><Badge tone="slate">{unitLabel(item.unit)}</Badge></Td>
                        <Td><Input aria-label={`Kilos de ${item.productName}`} className="ml-auto w-28 text-right" disabled={item.unit === 'PIECE'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityKg: toNumberInput(event.target.value) })} step="0.001" type="number" value={item.quantityKg} /></Td>
                        <Td><Input aria-label={`Piezas de ${item.productName}`} className="ml-auto w-28 text-right" disabled={item.unit === 'KG'} min="0" onChange={(event) => onUpdateItem(item.productId, { quantityPieces: Math.trunc(toNumberInput(event.target.value)) })} step="1" type="number" value={item.quantityPieces} /></Td>
                        <Td className="text-[var(--erp-muted-foreground)]">
                          {item.unit === 'KG_AND_PIECE' && item.availableEquivalences && item.availableEquivalences.length > 0 ? (
                            <Select aria-label={`Equivalencia de ${item.productName}`} className="min-w-44" onChange={(event) => { const equivalent = item.availableEquivalences?.find((candidate) => candidate.id === event.target.value); onUpdateItem(item.productId, { appliedEquivalentFactor: equivalent?.factor ?? null, unitEquivalentId: equivalent?.id }) }} value={item.unitEquivalentId ?? ''}>
                              <option value="">Selecciona equivalencia</option>
                              {item.availableEquivalences.map((equivalent) => <option key={equivalent.id} value={equivalent.id}>{decimal(equivalent.factor)} kg/pza</option>)}
                            </Select>
                          ) : item.appliedEquivalentFactor ? `${decimal(item.appliedEquivalentFactor)} kg/pza` : 'Sin equivalencia aplicada'}
                        </Td>
                        <Td><Input aria-label={`Costo de ${item.productName}`} className="ml-auto w-32 text-right" min="0" onChange={(event) => onUpdateItem(item.productId, { unitCost: toNumberInput(event.target.value) })} step="0.01" type="number" value={item.unitCost} /></Td>
                        <Td className="text-right font-black tabular-nums">{money(subtotal)}</Td>
                        <Td className="text-right"><Button onClick={() => onRemoveItem(item.productId)} size="sm" variant="ghost"><Trash2 className="h-4 w-4" />Quitar</Button></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
        <div className="mt-5 flex flex-col gap-1 rounded-2xl bg-[var(--erp-charcoal)] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-end"><span className="text-sm font-bold text-white/65">Total de vista previa</span><strong className="text-xl tabular-nums">{money(total)}</strong></div>
      </div>
    </Card>
  )
}
