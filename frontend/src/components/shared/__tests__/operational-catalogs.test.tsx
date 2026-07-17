// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogSelect, MiniAjaxSelect } from '../operational-catalogs'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../features/auth', () => ({ useAuth: () => ({ accessToken: 'token' }) }))

describe('catálogos operativos', () => {
  let root: Root | undefined
  let container: HTMLDivElement
  let client: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    root = undefined
  })

  function render(node: ReactNode) {
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => root?.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>))
  }

  async function rerender(node: ReactNode) {
    await act(async () => root?.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>))
  }

  async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('muestra loading, vacío y error sin convertir el error en una opción', async () => {
    const onChange = vi.fn()
    render(<CatalogSelect className="field" isLoading label="Ubicación" onChange={onChange} />)
    expect(container.querySelector('select')?.disabled).toBe(true)
    expect(container.textContent).toContain('Cargando')

    await rerender(<CatalogSelect className="field" label="Ubicación" onChange={onChange} options={[]} />)
    expect(container.textContent).toContain('No hay opciones disponibles')

    await rerender(<CatalogSelect className="field" error={new Error('falló')} label="Ubicación" onChange={onChange} />)
    expect(container.querySelector('select')?.disabled).toBe(true)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar')
    expect([...container.querySelectorAll('option')].some((item) => item.textContent === 'No disponible')).toBe(false)
  })

  it('espera el debounce, selecciona un ID inequívoco y conserva la etiqueta seleccionada', async () => {
    const onChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { items: [{ id: 'customer-1', name: 'Comercial Centro' }] } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<MiniAjaxSelect className="field" endpoint="/customers?isActive=true" label="Cliente" onChange={onChange} placeholder="Buscar cliente" />)
    const input = container.querySelector('input')!

    await type(input, 'Com')
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await Promise.resolve(); await Promise.resolve() })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('search=Com'), expect.anything())
    await act(async () => { await vi.advanceTimersByTimeAsync(100); await Promise.resolve() })
    expect(container.querySelector('datalist option')?.getAttribute('value')).toBe('Comercial Centro · customer-1')

    await type(input, 'Comercial Centro · customer-1')
    expect(onChange).toHaveBeenLastCalledWith('customer-1')
    expect(input.value).toBe('Comercial Centro · customer-1')
  })

  it('limpia el texto cuando el value externo se restablece', async () => {
    const onChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { items: [{ id: 'user-1', name: 'Ana López' }] } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<MiniAjaxSelect className="field" endpoint="/users?status=active" label="Usuario" onChange={onChange} placeholder="Buscar usuario" value="user-1" />)
    const input = container.querySelector('input')!
    await type(input, 'Ana')
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(100); await Promise.resolve() })
    await type(input, 'Ana López · user-1')
    await rerender(<MiniAjaxSelect className="field" endpoint="/users?status=active" label="Usuario" onChange={onChange} placeholder="Buscar usuario" value="" />)
    expect(container.querySelector('input')?.value).toBe('')
  })
})
