type LowStockBadgeProps = {
  isLowStock?: boolean
  locationSelected?: boolean
}

export function LowStockBadge({ isLowStock, locationSelected = true }: LowStockBadgeProps) {
  if (!locationSelected) {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
        Selecciona ubicación
      </span>
    )
  }

  return isLowStock ? (
    <span className="inline-flex items-center rounded-full border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--erp-danger)]">
      Stock bajo
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[rgba(63,123,65,0.22)] bg-[rgba(63,123,65,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--erp-success)]">
      OK
    </span>
  )
}
