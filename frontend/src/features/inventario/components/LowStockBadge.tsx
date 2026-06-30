type LowStockBadgeProps = {
  isLowStock?: boolean
  locationSelected?: boolean
}

export function LowStockBadge({ isLowStock, locationSelected = true }: LowStockBadgeProps) {
  if (!locationSelected) {
    return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Selecciona ubicación</span>
  }

  return isLowStock ? (
    <span className="rounded-full bg-[#f9d8d4] px-3 py-1 text-xs font-bold text-[#9d2d24]">Stock bajo</span>
  ) : (
    <span className="rounded-full bg-[#dbeee8] px-3 py-1 text-xs font-bold text-[#2d6b4f]">OK</span>
  )
}
