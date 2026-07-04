import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { CancelPurchaseDialog } from './CancelPurchaseDialog'
import { usePurchase } from './hooks'
import { dateTime, decimal, money, purchaseStatusLabel, unitLabel } from './purchaseLabels'

export function PurchaseDetailPage() {
  const { purchaseId } = useParams()
  const { user } = useAuth()
  const purchase = usePurchase(purchaseId)
  const [showCancel, setShowCancel] = useState(false)
  const detail = purchase.data
  const canCancel = user?.role === 'ADMIN' && detail?.status !== 'CANCELLED'

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] p-6 text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Detalle de compra</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Trazabilidad de entrada y movimientos</h1>
          <Link className="mt-5 inline-flex font-black text-[#f0b44c]" to="/purchases">Volver a compras</Link>
        </header>

        {purchase.isLoading && <p className="rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Cargando detalle de compra...</p>}
        {purchase.error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudo cargar la compra.</p>}
        {!purchase.isLoading && !purchase.error && !detail && <p className="rounded-2xl border border-dashed border-[#20211f]/20 bg-white p-5 text-sm text-[#68645c]">Compra no encontrada.</p>}

        {detail && (
          <>
            <section className="grid gap-4 rounded-[2rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_20px_60px_rgba(32,33,31,0.07)] md:grid-cols-4">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Número</p><p className="mt-1 text-xl font-black">{detail.purchaseNumber ?? detail.id}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Proveedor</p><p className="mt-1 text-xl font-black">{detail.supplierName ?? detail.supplierId}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Ubicación receptora</p><p className="mt-1 text-xl font-black">{detail.locationName ?? detail.locationId}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Estado</p><p className="mt-1 text-xl font-black">{purchaseStatusLabel(detail.status)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Fecha</p><p className="mt-1 font-bold">{dateTime(detail.createdAt)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Usuario</p><p className="mt-1 font-bold">{detail.userName ?? detail.userId ?? 'Sin usuario'}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">Total</p><p className="mt-1 text-xl font-black">{money(detail.total)}</p></div>
              <div className="flex items-end"><button className="w-full rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={!canCancel} onClick={() => setShowCancel(true)} type="button">Cancelar compra</button></div>
            </section>

            <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Items comprados</h2>
              <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.16em] text-[#68645c]"><tr className="border-b border-[#20211f]/10"><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Unidad</th><th className="px-3 py-3">Kilos</th><th className="px-3 py-3">Piezas</th><th className="px-3 py-3">Costo</th><th className="px-3 py-3">Equivalencia</th><th className="px-3 py-3">Subtotal</th></tr></thead><tbody>{(detail.items ?? []).map((item) => <tr className="border-b border-[#20211f]/8" key={item.id ?? item.productId}><td className="px-3 py-4 font-black">{item.productName ?? item.productId}</td><td className="px-3 py-4">{unitLabel(item.unit)}</td><td className="px-3 py-4">{decimal(item.quantityKg)}</td><td className="px-3 py-4">{decimal(item.quantityPieces, 0)}</td><td className="px-3 py-4">{money(item.unitCost)}</td><td className="px-3 py-4 text-[#68645c]">{item.appliedEquivalentFactor ? `${decimal(item.appliedEquivalentFactor)} kg/pza` : 'Sin equivalencia aplicada'}</td><td className="px-3 py-4 font-black">{money(item.subtotal)}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Movimientos de inventario relacionados</h2>
              {(detail.inventoryMovements ?? []).length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-[#20211f]/20 p-5 text-sm text-[#68645c]">Sin movimientos asociados en la respuesta.</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.16em] text-[#68645c]"><tr className="border-b border-[#20211f]/10"><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Ubicación</th><th className="px-3 py-3">Kilos</th><th className="px-3 py-3">Piezas</th><th className="px-3 py-3">Saldo nuevo</th><th className="px-3 py-3">Fecha</th></tr></thead><tbody>{(detail.inventoryMovements ?? []).map((movement) => <tr className="border-b border-[#20211f]/8" key={movement.id}><td className="px-3 py-4 font-black">{movement.productName ?? movement.productId}</td><td className="px-3 py-4">{movement.type}</td><td className="px-3 py-4">{movement.locationName ?? movement.locationId}</td><td className="px-3 py-4">{decimal(movement.quantityKg)}</td><td className="px-3 py-4">{decimal(movement.quantityPieces, 0)}</td><td className="px-3 py-4">{decimal(movement.newQuantityKg)} kg · {decimal(movement.newQuantityPieces, 0)} pzas</td><td className="px-3 py-4 text-[#68645c]">{dateTime(movement.createdAt)}</td></tr>)}</tbody></table></div>}
            </section>
          </>
        )}
      </section>
      {showCancel && detail && <CancelPurchaseDialog onClose={() => setShowCancel(false)} purchase={detail} />}
    </main>
  )
}
