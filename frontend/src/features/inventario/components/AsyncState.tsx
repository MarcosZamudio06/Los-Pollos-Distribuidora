import type { PropsWithChildren } from 'react'

type AsyncStateProps = PropsWithChildren<{
  empty: boolean
  error?: unknown
  isLoading: boolean
  emptyMessage: string
}>

export function AsyncState({ children, empty, emptyMessage, error, isLoading }: AsyncStateProps) {
  if (isLoading) return <div className="rounded-3xl bg-white p-6 text-sm font-bold text-[#39798b]">Cargando datos de inventario...</div>
  if (error) return <div role="alert" className="rounded-3xl border border-[#d43f2f]/30 bg-[#d43f2f]/10 p-6 text-sm font-bold text-[#9d2d24]">{error instanceof Error ? error.message : 'No se pudo completar la solicitud de inventario.'}</div>
  if (empty) return <div className="rounded-3xl border border-dashed border-[#20211f]/20 bg-white p-6 text-sm text-[#68645c]">{emptyMessage}</div>
  return children
}
