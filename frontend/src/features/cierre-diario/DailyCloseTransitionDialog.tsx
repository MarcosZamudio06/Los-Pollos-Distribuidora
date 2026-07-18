import { useState } from 'react'
import { ConfirmationDialog } from '../../components/shared/confirmation-dialog'
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
