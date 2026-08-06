import { CedisGateway } from './cedis.gateway';
import { PERMISSIONS } from '../../common/authorization/permissions';
import {
  CEDIS_ADMIN_ROOM,
  CEDIS_SUPPLY_CREATED_EVENT,
  cedisLocationRoom,
} from './cedis-realtime.types';

describe('CedisGateway', () => {
  function createGateway() {
    const authService = { verifyAccessToken: jest.fn() };
    const prisma = { operationalLocation: { findUnique: jest.fn() } };
    const gateway = new CedisGateway(authService as never, prisma as never);
    const emit = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn(() => ({ emit })),
    };
    return { authService, emit, gateway, prisma };
  }

  it('joins a seller only to the assigned branch room', async () => {
    const { authService, gateway, prisma } = createGateway();
    authService.verifyAccessToken.mockResolvedValue({
      id: 'seller-1',
      role: 'SELLER',
      operationalLocationId: 'branch-1',
      mustChangePassword: false,
      permissions: [PERMISSIONS.CEDIS_RECEIVE_SUPPLIES],
    });
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'branch-1',
      type: 'BRANCH',
      isActive: true,
    });
    const socket = {
      disconnect: jest.fn(),
      handshake: { auth: { locationId: 'branch-1', token: 'access-token' } },
      join: jest.fn(),
      once: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith(cedisLocationRoom('branch-1'));
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('emits a supply to its CEDIS, branch, and ADMIN rooms', () => {
    const { emit, gateway } = createGateway();
    const supply = {
      transferId: 'transfer-1',
      transferNumber: 'TRF-001',
      cycleId: 'cycle-1',
      businessDate: '2026-08-05',
      origin: { id: 'cedis-1', name: 'CEDIS Centro' },
      destination: { id: 'branch-1', name: 'Sucursal Centro' },
      requestedAt: '2026-08-05T08:00:00.000Z',
    };

    gateway.emitSupplyCreated(supply);

    const server = (gateway as unknown as { server: { to: jest.Mock } }).server;
    expect(server.to).toHaveBeenCalledWith(cedisLocationRoom('cedis-1'));
    expect(server.to).toHaveBeenCalledWith(cedisLocationRoom('branch-1'));
    expect(server.to).toHaveBeenCalledWith(CEDIS_ADMIN_ROOM);
    expect(emit).toHaveBeenCalledWith(CEDIS_SUPPLY_CREATED_EVENT, supply);
  });

  it('rejects a role without the receipt permission', async () => {
    const { authService, gateway } = createGateway();
    authService.verifyAccessToken.mockResolvedValue({
      id: 'seller-1',
      role: 'SELLER',
      operationalLocationId: 'branch-1',
      mustChangePassword: false,
      permissions: [],
    });
    const socket = {
      disconnect: jest.fn(),
      handshake: { auth: { locationId: 'branch-1', token: 'access-token' } },
      join: jest.fn(),
      once: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
