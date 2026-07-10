// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../Sidebar'
import { NAVIGATION_ITEMS } from '../navigation'
import { ROUTE_ACCESS_ROLES } from '../routeAccess'
import { getActiveSidebarItemKey, getSidebarNavForRole } from '../roleNavigation'

const mockAuth = vi.hoisted(() => ({
  user: { email: 'admin@pollos.local', id: 'admin-1', name: 'Admin Demo', role: 'ADMIN' },
}))

vi.mock('../../../features/auth', () => ({
  useAuth: () => mockAuth,
}))

describe('role navigation', () => {
  beforeEach(() => {
    mockAuth.user = { email: 'admin@pollos.local', id: 'admin-1', name: 'Admin Demo', role: 'ADMIN' }
  })

  it('declara roles explícitos en cada item de navegación', () => {
    expect(NAVIGATION_ITEMS.length).toBeGreaterThan(0)
    expect(NAVIGATION_ITEMS.every((item) => item.allowedRoles.length > 0)).toBe(true)
  })

  it('mantiene navegación enlazada a la matriz central de rutas', () => {
    expect(NAVIGATION_ITEMS.every((item) => item.allowedRoles === ROUTE_ACCESS_ROLES[item.routeAccessKey])).toBe(true)
    expect(ROUTE_ACCESS_ROLES.accountsReceivable).toEqual(['ADMIN', 'COLLECTIONS'])
    expect(ROUTE_ACCESS_ROLES.deliveryRouteDetail).toEqual(['ADMIN', 'COLLECTIONS', 'DRIVER'])
    expect(ROUTE_ACCESS_ROLES.deliveryRoutes).toEqual(['ADMIN', 'COLLECTIONS', 'WAREHOUSE'])
  })

  it('construye accesos de ADMIN sin rutas de detalle como entradas principales', () => {
    const items = getSidebarNavForRole('ADMIN')

    expect(items.map((item) => item.to)).toEqual([
      '/',
      '/sales',
      '/sales/history',
      '/customers',
      '/accounts-receivable',
      '/inventory',
      '/purchases',
      '/purchases/suppliers',
      '/purchases/new',
      '/delivery-routes',
      '/reports',
      '/admin',
    ])
    expect(items.map((item) => item.to)).not.toContain('/sales/:saleId')
    expect(items.map((item) => item.to)).not.toContain('/purchases/:purchaseId')
  })

  it('limita accesos por rol y deja fallback mínimo para roles desconocidos', () => {
    expect(getSidebarNavForRole('SELLER').map((item) => item.to)).toEqual([
      '/',
      '/sales',
      '/sales/history',
      '/customers',
      '/inventory',
      '/reports',
    ])
    expect(getSidebarNavForRole('WAREHOUSE').map((item) => item.to)).toEqual([
      '/',
      '/inventory',
      '/purchases',
      '/purchases/suppliers',
      '/purchases/new',
      '/delivery-routes',
      '/reports',
    ])
    expect(getSidebarNavForRole('COLLECTIONS').map((item) => item.to)).toEqual([
      '/',
      '/sales/history',
      '/customers',
      '/accounts-receivable',
      '/delivery-routes',
      '/reports',
    ])
    expect(getSidebarNavForRole('DRIVER').map((item) => item.to)).toEqual(['/', '/my-routes', '/reports'])
    expect(getSidebarNavForRole('USER').map((item) => item.to)).toEqual(['/'])
  })

  it('marca rutas de detalle en el acceso principal correcto', () => {
    expect(getActiveSidebarItemKey('/sales/sale-1')).toBe('sales-history')
    expect(getActiveSidebarItemKey('/purchases/purchase-1')).toBe('purchases')
    expect(getActiveSidebarItemKey('/purchases/suppliers')).toBe('purchase-suppliers')
    expect(getActiveSidebarItemKey('/delivery-routes/route-1/evidence')).toBe('delivery-routes')
    expect(getActiveSidebarItemKey('/route-settlements/settlement-1')).toBe('delivery-routes')
  })

  it('renderiza cerrar sesión abajo sin botón interno de cerrar', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/sales/history']}>
        <Sidebar />
      </MemoryRouter>,
    )

    expect(html).toContain('El Pollo')
    expect(html).toContain('Pollos Distribuidora')
    expect(html).toContain('Cerrar sesión')
    expect(html).not.toContain('Cerrar menú lateral')
    expect(html).toContain('aria-current="page"')
    expect(html.lastIndexOf('Cerrar sesión')).toBeGreaterThan(html.lastIndexOf('Reportes'))
  })
})
