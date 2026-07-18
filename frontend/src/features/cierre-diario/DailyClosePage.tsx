import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Plus, RefreshCw, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer } from '../../components/layout/PageContainer'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { useAuth } from '../auth'
import { usePurchaseLocations } from '../compras/hooks'
import { locationTypeLabel } from '../compras/purchaseLabels'
import { dailyCloseService } from './dailyCloseService'
import { DailyCloseTransitionDialog } from './DailyCloseTransitionDialog'
import type { DailyCloseReportAction } from './dailyCloseTransition'
import { canAutoRefreshDailyClose, canUseLocationForDailyClose, canValidateDailyClose, costQualityLabel, type DailyClose } from './types'

const money = (value: string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value))
const statusLabel = { DRAFT: 'Borrador', REVIEWED: 'Revisado', CLOSED: 'Cerrado', CANCELLED: 'Cancelado' }
const today = new Date().toISOString().slice(0, 10)

export function DailyClosePage() {
  const { accessToken, user } = useAuth()
  const [items, setItems] = useState<DailyClose[]>([])
  const [selected, setSelected] = useState<DailyClose | null>(null)
  const [loading, setLoading] = useState(true)
  const [locationId, setLocationId] = useState('')
  const [businessDate, setBusinessDate] = useState(today)
  const [expense, setExpense] = useState({ amount: '', reason: '', reference: '' })
  const [ticket, setTicket] = useState({ physicalFolio: '', weightKg: '', pieceCount: '', amount: '' })
  const [reportAction, setReportAction] = useState<DailyCloseReportAction | null>(null)
  const locations = usePurchaseLocations()
  const closeLocations = useMemo(
    () => (locations.data ?? []).filter((location) => canUseLocationForDailyClose(location.type)),
    [locations.data],
  )

  const selectClose = useCallback(async (close: Pick<DailyClose, 'id' | 'status'>) => {
    const detail = canAutoRefreshDailyClose(close.status)
      ? await dailyCloseService.refresh(close.id, accessToken)
      : await dailyCloseService.get(close.id, accessToken)
    setSelected(detail)
    return detail
  }, [accessToken])
  const load = async () => { try { setLoading(true); const data = await dailyCloseService.list(accessToken); setItems(data); const current = selected ? data.find((item) => item.id === selected.id) : data[0]; if (current) await selectClose(current); else setSelected(null) } catch (error) { toast.error(error instanceof Error ? error.message : 'No fue posible cargar los cierres.') } finally { setLoading(false) } }
  useEffect(() => {
    let active = true
    dailyCloseService.list(accessToken)
      .then(async (data) => {
        if (!active) return
        setItems(data)
        if (data[0]) await selectClose(data[0])
        else setSelected(null)
      })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'No fue posible cargar los cierres.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, selectClose])
  useEffect(() => {
    if (!selected || !canAutoRefreshDailyClose(selected.status)) return
    const interval = window.setInterval(() => { void selectClose(selected) }, 30_000)
    return () => window.clearInterval(interval)
  }, [selectClose, selected])
  const run = async (operation: () => Promise<DailyClose>, message: string) => { try { const close = await operation(); setSelected(close); await load(); toast.success(message); return true } catch (error) { toast.error(error instanceof Error ? error.message : 'No fue posible completar la operación.'); return false } }

  const open = (event: FormEvent) => { event.preventDefault(); if (!locationId.trim()) return toast.error('Selecciona una ubicación operativa.'); void run(() => dailyCloseService.open({ operationalLocationId: locationId.trim(), businessDate }, accessToken), 'Cierre diario abierto.') }
  const addExpense = (event: FormEvent) => { event.preventDefault(); if (!selected || !expense.reason.trim()) return; void run(() => dailyCloseService.expense(selected.id, { amount: Number(expense.amount), reason: expense.reason, reference: expense.reference || undefined }, accessToken), 'Gasto registrado.'); setExpense({ amount: '', reason: '', reference: '' }) }
  const addTicket = (event: FormEvent) => { event.preventDefault(); if (!selected) return; void run(() => dailyCloseService.ticket(selected.id, { physicalFolio: ticket.physicalFolio, capturedDate: businessDate, weightKg: ticket.weightKg ? Number(ticket.weightKg) : undefined, pieceCount: ticket.pieceCount ? Number(ticket.pieceCount) : undefined, amount: ticket.amount ? Number(ticket.amount) : undefined }, accessToken), 'Referencia de báscula registrada.'); setTicket({ physicalFolio: '', weightKg: '', pieceCount: '', amount: '' }) }
  const transition = (action: 'validate' | 'review' | 'close' | 'cancel' | 'reopen') => { if (!selected || (action === 'validate' && !canValidateDailyClose(selected.status))) return; if (action === 'close' || action === 'reopen') { setReportAction(action); return } const reason = action === 'cancel' ? window.prompt('Motivo para cancelar el cierre:') : undefined; if (action === 'cancel' && !reason?.trim()) return; void run(() => dailyCloseService.action(selected.id, action, { version: selected.version, ...(reason ? { reason } : {}) }, accessToken), 'Estado del cierre actualizado.') }
  const confirmReportTransition = async (reason?: string) => { if (!selected || !reportAction) return; const success = await run(() => dailyCloseService.action(selected.id, reportAction, { version: selected.version, ...(reason ? { reason } : {}) }, accessToken), reportAction === 'close' ? 'Jornada cerrada.' : 'Cierre reabierto.'); if (success) setReportAction(null) }

  return <PageContainer className="space-y-6">
    <header className="relative overflow-hidden rounded-[1.75rem] border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 shadow-sm">
      <div className="absolute inset-y-0 left-0 w-2 bg-[var(--erp-brand-red)]" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-brand-red)]">Mesa de conciliación</p><h1 className="mt-2 text-3xl font-black tracking-tight">Cierre diario de punto de venta</h1><p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted-foreground)]">Concilia kilos, báscula, ingresos y gastos sin ocultar diferencias operativas.</p></div>
        <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_auto]" onSubmit={open}>
          <Select aria-label="Ubicación operativa" disabled={locations.isLoading} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">{locations.isLoading ? 'Cargando ubicaciones…' : 'Selecciona punto de venta'}</option>
            {closeLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {locationTypeLabel(location.type)}</option>)}
          </Select>
          <Input aria-label="Fecha operativa" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          <Button disabled={locations.isLoading || closeLocations.length === 0} type="submit"><Plus size={16}/> Abrir cierre</Button>
        </form>
      </div>
    </header>
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3"><div className="mb-3 flex items-center justify-between px-2"><h2 className="font-bold">Jornadas</h2><Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw size={15}/></Button></div>{loading ? <p className="p-3 text-sm">Cargando…</p> : items.length === 0 ? <p className="p-3 text-sm text-[var(--erp-muted-foreground)]">Aún no hay cierres.</p> : items.map((item) => <button key={item.id} onClick={() => void selectClose(item)} className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selected?.id === item.id ? 'border-[var(--erp-brand-red)] bg-[var(--erp-surface-muted)]' : 'border-transparent hover:bg-[var(--erp-surface-muted)]'}`}><span className="block font-semibold">{item.operationalLocation.name}</span><span className="mt-1 flex justify-between text-xs text-[var(--erp-muted-foreground)]"><span>{item.businessDate.slice(0,10)}</span><span>{statusLabel[item.status]}</span></span></button>)}</aside>
      {!selected ? <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-[var(--erp-border)]"><p className="text-[var(--erp-muted-foreground)]">Abre o selecciona un cierre para comenzar.</p></section> : <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{selected.operationalLocation.name}</h2><p className="text-sm text-[var(--erp-muted-foreground)]">Versión {selected.version} · {statusLabel[selected.status]} · Actualizado {new Date(selected.dataAsOf).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div><div className="flex flex-wrap gap-2">{canAutoRefreshDailyClose(selected.status) && <Button variant="ghost" onClick={() => void selectClose(selected)}><RefreshCw size={16}/> Actualizar</Button>}{canValidateDailyClose(selected.status) && <Button variant="secondary" onClick={() => transition('validate')}><ClipboardCheck size={16}/> Validar</Button>}{user?.role === 'ADMIN' && selected.status === 'DRAFT' && <Button onClick={() => transition('review')}>Marcar revisado</Button>}{user?.role === 'ADMIN' && selected.status === 'REVIEWED' && <Button onClick={() => transition('close')}><CheckCircle2 size={16}/> Cerrar jornada</Button>}{user?.role === 'ADMIN' && selected.status === 'CLOSED' && <Button variant="secondary" onClick={() => transition('reopen')}>Reabrir</Button>}{user?.role === 'ADMIN' && selected.status !== 'CANCELLED' && <Button variant="destructive" onClick={() => transition('cancel')}>Cancelar</Button>}</div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Kilos recibidos',selected.totalInputKg],['Kilos vendidos',selected.totalSoldKg],['Reportados en báscula',selected.scaleReportedKg],['Diferencia de báscula',selected.scaleDifferenceKg]].map(([label,value], index) => <article key={label} className={`rounded-2xl border p-4 ${index === 3 && Number(value) !== 0 ? 'border-amber-400 bg-amber-50/70' : 'border-[var(--erp-border)] bg-[var(--erp-surface-elevated)]'}`}><p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted-foreground)]">{label}</p><p className="mt-3 text-2xl font-black tabular-nums">{Number(value).toFixed(3)} kg</p></article>)}</div>
        {(Number(selected.scaleDifferenceKg) !== 0 || Number(selected.cashDifferenceTotal) !== 0) && <div className="flex gap-3 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-amber-950"><AlertTriangle className="shrink-0"/><div><p className="font-bold">Diferencias pendientes de conciliación</p><p className="text-sm">El sistema las expone y no las compensa automáticamente.</p></div></div>}
        <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold"><Banknote size={18}/> Ventas, ingresos y utilidad</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.costQuality === 'EXACT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{costQualityLabel(selected.costQuality)}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm">{[['Ventas del día',money(selected.grossSalesTotal)],['Efectivo',money(selected.cashTotal)],['Vouchers y tarjetas',money(selected.cardVoucherTotal)],['Transferencias y depósitos',money(selected.transferTotal)],['Gastos',money(selected.expenseTotal)],['Costo del producto',money(selected.purchaseCostTotal)],['Utilidad bruta',money(selected.grossProfitTotal)],['Utilidad neta',money(selected.netProfitTotal)]].map(([k,v])=><div key={k} className="rounded-xl bg-[var(--erp-surface-muted)] p-3"><dt className="text-[var(--erp-muted-foreground)]">{k}</dt><dd className="mt-1 font-bold tabular-nums">{v}</dd></div>)}</dl></article><article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="flex items-center gap-2 font-bold"><Scale size={18}/> Existencia conciliada</h3><dl className="mt-4 space-y-3">{[['Existencia restante',selected.totalRemainingKg],['Faltante',selected.totalShortageKg],['Sobrante',selected.totalSurplusKg]].map(([k,v])=><div key={k} className="flex justify-between border-b border-[var(--erp-border)] pb-2 text-sm"><dt>{k}</dt><dd className="font-bold tabular-nums">{Number(v).toFixed(3)} kg</dd></div>)}</dl></article></div>
        {selected.status === 'DRAFT' && <div className="grid gap-4 lg:grid-cols-2"><form onSubmit={addExpense} className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="font-bold">Registrar gasto</h3><div className="grid grid-cols-2 gap-2"><Input required min="0.01" step="0.01" type="number" placeholder="Importe" value={expense.amount} onChange={(e)=>setExpense({...expense,amount:e.target.value})}/><Input placeholder="Referencia" value={expense.reference} onChange={(e)=>setExpense({...expense,reference:e.target.value})}/></div><Input required placeholder="Motivo del gasto" value={expense.reason} onChange={(e)=>setExpense({...expense,reason:e.target.value})}/><Button type="submit">Guardar gasto</Button></form><form onSubmit={addTicket} className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="font-bold">Capturar referencia de báscula</h3><Input required placeholder="Folio físico" value={ticket.physicalFolio} onChange={(e)=>setTicket({...ticket,physicalFolio:e.target.value})}/><div className="grid grid-cols-3 gap-2"><Input min="0" step="0.001" type="number" placeholder="Kilos" value={ticket.weightKg} onChange={(e)=>setTicket({...ticket,weightKg:e.target.value})}/><Input min="0" type="number" placeholder="Piezas" value={ticket.pieceCount} onChange={(e)=>setTicket({...ticket,pieceCount:e.target.value})}/><Input min="0" step="0.01" type="number" placeholder="Importe" value={ticket.amount} onChange={(e)=>setTicket({...ticket,amount:e.target.value})}/></div><Button type="submit">Guardar referencia</Button></form></div>}
      </section>}
    </div>
    {selected && reportAction && <DailyCloseTransitionDialog action={reportAction} close={selected} onCancel={() => setReportAction(null)} onConfirm={confirmReportTransition} />}
  </PageContainer>
}
