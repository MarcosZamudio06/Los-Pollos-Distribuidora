import { useState } from 'react'
import { ConfirmationDialog } from '../../components/shared/confirmation-dialog'
import { formatMoney as money } from '../../lib/money'
import { getDailyCloseTransitionCopy, type DailyCloseReportAction } from './dailyCloseTransition'
import type { DailyClose } from './types'


type DailyCloseTransitionDialogProps = {
  action: DailyCloseReportAction
  close: DailyClose
  onCancel: () => void
  onConfirm: (reason?: string) => Promise<void>
}

export function DailyCloseTransitionDialog({ action, close, onCancel, onConfirm }: DailyCloseTransitionDialogProps) {
  const [reason, setReason] = useState('')
  const copy = getDailyCloseTransitionCopy(action)
  const date = close.businessDate.slice(0, 10)
  const billableNotes = (close.sales ?? []).filter((sale) => sale.requiresAdministrativeInvoice || (sale.billingRequests?.length ?? 0) > 0).length
  const unresolvedDifferences = (close.differences ?? []).filter((difference) => Number(difference.differenceValue) !== 0 && difference.status !== 'AUTHORIZED').length
  const kilograms = (value: string | number) => `${Number(value).toFixed(3)} kg`

  return (
    <ConfirmationDialog
      cancelLabel="Conservar estado actual"
      confirmDisabled={copy.requiresReason && !reason.trim()}
      confirmLabel={copy.confirmLabel}
      description={copy.description}
      onConfirm={() => onConfirm(copy.requiresReason ? reason.trim() : undefined)}
      onOpenChange={(open) => { if (!open) onCancel() }}
      open
      title={copy.title}
    >
      <p><strong>Sucursal:</strong> {close.operationalLocation.name}</p>
      <p><strong>Fecha operativa:</strong> {date}</p>
      <p><strong>Versión del reporte:</strong> {close.version}</p>
      {action === 'close' && (
        <div className="mt-3 grid gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-3 text-sm sm:grid-cols-2">
          <p><strong>Kilos vendidos:</strong> {kilograms(close.totalSoldKg)}</p>
          <p><strong>Kilos en báscula:</strong> {kilograms(close.scaleReportedKg)}</p>
          <p><strong>Inventario teórico:</strong> {kilograms(close.totalRemainingKg)}</p>
          <p><strong>Gastos:</strong> {money(close.expenseTotal)}</p>
          <p><strong>Ventas:</strong> {money(close.grossSalesTotal)} ({close.sales?.length ?? 0})</p>
          <p><strong>Notas facturables:</strong> {billableNotes}</p>
          <p><strong>Efectivo esperado:</strong> {money(close.netCashExpected)}</p>
          <p><strong>Efectivo contado:</strong> {close.cashCountedTotal === null ? 'Pendiente de captura' : money(close.cashCountedTotal)}</p>
          <p><strong>Diferencia de efectivo:</strong> {close.cashDifferenceTotal === null ? 'Pendiente de captura' : money(close.cashDifferenceTotal)}</p>
          <p><strong>Diferencias sin resolver:</strong> {unresolvedDifferences}</p>
          <p><strong>Sobrante de inventario:</strong> {kilograms(close.totalSurplusKg)}</p>
          <p><strong>Faltante de inventario:</strong> {kilograms(close.totalShortageKg)}</p>
        </div>
      )}
      {copy.requiresReason && (
        <label className="mt-2 grid gap-2 font-bold text-[var(--erp-muted-foreground)]">
          Motivo de reapertura
          <textarea
            autoFocus
            className="min-h-28 resize-y rounded-xl border border-[var(--erp-border)] bg-white px-4 py-3 font-normal text-[var(--erp-foreground)] outline-none transition focus:border-[var(--erp-brand-red)] focus:ring-2 focus:ring-[rgba(157,45,36,0.12)]"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe qué información debe corregirse o actualizarse."
            value={reason}
          />
        </label>
      )}
    </ConfirmationDialog>
  )
}
