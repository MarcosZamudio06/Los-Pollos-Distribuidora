import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/api'
import { useAuth } from '../../features/auth'

export type CatalogOption = { id: string; label: string }

type Envelope<T> = { data?: T } | T

function unwrapItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (Array.isArray(record.items)) return record.items
  return unwrapItems(record.data)
}

function option(item: unknown): CatalogOption | null {
  if (!item || typeof item !== 'object') return null
  const value = item as Record<string, unknown>
  const id = String(value.id ?? '')
  const label = String(value.name ?? value.fullName ?? value.commercialName ?? value.customerNumber ?? id)
  return id ? { id, label } : null
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOperationalCatalog(path: string, enabled = true) {
  const { accessToken } = useAuth()
  return useQuery({
    enabled,
    queryKey: ['operational-catalog', path],
    queryFn: async () => {
      const response = await apiClient.get<Envelope<unknown>>(path, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined })
      return unwrapItems(response).map(option).filter((item): item is CatalogOption => Boolean(item))
    },
  })
}

export function CatalogSelect({ className, error, isLoading, label, onChange, options, placeholder = 'Todos', value }: {
  className: string
  error?: unknown
  isLoading?: boolean
  label?: string
  onChange: (value: string) => void
  options?: CatalogOption[]
  placeholder?: string
  value?: string
}) {
  return <span className="grid gap-1">
    <select aria-label={label} className={className} disabled={isLoading || Boolean(error)} onChange={(event) => onChange(event.target.value)} value={value ?? ''}>
      <option value="">{isLoading ? 'Cargando…' : placeholder}</option>
      {error == null && (options ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {Boolean(error) && <span role="alert" className="text-xs normal-case tracking-normal text-[var(--erp-danger)]">No se pudo cargar el catálogo de {label?.toLocaleLowerCase('es-MX') ?? 'opciones'}.</span>}
    {error == null && !isLoading && options?.length === 0 && <span className="text-xs normal-case tracking-normal text-[var(--erp-muted-foreground)]">No hay opciones disponibles.</span>}
  </span>
}

export function MiniAjaxSelect({ className, endpoint, label, onChange, placeholder, value }: {
  className: string
  endpoint: string
  label: string
  onChange: (value: string) => void
  placeholder: string
  value?: string
}) {
  const listId = useId()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<CatalogOption | null>(null)
  const previousValue = useRef(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => {
    if (previousValue.current && !value) {
      setSelected(null)
      setSearch('')
    }
    previousValue.current = value
  }, [value])
  const separator = endpoint.includes('?') ? '&' : '?'
  const results = useOperationalCatalog(`${endpoint}${separator}search=${encodeURIComponent(debounced)}&limit=20`, debounced.length >= 2)
  const display = (item: CatalogOption) => `${item.label} · ${item.id}`

  return <div className="grid gap-1">
    <input aria-label={label} className={className} list={listId} onChange={(event) => {
      const text = event.target.value
      setSearch(text)
      const match = results.data?.find((item) => display(item) === text)
      setSelected(match ?? null)
      onChange(match?.id ?? '')
    }} placeholder={placeholder} value={selected && selected.id === value ? display(selected) : search} />
    <datalist id={listId}>{results.data?.map((item) => <option key={item.id} value={display(item)} />)}</datalist>
    {results.isFetching && <span className="text-xs normal-case tracking-normal text-[var(--erp-muted-foreground)]">Buscando coincidencias…</span>}
    {results.error && <span role="alert" className="text-xs normal-case tracking-normal text-[var(--erp-danger)]">No se pudieron consultar las coincidencias.</span>}
  </div>
}
