import { SalesGateway } from './sales.gateway';
import { SALE_CREATED_EVENT, salesLocationRoom } from './sales-realtime.types';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';

describe('SalesGateway', () => {
  function createGateway() {
    const authService = {
      verifyAccessToken: jest.fn(),
    };
    const prisma = {
      operationalLocation: { findUnique: jest.fn() },
    };
    const gateway = new SalesGateway(authService as never, prisma as never);
    const emit = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn(() => ({ emit })),
    };
    return { authService, emit, gateway, prisma };
  }

  it('joins only the authenticated seller operational location', async () => {
    const { authService, gateway, prisma } = createGateway();
    authService.verifyAccessToken.mockResolvedValue({
      id: 'seller-1',
      role: 'SELLER',
      operationalLocationId: 'loc-1',
      mustChangePassword: false,
    });
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'loc-1',
      isActive: true,
    });
    const socket = {
      disconnect: jest.fn(),
      handshake: { auth: { locationId: 'loc-1', token: 'access-token' } },
      join: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith(salesLocationRoom('loc-1'));
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects a seller attempting to join another location room', async () => {
    const { authService, gateway } = createGateway();
    authService.verifyAccessToken.mockResolvedValue({
      id: 'seller-1',
      role: 'SELLER',
      operationalLocationId: 'loc-1',
      mustChangePassword: false,
    });
    const socket = {
      disconnect: jest.fn(),
      handshake: { auth: { locationId: 'loc-2', token: 'access-token' } },
      join: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits a sale only to its operational location room', () => {
    const { emit, gateway } = createGateway();
    const order = {
      id: 'sale-1',
      saleNumber: 'SALE-000001',
      createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' },
      customer: null,
      items: [],
      total: '250.00',
      status: 'CONFIRMED' as const,
    };

    gateway.emitSaleCreated(order);

    expect(
      (gateway as unknown as { server: { to: jest.Mock } }).server.to,
    ).toHaveBeenCalledWith(salesLocationRoom('loc-1'));
    expect(emit).toHaveBeenCalledWith(SALE_CREATED_EVENT, order);
  });

  it('disconnects sockets after the user session is revoked', async () => {
    const authService = { verifyAccessToken: jest.fn().mockResolvedValue({
      id: 'seller-1',
      role: 'SELLER',
      operationalLocationId: 'loc-1',
      mustChangePassword: false,
    }) };
    const prisma = {
      operationalLocation: { findUnique: jest.fn().mockResolvedValue({ id: 'loc-1', isActive: true }) },
    };
    const registry = new SessionRevocationRegistry();
    const gateway = new SalesGateway(authService as never, prisma as never, registry);
    const socket = {
      disconnect: jest.fn(),
      handshake: { auth: { locationId: 'loc-1', token: 'access-token' } },
      join: jest.fn(),
      once: jest.fn(),
    };

    await gateway.handleConnection(socket as never);
    registry.notify(['seller-1']);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
