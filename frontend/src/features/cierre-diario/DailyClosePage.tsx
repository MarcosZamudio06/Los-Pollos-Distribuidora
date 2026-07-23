import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ClipboardCheck, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer } from '../../components/layout/PageContainer'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { formatMoney as money } from '../../lib/money'
import { getOperationalDate } from '../../lib/operationalDate'
import { useAuth } from '../auth'
import { usePurchaseLocations } from '../compras/hooks'
import { locationTypeLabel } from '../compras/purchaseLabels'
import { useProducts } from '../inventario/hooks/useProducts'
import { DailyCloseDetailTabs, type DailyCloseTab } from './DailyCloseDetailTabs'
import { DailyCloseTransitionDialog } from './DailyCloseTransitionDialog'
import { dailyCloseService } from './dailyCloseService'
import type { DailyCloseReportAction } from './dailyCloseTransition'
import { canAutoRefreshDailyClose, canUseLocationForDailyClose, canValidateDailyClose, type DailyClose, type DailyCloseInventoryReconciliation as InventoryReconciliation, type DailyCloseValidationResult } from './types'

const statusLabel = { DRAFT: 'Borrador', REVIEWED: 'Revisado', CLOSED: 'Cerrado', CANCELLED: 'Cancelado' }
const today = getOperationalDate()

export function DailyClosePage() {
  const { accessToken, user } = useAuth()
  const [items, setItems] = useState<DailyClose[]>([])
  const [selected, setSelected] = useState<DailyClose | null>(null)
  const [loading, setLoading] = useState(true)
  const [locationId, setLocationId] = useState('')
  const [businessDate, setBusinessDate] = useState(today)
  const [expense, setExpense] = useState({ amount: '', reason: '', reference: '' })
  const [ticket, setTicket] = useState({ physicalFolio: '', weightKg: '', pieceCount: '', amount: '' })
  const [cashCountedTotal, setCashCountedTotal] = useState('')
  const [inventoryReconciliation, setInventoryReconciliation] = useState<InventoryReconciliation | null>(null)
  const [validationResult, setValidationResult] = useState<DailyCloseValidationResult | null>(null)
  const [reportAction, setReportAction] = useState<DailyCloseReportAction | null>(null)
  const [activeTab, setActiveTab] = useState<DailyCloseTab>('summary')
  const locations = usePurchaseLocations()
  const closeLocations = useMemo(() => (locations.data ?? []).filter((location) => canUseLocationForDailyClose(location.type)), [locations.data])
  const canViewInventory = user?.role !== 'COLLECTIONS'
  const canViewFinancials = user?.role !== 'WAREHOUSE'
  const canEditDraft = user?.role === 'ADMIN' || user?.role === 'SELLER'
  const products = useProducts({ isActive: 'true', locationId: selected?.operationalLocationId ?? '' })

  const selectClose = useCallback(async (close: Pick<DailyClose, 'id' | 'status'>) => {
    setValidationResult(null)
    setActiveTab('summary')
    const detail = canAutoRefreshDailyClose(close.status)
      ? await dailyCloseService.refresh(close.id, accessToken)
      : await dailyCloseService.get(close.id, accessToken)
    setSelected(detail)
    setInventoryReconciliation(canViewInventory ? await dailyCloseService.reconciliation(close.id, accessToken) : null)
    return detail
  }, [accessToken, canViewInventory])

  const load = async () => {
    try {
      setLoading(true)
      const data = await dailyCloseService.list(accessToken)
      setItems(data)
      const current = selected ? data.find((item) => item.id === selected.id) : data[0]
      if (current) await selectClose(current)
      else { setSelected(null); setInventoryReconciliation(null) }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible cargar los cierres.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    dailyCloseService.list(accessToken)
      .then(async (data) => {
        if (!active) return
        setItems(data)
        if (data[0]) await selectClose(data[0])
        else { setSelected(null); setInventoryReconciliation(null) }
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

  const run = async (operation: () => Promise<DailyClose>, message: string) => {
    try {
      const close = await operation()
      setSelected(close)
      await load()
      toast.success(message)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible completar la operación.')
      return false
    }
  }

  const open = (event: FormEvent) => {
    event.preventDefault()
    if (!locationId.trim()) return toast.error('Selecciona una ubicación operativa.')
    void run(() => dailyCloseService.open({ operationalLocationId: locationId.trim(), businessDate }, accessToken), 'Cierre diario abierto.')
  }
  const addExpense = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !expense.reason.trim()) return
    const idempotencyKey = crypto.randomUUID()
    void run(() => dailyCloseService.expense(selected.id, { amount: Number(expense.amount), reason: expense.reason, reference: expense.reference || undefined }, accessToken, idempotencyKey), 'Gasto registrado.')
    setExpense({ amount: '', reason: '', reference: '' })
  }
  const addTicket = (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    const idempotencyKey = crypto.randomUUID()
    void run(() => dailyCloseService.ticket(selected.id, { physicalFolio: ticket.physicalFolio, capturedDate: businessDate, weightKg: ticket.weightKg ? Number(ticket.weightKg) : undefined, pieceCount: ticket.pieceCount ? Number(ticket.pieceCount) : undefined, amount: ticket.amount ? Number(ticket.amount) : undefined }, accessToken, idempotencyKey), 'Referencia de báscula registrada.')
    setTicket({ physicalFolio: '', weightKg: '', pieceCount: '', amount: '' })
  }
  const recordCashCount = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !cashCountedTotal.trim()) return
    void run(() => dailyCloseService.recordCashCount(selected.id, { cashCountedTotal: Number(cashCountedTotal) }, accessToken), 'Efectivo contado registrado.')
    setCashCountedTotal('')
  }
  const saveInventoryCount = (countId: string | undefined, productId: string, values: { physicalQuantityKg?: number; physicalQuantityPieces?: number; reason: string }) => {
    if (!selected) return
    const idempotencyKey = crypto.randomUUID()
    void run(() => countId ? dailyCloseService.updateInventoryCount(selected.id, countId, values, accessToken) : dailyCloseService.createInventoryCount(selected.id, { productId, ...values }, accessToken, idempotencyKey), 'Conteo físico guardado.')
  }
  const deleteInventoryCount = (countId: string) => {
    if (!selected || !window.confirm('¿Eliminar este conteo físico?')) return
    void run(() => dailyCloseService.deleteInventoryCount(selected.id, countId, accessToken), 'Conteo físico eliminado.')
  }
  const validate = async () => {
    if (!selected || !canValidateDailyClose(selected.status)) return
    try {
      const result = await dailyCloseService.validate(selected.id, accessToken)
      setValidationResult(result)
      setSelected(result.close)
      setActiveTab('differences')
      if (result.valid) toast.success('Cierre validado.')
      else toast.error('La validación detectó bloqueantes.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible validar el cierre.')
    }
  }
  const transition = (action: 'validate' | 'review' | 'close' | 'cancel' | 'reopen') => {
    if (action === 'validate') { void validate(); return }
    if (!selected) return
    if (action === 'close' || action === 'reopen') { setReportAction(action); return }
    const reason = action === 'cancel' ? window.prompt('Motivo para cancelar el cierre:') : undefined
    if (action === 'cancel' && !reason?.trim()) return
    void run(() => dailyCloseService.action(selected.id, action, { version: selected.version, ...(reason ? { reason } : {}) }, accessToken), 'Estado del cierre actualizado.')
  }
  const confirmReportTransition = async (reason?: string) => {
    if (!selected || !reportAction) return
    const success = await run(() => dailyCloseService.action(selected.id, reportAction, { version: selected.version, ...(reason ? { reason } : {}) }, accessToken), reportAction === 'close' ? 'Jornada cerrada.' : 'Cierre reabierto.')
    if (success) setReportAction(null)
  }

  const editable = canEditDraft && selected?.status === 'DRAFT'
  const cashCountForm = editable && selected ? <form className="space-y-3 rounded-2xl border border-[var(--erp-brand-red)] bg-[var(--erp-surface-elevated)] p-5" onSubmit={recordCashCount}><h3 className="font-bold">Registrar efectivo contado</h3><p className="text-sm text-[var(--erp-muted-foreground)]">Esperado: <strong className="tabular-nums text-[var(--erp-foreground)]">{money(selected.netCashExpected)}</strong></p><Input required min="0" onChange={(event) => setCashCountedTotal(event.target.value)} placeholder="Efectivo contado" step="0.01" type="number" value={cashCountedTotal} /><Button type="submit">Guardar conteo</Button></form> : undefined
  const expenseForm = editable ? <form className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5" onSubmit={addExpense}><h3 className="font-bold">Registrar gasto</h3><div className="grid grid-cols-2 gap-2"><Input required min="0.01" onChange={(event) => setExpense({ ...expense, amount: event.target.value })} placeholder="Importe" step="0.01" type="number" value={expense.amount} /><Input onChange={(event) => setExpense({ ...expense, reference: event.target.value })} placeholder="Referencia" value={expense.reference} /></div><Input required onChange={(event) => setExpense({ ...expense, reason: event.target.value })} placeholder="Motivo del gasto" value={expense.reason} /><Button type="submit">Guardar gasto</Button></form> : undefined
  const scaleTicketForm = editable ? <form className="space-y-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5" onSubmit={addTicket}><h3 className="font-bold">Capturar referencia de báscula</h3><Input required onChange={(event) => setTicket({ ...ticket, physicalFolio: event.target.value })} placeholder="Folio físico" value={ticket.physicalFolio} /><div className="grid grid-cols-3 gap-2"><Input min="0" onChange={(event) => setTicket({ ...ticket, weightKg: event.target.value })} placeholder="Kilos" step="0.001" type="number" value={ticket.weightKg} /><Input min="0" onChange={(event) => setTicket({ ...ticket, pieceCount: event.target.value })} placeholder="Piezas" type="number" value={ticket.pieceCount} /><Input min="0" onChange={(event) => setTicket({ ...ticket, amount: event.target.value })} placeholder="Importe" step="0.01" type="number" value={ticket.amount} /></div><Button type="submit">Guardar referencia</Button></form> : undefined

  return <PageContainer className="space-y-6">
    <header className="relative overflow-hidden rounded-[1.75rem] border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 shadow-sm"><div className="absolute inset-y-0 left-0 w-2 bg-[var(--erp-brand-red)]" /><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-brand-red)]">Mesa de conciliación</p><h1 className="mt-2 text-3xl font-black tracking-tight">Cierre diario de punto de venta</h1><p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted-foreground)]">Consulta el detalle operativo que compone cada total, sin ocultar diferencias.</p></div><form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_auto]" onSubmit={open}><Select aria-label="Ubicación operativa" disabled={locations.isLoading} onChange={(event) => setLocationId(event.target.value)} value={locationId}><option value="">{locations.isLoading ? 'Cargando ubicaciones...' : 'Selecciona punto de venta'}</option>{closeLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {locationTypeLabel(location.type)}</option>)}</Select><Input aria-label="Fecha operativa" max={today} onChange={(event) => setBusinessDate(event.target.value)} type="date" value={businessDate} /><Button disabled={locations.isLoading || closeLocations.length === 0} type="submit"><Plus size={16} /> Abrir cierre</Button></form></div></header>
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]"><aside className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3"><div className="mb-3 flex items-center justify-between px-2"><h2 className="font-bold">Jornadas</h2><Button onClick={() => void load()} size="sm" variant="ghost"><RefreshCw size={15} /></Button></div>{loading ? <p className="p-3 text-sm">Cargando...</p> : items.length === 0 ? <p className="p-3 text-sm text-[var(--erp-muted-foreground)]">Aún no hay cierres.</p> : items.map((item) => <button className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selected?.id === item.id ? 'border-[var(--erp-brand-red)] bg-[var(--erp-surface-muted)]' : 'border-transparent hover:bg-[var(--erp-surface-muted)]'}`} key={item.id} onClick={() => void selectClose(item)} type="button"><span className="block font-semibold">{item.operationalLocation.name}</span><span className="mt-1 flex justify-between text-xs text-[var(--erp-muted-foreground)]"><span>{item.businessDate.slice(0, 10)}</span><span>{statusLabel[item.status]}</span></span></button>)}</aside>
      {!selected ? <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-[var(--erp-border)]"><p className="text-[var(--erp-muted-foreground)]">Abre o selecciona un cierre para comenzar.</p></section> : <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{selected.operationalLocation.name}</h2><p className="text-sm text-[var(--erp-muted-foreground)]">Versión {selected.version} · {statusLabel[selected.status]} · Actualizado {new Date(selected.dataAsOf).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div><div className="flex flex-wrap gap-2">{canAutoRefreshDailyClose(selected.status) && <Button onClick={() => void selectClose(selected)} variant="ghost"><RefreshCw size={16} /> Actualizar</Button>}{canEditDraft && canValidateDailyClose(selected.status) && <Button onClick={() => transition('validate')} variant="secondary"><ClipboardCheck size={16} /> Validar</Button>}{user?.role === 'ADMIN' && selected.status === 'DRAFT' && <Button onClick={() => transition('review')}>Marcar revisado</Button>}{user?.role === 'ADMIN' && selected.status === 'REVIEWED' && <Button onClick={() => transition('close')}><CheckCircle2 size={16} /> Cerrar jornada</Button>}{user?.role === 'ADMIN' && selected.status === 'CLOSED' && <Button onClick={() => transition('reopen')} variant="secondary">Reabrir</Button>}{user?.role === 'ADMIN' && selected.status !== 'CANCELLED' && <Button onClick={() => transition('cancel')} variant="destructive">Cancelar</Button>}</div></div><DailyCloseDetailTabs activeTab={activeTab} canEditInventory={Boolean(editable)} canViewFinancials={canViewFinancials} canViewInventory={canViewInventory} cashCountForm={cashCountForm} close={selected} expenseForm={expenseForm} inventoryReconciliation={inventoryReconciliation} onDeleteInventoryCount={deleteInventoryCount} onSaveInventoryCount={saveInventoryCount} onTabChange={setActiveTab} products={products.data ?? []} scaleTicketForm={scaleTicketForm} validationResult={validationResult} /></section>}
    </div>
    {selected && reportAction && <DailyCloseTransitionDialog action={reportAction} close={selected} onCancel={() => setReportAction(null)} onConfirm={confirmReportTransition} />}
  </PageContainer>
}
