import { useState } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { formatMoney as money } from '../../lib/money'
import type { DailyClose, DailyCloseCashShift } from './types'

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusLabel(status: DailyCloseCashShift['status']) {
  return status === 'OPEN' ? 'Abierto' : status === 'CLOSED' ? 'Cerrado' : 'Cancelado'
}

type CashShiftSummaryProps = {
  close: DailyClose
  currentUserId?: string
  canAdministrativelyClose: boolean
  onCloseShift: (
    shiftId: string,
    body: { cashCountedTotal: number; administrativeReason?: string },
  ) => Promise<void>
}

export function CashShiftSummary({ close, currentUserId, canAdministrativelyClose, onCloseShift }: CashShiftSummaryProps) {
  const shifts = [...(close.cashShifts ?? [])].sort((left, right) => {
    if (left.status === 'OPEN' && right.status !== 'OPEN') return -1
    if (left.status !== 'OPEN' && right.status === 'OPEN') return 1
    return left.openedAt.localeCompare(right.openedAt)
  })
  const openShifts = shifts.filter((shift) => shift.status === 'OPEN')
  const historicalShifts = shifts.filter((shift) => shift.status !== 'OPEN')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [pendingShiftId, setPendingShiftId] = useState<string | null>(null)

  const submit = async (shift: DailyCloseCashShift, administrative: boolean) => {
    const counted = Number(counts[shift.id])
    const reason = reasons[shift.id]?.trim() ?? ''
    if (!Number.isFinite(counted) || counted < 0) return
    if (administrative && !reason) return

    setPendingShiftId(shift.id)
    try {
      await onCloseShift(shift.id, {
        cashCountedTotal: counted,
        ...(administrative ? { administrativeReason: reason } : {}),
      })
      setCounts((current) => ({ ...current, [shift.id]: '' }))
      setReasons((current) => ({ ...current, [shift.id]: '' }))
    } finally {
      setPendingShiftId(null)
    }
  }

  return <section className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)]">
    <header className="flex flex-col gap-2 border-b border-[var(--erp-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-bold">Turnos de caja</h3>
        <p className="text-xs text-[var(--erp-muted-foreground)]">Cada turno conserva su cajero, fondo, conteo y diferencia.</p>
      </div>
      <strong className="text-sm">{shifts.length} turno(s) · {openShifts.length} abiertos</strong>
    </header>
    {openShifts.length > 0 && <div className="border-b border-[var(--erp-border)] bg-[rgba(214,155,45,0.08)] p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-[var(--erp-warning)]" size={18} />
        <div>
          <h4 className="font-black">Turnos abiertos</h4>
          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Cierra cada turno y revisa su diferencia antes de finalizar la jornada.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {openShifts.map((shift) => {
          const canCloseNormally = shift.cashierUserId === currentUserId
          const administrative = !canCloseNormally && canAdministrativelyClose
          const canClose = canCloseNormally || administrative
          return <article className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4" key={shift.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-black">{shift.terminal.name} <span className="font-mono text-xs font-normal text-[var(--erp-muted-foreground)]">{shift.terminal.code}</span></p>
                <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{shift.cashier.name} · Abierto {dateTime(shift.openedAt)}</p>
                <p className="mt-1 text-sm">Fondo inicial: <strong className="tabular-nums">{money(Number(shift.initialCashFund) + Number(shift.initialCashIn) - Number(shift.initialCashOut))}</strong></p>
              </div>
              {canClose ? <form className="grid gap-2 lg:min-w-[440px] lg:grid-cols-[1fr_1.4fr_auto] lg:items-end" onSubmit={(event) => { event.preventDefault(); void submit(shift, administrative).catch(() => undefined) }}>
                <label className="grid gap-1 text-xs font-bold text-[var(--erp-muted-foreground)]">
                  Efectivo contado
                  <Input aria-label={`Efectivo contado de ${shift.terminal.name}`} min="0" onChange={(event) => setCounts((current) => ({ ...current, [shift.id]: event.target.value }))} required step="0.01" type="number" value={counts[shift.id] ?? ''} />
                </label>
                {administrative ? <label className="grid gap-1 text-xs font-bold text-[var(--erp-muted-foreground)]">
                  Motivo administrativo
                  <Input aria-label={`Motivo administrativo de ${shift.terminal.name}`} onChange={(event) => setReasons((current) => ({ ...current, [shift.id]: event.target.value }))} placeholder="Terminal inaccesible o turno abandonado" required value={reasons[shift.id] ?? ''} />
                </label> : <div className="hidden lg:block" />}
                <Button disabled={pendingShiftId === shift.id} type="submit" variant={administrative ? 'secondary' : 'primary'}>{pendingShiftId === shift.id ? 'Cerrando...' : administrative ? 'Cierre administrativo' : 'Cerrar turno'}</Button>
              </form> : <p className="flex items-center gap-2 text-sm font-semibold text-[var(--erp-muted-foreground)]"><LockKeyhole size={16} /> El cajero debe cerrar desde su terminal.</p>}
            </div>
          </article>
        })}
      </div>
    </div>}
    {historicalShifts.length === 0 ? <p className="p-4 text-sm text-[var(--erp-muted-foreground)]">Aún no hay turnos cerrados en este cierre diario.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">Turnos cerrados o cancelados</caption><thead className="bg-[var(--erp-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]"><tr><th className="px-4 py-3">Terminal</th><th className="px-4 py-3">Cajero</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Cierre</th><th className="px-4 py-3 text-right">Fondo</th><th className="px-4 py-3 text-right">Conteo</th><th className="px-4 py-3 text-right">Diferencia</th></tr></thead><tbody>{historicalShifts.map((shift) => <tr className="border-t border-[var(--erp-border)]" key={shift.id}><td className="px-4 py-3 font-bold">{shift.terminal.name}<span className="block font-mono text-xs font-normal text-[var(--erp-muted-foreground)]">{shift.terminal.code}</span></td><td className="px-4 py-3">{shift.cashier.name}</td><td className="px-4 py-3 font-bold">{statusLabel(shift.status)}</td><td className="px-4 py-3 text-xs">{shift.status === 'CANCELLED' ? <span className="text-[var(--erp-muted-foreground)]">Sin cierre</span> : shift.closeMode === 'ADMINISTRATIVE' ? <span className="font-semibold text-[var(--erp-warning)]">Administrativo{shift.closeReason ? <span className="block text-[var(--erp-muted-foreground)]">{shift.closeReason}</span> : null}</span> : <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> Cajero</span>}</td><td className="px-4 py-3 text-right font-mono">{money(shift.initialCashFund)}</td><td className="px-4 py-3 text-right font-mono">{shift.cashCountedTotal == null ? 'Pendiente' : money(shift.cashCountedTotal)}</td><td className="px-4 py-3 text-right font-mono font-bold">{shift.cashDifferenceTotal == null ? 'Pendiente' : money(shift.cashDifferenceTotal)}</td></tr>)}</tbody></table></div>}
  </section>
}
