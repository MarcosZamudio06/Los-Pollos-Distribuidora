// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoutePlannerPage } from '../pages/RoutePlannerPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type AddressSearchPayload = { q: string; latitude?: number; longitude?: number }

const mockState = vi.hoisted(() => ({
  catalogCalls: [] as string[],
  reverseAddress: vi.fn(async ({ latitude, longitude }: { latitude: number; longitude: number }) => ({
    label: `Punto ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
  })),
  addressSearch: vi.fn(async (params?: AddressSearchPayload) => {
    void params
    return { items: [] as Array<{ label: string; latitude: number; longitude: number }> }
  }),
}))

vi.mock('../hooks', () => ({
  useRoutePlannerCatalog: (search = '') => {
    mockState.catalogCalls.push(search)
    const saleItems = [
      { saleId: 'sale-ver', saleNumber: 'V-2001', customerName: 'Cliente Veracruz', suggestedDeliveryAddress: 'Centro, Veracruz', status: 'CONFIRMED', routeId: null },
      { saleId: 'sale-alv', saleNumber: 'V-2002', customerName: 'Cliente Alvarado', suggestedDeliveryAddress: 'Centro, Alvarado', status: 'CONFIRMED', routeId: null },
    ]
    return {
      drivers: { data: [{ id: 'driver-1', name: 'Repartidor Uno' }], error: null },
      locations: { data: [{ id: 'origin-bdr', name: 'Boca del Río', latitude: 19.1065, longitude: -96.108 }], error: null },
      sales: {
        data: { items: saleItems },
        error: null,
        isLoading: false,
      },
    }
  },
  useAddressSearch: () => ({ isPending: false, mutateAsync: mockState.addressSearch }),
  useReverseAddress: () => ({ mutateAsync: mockState.reverseAddress }),
  useCreateRoutePlan: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateOptimizedRoute: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAssignDeliveryRouteOrders: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeliveryRoute: () => ({ data: null, error: null, isLoading: false }),
}))

vi.mock('../components/RoutePlannerMap', () => ({
  RoutePlannerMap: ({ activeSaleId, onMoveStop, stops }: {
    activeSaleId?: string
    onMoveStop: (saleId: string, latitude: number, longitude: number) => void
    stops: Array<{ saleId: string; latitude: number; longitude: number }>
  }) => (
    <div aria-label="Mapa para planificar la ruta">
      <button onClick={() => activeSaleId && onMoveStop(
        activeSaleId,
        activeSaleId === 'sale-ver' ? 19.183 : 18.7735,
        activeSaleId === 'sale-ver' ? -96.134 : -95.7615,
      )}>Seleccionar punto de entrega</button>
      {stops.map((stop) => <p key={stop.saleId}>{stop.saleId}: {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}</p>)}
    </div>
  ),
}))

vi.mock('@/components/shared/confirmation-dialog', () => ({ ConfirmationDialog: () => null }))

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter><RoutePlannerPage /></MemoryRouter>) })
  return { container, root }
}

function button(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`)
  return match
}

function exactButton(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.trim() === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`)
  return match
}

function selectByLabel(container: HTMLElement, text: string) {
  const label = Array.from(container.querySelectorAll('label')).find((item) => item.textContent?.includes(text))
  const select = label?.querySelector('select')
  if (!(select instanceof HTMLSelectElement)) throw new Error(`Select not found: ${text}`)
  return select
}

function inputByPlaceholder(container: HTMLElement, text: string) {
  const input = container.querySelector(`input[placeholder="${text}"]`)
  if (!(input instanceof HTMLInputElement)) throw new Error(`Input not found: ${text}`)
  return input
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setter) throw new Error('Native input value setter is unavailable')
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('route planner delivery points', () => {
  beforeEach(() => {
    mockState.catalogCalls.length = 0
    mockState.reverseAddress.mockReset().mockImplementation(async ({ latitude, longitude }: { latitude: number; longitude: number }) => ({ label: `Punto ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }))
    mockState.addressSearch.mockReset().mockResolvedValue({ items: [] })
  })

  it('keeps eligible-sale search independent from the selected route origin', async () => {
    const { container, root } = await renderPage()
    try {
      const origin = selectByLabel(container, 'Origen')
      await act(async () => {
        origin.value = 'origin-bdr'
        origin.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(mockState.catalogCalls.at(-1)).toBe('')
      expect(container.textContent).toContain('V-2001')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('selects two sales and preserves an independent delivery point for each one', async () => {
    const { container, root } = await renderPage()
    try {
      await act(async () => { button(container, 'V-2001').click() })
      await act(async () => { button(container, 'Seleccionar punto de entrega').click() })
      await act(async () => { button(container, 'V-2002').click() })
      await act(async () => { button(container, 'Seleccionar punto de entrega').click() })

      expect(container.textContent).toContain('sale-ver: 19.1830, -96.1340')
      expect(container.textContent).toContain('sale-alv: 18.7735, -95.7615')
      expect(container.textContent).toContain('2')
      expect(mockState.reverseAddress).toHaveBeenCalledTimes(2)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('does not let a late reverse-geocode response for one sale overwrite the active sale query', async () => {
    const pending = new Map<number, (value: { label: string }) => void>()
    mockState.reverseAddress.mockImplementation(({ latitude }: { latitude: number }) => new Promise((resolve) => {
      pending.set(latitude, resolve)
    }))
    const { container, root } = await renderPage()
    try {
      await act(async () => { button(container, 'V-2001').click() })
      await act(async () => { button(container, 'Seleccionar punto de entrega').click() })
      await act(async () => { button(container, 'V-2002').click() })
      await act(async () => { button(container, 'Seleccionar punto de entrega').click() })

      await act(async () => { pending.get(18.7735)?.({ label: 'Dirección B resuelta' }) })
      expect(inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad').value).toBe('Dirección B resuelta')

      await act(async () => { pending.get(19.183)?.({ label: 'Dirección A tardía' }) })
      expect(inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad').value).toBe('Dirección B resuelta')
      expect(container.textContent).toContain('Dirección A tardía')
      expect(container.textContent).toContain('Dirección B resuelta')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('keeps delayed address-search results and their application bound to the sale that requested them', async () => {
    const pending = new Map<string, (value: { items: Array<{ label: string; latitude: number; longitude: number }> }) => void>()
    mockState.addressSearch.mockImplementation((params?: AddressSearchPayload) => new Promise((resolve) => { pending.set(params?.q ?? '', resolve) }))
    const { container, root } = await renderPage()
    try {
      await act(async () => { button(container, 'V-2001').click() })
      const addressInput = inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad')
      await act(async () => { setInputValue(addressInput, 'Búsqueda A') })
      await act(async () => { exactButton(container, 'Buscar').click() })

      await act(async () => { button(container, 'V-2002').click() })
      await act(async () => { setInputValue(addressInput, 'Búsqueda B') })
      await act(async () => { exactButton(container, 'Buscar').click() })

      await act(async () => { pending.get('Búsqueda B')?.({ items: [{ label: 'Resultado exclusivo B', latitude: 18.774, longitude: -95.762 }] }) })
      expect(container.textContent).toContain('Resultado exclusivo B')

      await act(async () => { pending.get('Búsqueda A')?.({ items: [{ label: 'Resultado tardío A', latitude: 19.184, longitude: -96.135 }] }) })
      expect(container.textContent).toContain('Resultado exclusivo B')
      expect(container.textContent).not.toContain('Resultado tardío A')

      await act(async () => { exactButton(container, 'Resultado exclusivo B18.774000, -95.762000').click() })
      expect(inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad').value).toBe('Resultado exclusivo B')
      expect(container.textContent).toContain('V-2002 · Cliente Alvarado')
      expect(container.textContent).toContain('Resultado exclusivo B')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('invalidates old async responses when a sale is removed and re-added with the same id', async () => {
    const pendingSearch = new Map<string, (value: { items: Array<{ label: string; latitude: number; longitude: number }> }) => void>()
    const pendingReverse = new Map<number, (value: { label: string }) => void>()
    mockState.addressSearch.mockImplementation((params?: AddressSearchPayload) => new Promise((resolve) => { pendingSearch.set(params?.q ?? '', resolve) }))
    mockState.reverseAddress.mockImplementation(({ latitude }: { latitude: number }) => new Promise((resolve) => { pendingReverse.set(latitude, resolve) }))
    const { container, root } = await renderPage()
    try {
      await act(async () => { button(container, 'V-2001').click() })
      const addressInput = inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad')
      await act(async () => { setInputValue(addressInput, 'Búsqueda de instancia anterior') })
      await act(async () => { exactButton(container, 'Buscar').click() })
      await act(async () => { button(container, 'Seleccionar punto de entrega').click() })

      await act(async () => { button(container, 'V-2001').click() })
      await act(async () => { button(container, 'V-2001').click() })
      expect(inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad').value).toBe('Centro, Veracruz')

      await act(async () => { pendingSearch.get('Búsqueda de instancia anterior')?.({ items: [{ label: 'Resultado obsoleto', latitude: 19.19, longitude: -96.14 }] }) })
      await act(async () => { pendingReverse.get(19.183)?.({ label: 'Dirección obsoleta' }) })

      expect(container.textContent).not.toContain('Resultado obsoleto')
      expect(container.textContent).not.toContain('Dirección obsoleta')
      expect(inputByPlaceholder(container, 'Buscar calle, número, colonia y ciudad').value).toBe('Centro, Veracruz')
      expect(container.textContent).toContain('V-2001 · Cliente VeracruzCentro, Veracruz')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
