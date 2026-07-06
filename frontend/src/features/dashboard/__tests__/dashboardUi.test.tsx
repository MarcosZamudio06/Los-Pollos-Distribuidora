// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '../DashboardPage'
import type { DashboardReport } from '../../reportes'

const dashboardData: DashboardReport = {
  billingRequestsToday: 2,
  cashSalesToday: 1200,
  collectionsToday: 450,
  customersBlockedForCredit: 1,
  dataAsOf: '2026-07-06T12:00:30.000Z',
  deliverySummary: { delivered: 8, inRoute: 4, incident: 1, pending: 3 },
  freshnessSeconds: 30,
  generatedAt: '2026-07-06T12:01:00.000Z',
  isStale: false,
  lowStockByLocation: [{ isLowStock: true, locationId: 'loc-1', locationName: 'Sucursal Norte', minQuantityKg: 5, minQuantityPieces: 0, productId: 'prod-1', productName: 'Pierna', quantityKg: 2, quantityPieces: 0, sku: 'P-1', unit: 'KG' }],
  overdueReceivables: { balance: 900, count: 2 },
  paymentsByBankToday: [{ amount: 400, bankName: 'BBVA', count: 1 }],
  paymentsByMethodToday: [{ amount: 450, count: 2, paymentMethod: 'CASH' }],
  routeCollectionsPendingSettlement: 250,
  salesToday: { cash: 1200, count: 5, credit: 700, total: 1900 },
  topProducts: [{ productId: 'prod-1', productName: 'Pierna', total: 900 }],
}

const mockState = vi.hoisted(() => ({
  auth: { user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' } },
  dashboard: { data: undefined as DashboardReport | undefined, error: null as unknown, isLoading: false, refetch: vi.fn() },
}))

vi.mock('../../auth', () => ({
  useAuth: () => mockState.auth,
}))

vi.mock('../../reportes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../reportes')>()
  return {
    ...actual,
    useDashboardReport: () => mockState.dashboard,
  }
})

describe('TASK-091 dashboard UI', () => {
  beforeEach(() => {
    mockState.auth = { user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' } }
    mockState.dashboard = { data: dashboardData, error: null, isLoading: false, refetch: vi.fn() }
  })

  it('renderiza cards principales, bajo stock por ubicación y gráficas en español', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(html).toContain('Tablero operativo')
    expect(html).toContain('Ventas del día')
    expect(html).toContain('Caja por ventas')
    expect(html).toContain('Bajo stock por ubicación')
    expect(html).toContain('Sucursal Norte')
    expect(html).toContain('Pierna')
    expect(html).toContain('Contado contra crédito')
    expect(html).toContain('Top productos')
    expect(html).not.toContain('global stock')
  })

  it('oculta métricas financieras globales para chofer y conserva estado de rutas', () => {
    mockState.auth = { user: { id: 'driver-1', name: 'Chofer', role: 'DRIVER' } }

    const html = renderToStaticMarkup(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(html).toContain('Estado operativo de rutas')
    expect(html).toContain('Rutas activas')
    expect(html).not.toContain('Caja por ventas')
    expect(html).not.toContain('Saldo vencido')
  })

  it('muestra estado vacío cuando no hay métricas para los filtros', () => {
    mockState.dashboard = {
      data: {
        ...dashboardData,
        billingRequestsToday: 0,
        cashSalesToday: 0,
        collectionsToday: 0,
        deliverySummary: { delivered: 0, inRoute: 0, incident: 0, pending: 0 },
        lowStockByLocation: [],
        overdueReceivables: { balance: 0, count: 0 },
        paymentsByMethodToday: [],
        routeCollectionsPendingSettlement: 0,
        salesToday: { cash: 0, count: 0, credit: 0, total: 0 },
        topProducts: [],
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    }

    const html = renderToStaticMarkup(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(html).toContain('No hay operaciones para los filtros seleccionados')
  })
})
