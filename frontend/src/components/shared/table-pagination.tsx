import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const TABLE_PAGE_SIZE = 10

export function useTablePagination<T>(items: readonly T[]) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE))

  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])

  return {
    page,
    pageCount,
    pageItems: useMemo(() => items.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE), [items, page]),
    setPage,
  }
}

export function TablePagination({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= TABLE_PAGE_SIZE) return null
  const first = (page - 1) * TABLE_PAGE_SIZE + 1
  const last = Math.min(page * TABLE_PAGE_SIZE, total)
  return (
    <nav aria-label="Paginación de tabla" className="flex flex-col gap-3 border-t border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold text-[var(--erp-muted-foreground)]">Mostrando {first}-{last} de {total} registros</p>
      <div className="flex items-center gap-2">
        <button aria-label="Página anterior" className="inline-flex h-9 items-center gap-1 rounded-lg border border-[color:var(--erp-border)] bg-white px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={page === 1} onClick={() => onPageChange(page - 1)} type="button"><ChevronLeft className="h-4 w-4" />Anterior</button>
        <span aria-live="polite" className="min-w-20 text-center text-xs font-bold text-[var(--erp-muted-foreground)]">Página {page} de {pageCount}</span>
        <button aria-label="Página siguiente" className="inline-flex h-9 items-center gap-1 rounded-lg border border-[color:var(--erp-border)] bg-white px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} type="button">Siguiente<ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  )
}
