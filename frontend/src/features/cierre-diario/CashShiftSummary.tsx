import type { DailyClose } from './types'

function money(value?: string | number | null) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value ?? 0))
}

export function CashShiftSummary({ close }: { close: DailyClose }) {
  const shifts = close.cashShifts ?? []
  return <section className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)]">
    <header className="flex items-center justify-between border-b border-[var(--erp-border)] px-4 py-3"><div><h3 className="font-bold">Terminales y turnos</h3><p className="text-xs text-[var(--erp-muted-foreground)]">Cada turno conserva su cajero, fondo, conteo y diferencia.</p></div><strong className="text-sm">{shifts.length} turno(s)</strong></header>
    {shifts.length === 0 ? <p className="p-4 text-sm text-[var(--erp-muted-foreground)]">Aún no hay turnos vinculados a este cierre diario.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--erp-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]"><tr><th className="px-4 py-3">Terminal</th><th className="px-4 py-3">Cajero</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Fondo</th><th className="px-4 py-3 text-right">Conteo</th><th className="px-4 py-3 text-right">Diferencia</th></tr></thead><tbody>{shifts.map((shift) => <tr className="border-t border-[var(--erp-border)]" key={shift.id}><td className="px-4 py-3 font-bold">{shift.terminal.name}<span className="block font-mono text-xs font-normal text-[var(--erp-muted-foreground)]">{shift.terminal.code}</span></td><td className="px-4 py-3">{shift.cashier.name}</td><td className="px-4 py-3 font-bold">{shift.status === 'OPEN' ? 'Abierto' : shift.status === 'CLOSED' ? 'Cerrado' : 'Cancelado'}</td><td className="px-4 py-3 text-right font-mono">{money(shift.initialCashFund)}</td><td className="px-4 py-3 text-right font-mono">{shift.cashCountedTotal == null ? 'Pendiente' : money(shift.cashCountedTotal)}</td><td className="px-4 py-3 text-right font-mono font-bold">{shift.cashDifferenceTotal == null ? 'Pendiente' : money(shift.cashDifferenceTotal)}</td></tr>)}</tbody></table></div>}
  </section>
}
