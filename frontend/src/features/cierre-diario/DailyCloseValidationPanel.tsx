import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { DailyCloseValidationResult } from './types'

type ValidationItem = { code: string; message: string }

const differenceLabel: Record<string, string> = {
  CASH_DIFFERENCE: 'Diferencia de efectivo',
  SCALE_DIFFERENCE: 'Diferencia de báscula',
  SHORTAGE: 'Faltante de inventario',
  SURPLUS: 'Sobrante de inventario',
}

export function validationDifferences(result: DailyCloseValidationResult): ValidationItem[] {
  const differences = result.differences.map((difference) => ({ code: difference.code, message: `${differenceLabel[difference.code] ?? difference.code}: ${difference.value.toFixed(3)} ${difference.unit}` }))
  if (Number(result.close.totalShortageKg) !== 0) differences.push({ code: 'SHORTAGE', message: `Faltante de inventario: ${Number(result.close.totalShortageKg).toFixed(3)} kg` })
  if (Number(result.close.totalSurplusKg) !== 0) differences.push({ code: 'SURPLUS', message: `Sobrante de inventario: ${Number(result.close.totalSurplusKg).toFixed(3)} kg` })
  return differences
}

export function validationWarnings(close: DailyCloseValidationResult['close']): ValidationItem[] {
  return [
    ...(close.costQuality === 'ESTIMATED' ? [{ code: 'ESTIMATED_COST', message: 'El costo del producto es estimado.' }] : []),
    ...(close.sales ?? []).filter((sale) => !sale.physicalFolio?.trim()).map((sale) => ({ code: `MISSING_FOLIO_${sale.saleNumber}`, message: `La venta ${sale.saleNumber} no tiene folio físico.` })),
    ...(close.scaleTicketReferences ?? []).filter((ticket) => (ticket.weightKg === null || ticket.weightKg === undefined || ticket.weightKg === '') && (ticket.pieceCount === null || ticket.pieceCount === undefined)).map((ticket) => ({ code: `INCOMPLETE_SCALE_REFERENCE_${ticket.id}`, message: `La referencia de báscula ${ticket.physicalFolio} no tiene kilos ni piezas.` })),
  ]
}

function Group({ empty, items, title }: { empty: string; items: ValidationItem[]; title: string }) {
  return <article className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4"><h4 className="font-bold">{title}</h4>{items.length === 0 ? <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">{empty}</p> : <ul className="mt-2 space-y-2 text-sm">{items.map((item) => <li key={item.code}>{item.message}</li>)}</ul>}</article>
}

export function DailyCloseValidationPanel({ result }: { result: DailyCloseValidationResult }) {
  const differences = validationDifferences(result)
  const warnings = validationWarnings(result.close)
  return <section aria-live="polite" className={`rounded-2xl border p-5 ${result.valid ? 'border-emerald-300 bg-emerald-50/70' : 'border-amber-400 bg-amber-50/70'}`}>
    <div className="flex gap-3"><div className="pt-0.5">{result.valid ? <CheckCircle2 className="text-emerald-700" size={20} /> : <ShieldAlert className="text-amber-800" size={20} />}</div><div><h3 className="font-bold">{result.valid ? 'Validación completada' : 'La validación requiere atención'}</h3><p className="mt-1 text-sm">{result.valid ? 'No hay bloqueantes para avanzar a revisión.' : 'Corrige los bloqueantes antes de marcar el cierre como revisado.'}</p></div></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-3"><Group empty="No hay bloqueantes." items={result.errors} title="Bloqueantes" /><Group empty="No hay diferencias detectadas." items={differences} title="Diferencias" /><Group empty="No hay advertencias." items={warnings} title="Advertencias" /></div>
    {!result.valid && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> El cierre no está validado.</div>}
  </section>
}
