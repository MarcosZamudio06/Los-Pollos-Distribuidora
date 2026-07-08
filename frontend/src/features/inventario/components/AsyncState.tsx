import type { PropsWithChildren } from 'react'

type AsyncStateProps = PropsWithChildren<{
  empty: boolean
  error?: unknown
  isLoading: boolean
  emptyMessage: string
}>

export function AsyncState({ children, empty, emptyMessage, error, isLoading }: AsyncStateProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 text-sm font-semibold text-[var(--erp-info)] shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
        Cargando datos de inventario...
      </div>
    )
  }
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-6 text-sm font-semibold text-[var(--erp-danger)]"
      >
        {error instanceof Error ? error.message : 'No se pudo completar la solicitud de inventario.'}
      </div>
    )
  }
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 text-sm text-[var(--erp-muted-foreground)]">
        {emptyMessage}
      </div>
    )
  }
  return children
}
