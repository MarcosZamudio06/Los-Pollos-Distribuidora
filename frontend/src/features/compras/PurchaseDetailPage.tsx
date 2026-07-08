import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ClipboardList, MapPin, PackageCheck, ReceiptText, UserRound, XCircle } from 'lucide-react'
import { Badge, Button, Card, CardTitle, Table, Td, Th } from '@/components/ui'
import type { BadgeTone } from '@/components/ui'
import { useAuth } from '../auth'
import { CancelPurchaseDialog } from './CancelPurchaseDialog'
import { usePurchase } from './hooks'
import { dateTime, decimal, money, purchaseStatusLabel, unitLabel } from './purchaseLabels'

function purchaseStatusTone(status?: string | null): BadgeTone {
  if (status === 'CONFIRMED') return 'green'
  if (status === 'CANCELLED') return 'red'
  return 'slate'
}

function InfoCard({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">{icon}{label}</p>
      <div className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--erp-foreground)]">{value}</div>
    </Card>
  )
}

export function PurchaseDetailPage() {
  const { purchaseId } = useParams()
  const { user } = useAuth()
  const purchase = usePurchase(purchaseId)
  const [showCancel, setShowCancel] = useState(false)
  const detail = purchase.data
  const canCancel = user?.role === 'ADMIN' && detail?.status !== 'CANCELLED'

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[var(--erp-charcoal)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)] sm:p-7">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                <ReceiptText className="h-4 w-4" />
                Detalle de compra
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Trazabilidad de entrada y movimientos</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Revisa proveedor, ubicación receptora, partidas, totales y movimientos generados por la compra.</p>
            </div>
            <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-black text-[var(--erp-brand-gold-soft)] transition hover:bg-white/12 focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" to="/purchases">
              <ArrowLeft className="h-4 w-4" />
              Volver a compras
            </Link>
          </div>
        </header>

        {purchase.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm font-bold text-[var(--erp-info)]">Cargando detalle de compra...</p>}
        {purchase.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudo cargar la compra.</p>}
        {!purchase.isLoading && !purchase.error && !detail && <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-white p-6 text-sm text-[var(--erp-muted-foreground)]">Compra no encontrada.</p>}

        {detail && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard icon={<ClipboardList className="h-4 w-4 text-[var(--erp-info)]" />} label="Número" value={detail.purchaseNumber ?? detail.id} />
              <InfoCard icon={<PackageCheck className="h-4 w-4 text-[var(--erp-success)]" />} label="Total" value={<span className="text-2xl tabular-nums">{money(detail.total)}</span>} />
              <InfoCard icon={<MapPin className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />} label="Ubicación receptora" value={detail.locationName ?? detail.locationId} />
              <InfoCard label="Estado" value={<Badge tone={purchaseStatusTone(detail.status)}>{purchaseStatusLabel(detail.status)}</Badge>} />
            </section>

            <Card className="p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Proveedor</p>
                  <p className="mt-2 text-xl font-black">{detail.supplierName ?? detail.supplierId}</p>
                </div>
                <div className="grid gap-2 text-sm text-[var(--erp-muted-foreground)]">
                  <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{dateTime(detail.createdAt)}</span>
                  <span className="flex items-center gap-2"><UserRound className="h-4 w-4" />{detail.userName ?? detail.userId ?? 'Sin usuario'}</span>
                </div>
                <Button disabled={!canCancel} onClick={() => setShowCancel(true)} variant="destructive">
                  <XCircle className="h-4 w-4" />
                  Cancelar compra
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Productos</p>
                <CardTitle className="mt-1">Items comprados</CardTitle>
              </div>
              <div className="grid gap-3 p-5 md:hidden">
                {(detail.items ?? []).map((item) => <div className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4" key={item.id ?? item.productId}><div className="flex items-start justify-between gap-3"><p className="font-black">{item.productName ?? item.productId}</p><Badge tone="slate">{unitLabel(item.unit)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span className="text-[var(--erp-muted-foreground)]">Kilos <strong className="block text-[var(--erp-foreground)]">{decimal(item.quantityKg)}</strong></span><span className="text-[var(--erp-muted-foreground)]">Piezas <strong className="block text-[var(--erp-foreground)]">{decimal(item.quantityPieces, 0)}</strong></span><span className="text-[var(--erp-muted-foreground)]">Costo <strong className="block text-[var(--erp-foreground)]">{money(item.unitCost)}</strong></span><span className="text-[var(--erp-muted-foreground)]">Subtotal <strong className="block text-[var(--erp-foreground)]">{money(item.subtotal)}</strong></span></div></div>)}
              </div>
              <div className="hidden overflow-x-auto p-5 md:block">
                <div className="rounded-[1.2rem] border border-[color:var(--erp-border)]">
                  <Table className="min-w-[920px]"><thead><tr><Th>Producto</Th><Th>Unidad</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th className="text-right">Costo</Th><Th>Equivalencia</Th><Th className="text-right">Subtotal</Th></tr></thead><tbody>{(detail.items ?? []).map((item) => <tr className="transition hover:bg-[var(--erp-surface)]" key={item.id ?? item.productId}><Td className="font-black">{item.productName ?? item.productId}</Td><Td>{unitLabel(item.unit)}</Td><Td className="text-right tabular-nums">{decimal(item.quantityKg)}</Td><Td className="text-right tabular-nums">{decimal(item.quantityPieces, 0)}</Td><Td className="text-right tabular-nums">{money(item.unitCost)}</Td><Td className="text-[var(--erp-muted-foreground)]">{item.appliedEquivalentFactor ? `${decimal(item.appliedEquivalentFactor)} kg/pza` : 'Sin equivalencia aplicada'}</Td><Td className="text-right font-black tabular-nums">{money(item.subtotal)}</Td></tr>)}</tbody></Table>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">Inventario</p>
                <CardTitle className="mt-1">Movimientos relacionados</CardTitle>
              </div>
              {(detail.inventoryMovements ?? []).length === 0 ? <p className="m-5 rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-[var(--erp-muted-foreground)]">Sin movimientos asociados en la respuesta.</p> : <div className="overflow-x-auto p-5"><div className="rounded-[1.2rem] border border-[color:var(--erp-border)]"><Table className="min-w-[920px]"><thead><tr><Th>Producto</Th><Th>Tipo</Th><Th>Ubicación</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th>Saldo nuevo</Th><Th>Fecha</Th></tr></thead><tbody>{(detail.inventoryMovements ?? []).map((movement) => <tr className="transition hover:bg-[var(--erp-surface)]" key={movement.id}><Td className="font-black">{movement.productName ?? movement.productId}</Td><Td>{movement.type}</Td><Td>{movement.locationName ?? movement.locationId}</Td><Td className="text-right tabular-nums">{decimal(movement.quantityKg)}</Td><Td className="text-right tabular-nums">{decimal(movement.quantityPieces, 0)}</Td><Td>{decimal(movement.newQuantityKg)} kg · {decimal(movement.newQuantityPieces, 0)} pzas</Td><Td className="text-[var(--erp-muted-foreground)]">{dateTime(movement.createdAt)}</Td></tr>)}</tbody></Table></div></div>}
            </Card>
          </>
        )}
      </section>
      {showCancel && detail && <CancelPurchaseDialog onClose={() => setShowCancel(false)} purchase={detail} />}
    </main>
  )
}
