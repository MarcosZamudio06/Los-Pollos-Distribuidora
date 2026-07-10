// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerFormModal } from '../components/CustomerFormModal'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockState = vi.hoisted(() => ({
  policies: { data: [{ id: 'policy-1', name: 'Crédito 7 días' }], error: null, isLoading: false },
  routes: { data: { items: [{ id: 'route-1', name: 'Ruta Centro' }] }, error: null, isLoading: false },
  saveCustomer: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock('../hooks/useCustomers', () => ({
  useCommercialPolicies: () => mockState.policies,
  useSaveCustomer: () => mockState.saveCustomer,
}))

vi.mock('../../rutas-reparto/hooks', () => ({
  useDeliveryRoutes: () => mockState.routes,
}))

function getInput(container: HTMLElement, id: string) {
  const element = container.querySelector(`#${id}`)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Input not found: ${id}`)
  return element
}

function setNativeValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(element, value)
}

async function renderDom(element: React.ReactElement): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
  })
  return { container, root }
}

describe('CustomerFormModal UX', () => {
  beforeEach(() => {
    mockState.policies = { data: [{ id: 'policy-1', name: 'Crédito 7 días' }], error: null, isLoading: false }
    mockState.routes = { data: { items: [{ id: 'route-1', name: 'Ruta Centro' }] }, error: null, isLoading: false }
    mockState.saveCustomer = { isPending: false, mutateAsync: vi.fn() }
  })

  it('renderiza placeholders, catálogos y ayudas para captura empresarial', () => {
    const html = renderToStaticMarkup(<CustomerFormModal canManageCommercialTerms customer={null} onClose={() => undefined} />)

    expect(html).toContain('CLI-000123')
    expect(html).toContain('Pollería Los Hermanos')
    expect(html).toContain('229 123 4567')
    expect(html).toContain('cliente@empresa.com.mx')
    expect(html).toContain('Av. Independencia #245, Col. Centro, Veracruz, Ver.')
    expect(html).toContain('25,000.00')
    expect(html).toContain('Selecciona una ruta')
    expect(html).toContain('Ruta Centro')
    expect(html).toContain('Crédito 7 días')
    expect(html).toContain('RFC SAT: 12 caracteres para persona moral y 13 para persona física.')
  })

  it('formatea teléfono y RFC mientras el usuario captura', async () => {
    const { container, root } = await renderDom(<CustomerFormModal canManageCommercialTerms customer={null} onClose={() => undefined} />)

    try {
      const phone = getInput(container, 'customer-form-phone')
      const taxId = getInput(container, 'customer-form-taxId')

      await act(async () => {
        setNativeValue(phone, '229abc1234567')
        phone.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(phone.value).toBe('229 123 4567')

      await act(async () => {
        setNativeValue(taxId, ' abc010203ab9 ')
        taxId.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(taxId.value).toBe('ABC010203AB9')
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
