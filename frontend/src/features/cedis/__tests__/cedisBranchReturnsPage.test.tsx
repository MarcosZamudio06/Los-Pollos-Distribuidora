// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CedisBranchReturnsPage } from '../CedisBranchReturnsPage';
import type { CedisBranchReturn } from '../types';

const state = vi.hoisted(() => ({
  auth: { accessToken: 'token', user: { id: 'seller-1', name: 'Vendedora', role: 'SELLER', operationalLocationId: 'branch-1', permissions: ['cedis.view', 'cedis.request_returns'] } },
  location: { data: { id: 'branch-1', name: 'Sucursal Centro', code: 'S01', type: 'BRANCH', parentId: 'cedis-1' as string | null }, isLoading: false, error: null as unknown, refetch: vi.fn() },
  history: { data: { items: [{ cycle: { id: 'cycle-1', businessDate: '2026-08-05', status: 'OPEN', version: 2 }, branch: { id: 'branch-1', name: 'Sucursal Centro', code: 'S01' } }] }, isLoading: false, error: null, refetch: vi.fn() },
  summary: { data: { id: 'cycle-1', businessDate: '2026-08-05', status: 'OPEN', version: 2, branch: { id: 'branch-1', name: 'Sucursal Centro', code: 'S01' }, distributionCenter: { id: 'cedis-1', name: 'CEDIS Centro', code: 'C01' }, items: [], totals: { expectedSales: '0' } }, isLoading: false, error: null, refetch: vi.fn() },
  returns: { data: undefined as { items: CedisBranchReturn[]; total: number; page: number; limit: number; totalPages: number } | undefined, isLoading: false, error: null as unknown, refetch: vi.fn() },
  complete: { isPending: false, mutateAsync: vi.fn() },
  create: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('../../auth', () => ({ useAuth: () => state.auth }));
vi.mock('../hooks', () => ({
  useOperationalLocation: () => state.location,
  useCedisBranchHistory: () => state.history,
  useCedisCycleSummary: () => state.summary,
  useCedisReturns: () => state.returns,
  useCompleteCedisReturn: () => state.complete,
  useCreateCedisReturn: () => state.create,
}));
vi.mock('../../inventario/hooks/useProducts', () => ({ useProducts: () => ({ data: [], isLoading: false, error: null }) }));
vi.mock('../CedisTransferCommandPanel', () => ({ CedisTransferCommandPanel: () => <p>Solicitar devolución</p> }));

const branchReturn = (status: 'PENDING' | 'COMPLETED' | 'CANCELLED'): CedisBranchReturn => ({
  id: 'return-1', transferNumber: 'TRF-RET-001', status, notes: 'Producto no vendido', requestedAt: '2026-08-05T09:00:00.000Z', confirmedAt: status === 'COMPLETED' ? '2026-08-05T10:00:00.000Z' : null, cancelledAt: null, createdAt: '2026-08-05T09:00:00.000Z', requestedBy: { id: 'seller-1', name: 'Vendedora' },
  cycle: { id: 'cycle-1', version: 2, businessDate: '2026-08-05', branch: { id: 'branch-1', name: 'Sucursal Centro', code: 'S01' }, distributionCenter: { id: 'cedis-1', name: 'CEDIS Centro', code: 'C01' } },
  items: [{ transferItemId: 'item-1', productId: 'product-1', productName: 'Pollo entero', unit: 'KG', quantityKg: 3, quantityPieces: 0 }],
});

function renderPage() { return renderToStaticMarkup(<MemoryRouter initialEntries={['/cedis/returns?date=2026-08-05']}><CedisBranchReturnsPage /></MemoryRouter>); }

describe('CEDIS branch returns page', () => {
  beforeEach(() => {
    state.auth.user = { id: 'seller-1', name: 'Vendedora', role: 'SELLER', operationalLocationId: 'branch-1', permissions: ['cedis.view', 'cedis.request_returns'] };
    state.location.data = { id: 'branch-1', name: 'Sucursal Centro', code: 'S01', type: 'BRANCH', parentId: 'cedis-1' as string | null };
    state.returns = { data: { items: [branchReturn('PENDING')], total: 1, page: 1, limit: 25, totalPages: 1 }, isLoading: false, error: null, refetch: vi.fn() };
  });

  it('shows the branch worker return command and own history', () => {
    const html = renderPage();
    expect(html).toContain('Solicitar devolución');
    expect(html).toContain('TRF-RET-001');
    expect(html).toContain('Sucursal Centro → CEDIS Centro');
  });

  it('shows the CEDIS pending queue and explicit completion action only to a CEDIS reviewer', () => {
    state.auth.user = { id: 'warehouse-1', name: 'Almacén', role: 'WAREHOUSE', operationalLocationId: 'cedis-1', permissions: ['cedis.view', 'cedis.receive_returns'] };
    state.location.data = { id: 'cedis-1', name: 'CEDIS Centro', code: 'C01', type: 'DISTRIBUTION_CENTER', parentId: null };
    const html = renderPage();
    expect(html).toContain('Devoluciones pendientes');
    expect(html).toContain('Marcar devolución como recibida');
    expect(html).not.toContain('Solicitar devolución');
  });

  it('renders loading, error and empty states', () => {
    state.returns = { data: undefined, isLoading: true, error: null, refetch: vi.fn() };
    expect(renderPage()).toContain('Cargando devoluciones');
    state.returns = { data: undefined, isLoading: false, error: new Error('falló'), refetch: vi.fn() };
    expect(renderPage()).toContain('No se pudo cargar');
    state.returns = { data: { items: [], total: 0, page: 1, limit: 25, totalPages: 0 }, isLoading: false, error: null, refetch: vi.fn() };
    expect(renderPage()).toContain('No hay devoluciones');
  });
});
