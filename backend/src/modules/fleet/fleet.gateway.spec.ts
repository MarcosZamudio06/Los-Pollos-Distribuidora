import { DeliveryRouteStatus } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import { FleetGateway } from './fleet.gateway';
import {
  FLEET_ADMIN_ROOM,
  FLEET_GEOFENCE_ENTERED_EVENT,
  FLEET_INCIDENT_CREATED_EVENT,
  FLEET_POSITION_UPDATED_EVENT,
  fleetDriverRoom,
  fleetOriginRoom,
  fleetRouteRoom,
} from './fleet-realtime.types';

describe('FleetGateway', () => {
  function createGateway() {
    const authService = { verifyAccessToken: jest.fn() };
    const prisma = { deliveryRoute: { findMany: jest.fn() } };
    const gateway = new FleetGateway(authService as never, prisma as never);
    const emit = jest.fn();
    const server = {
      to: jest.fn(() => ({ emit })),
    };
    (gateway as unknown as { server: typeof server }).server = server;
    return { authService, emit, gateway, prisma, server };
  }

  function socket(auth: Record<string, unknown> = {}) {
    return {
      disconnect: jest.fn(),
      handshake: { auth },
      join: jest.fn(),
      once: jest.fn(),
    };
  }

  const admin = (overrides: Record<string, unknown> = {}) => ({
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
    permissions: [PERMISSIONS.FLEET_VIEW],
    mustChangePassword: false,
    authSessionId: 'session-1',
    ...overrides,
  });

  const driver = (overrides: Record<string, unknown> = {}) => ({
    id: 'driver-1',
    email: 'driver@example.com',
    name: 'Driver',
    role: 'DRIVER',
    permissions: [PERMISSIONS.FLEET_POSITION_PUBLISH],
    mustChangePassword: false,
    authSessionId: 'session-2',
    ...overrides,
  });

  it('disconnects when the handshake has no token', async () => {
    const { gateway } = createGateway();
    const client = socket();

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects when AuthService rejects an invalid token', async () => {
    const { authService, gateway } = createGateway();
    authService.verifyAccessToken.mockRejectedValue(new Error('invalid token'));
    const client = socket({ token: 'invalid-token' });

    await gateway.handleConnection(client as never);

    expect(authService.verifyAccessToken).toHaveBeenCalledWith('invalid-token');
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a user who must change password', async () => {
    const { authService, gateway } = createGateway();
    authService.verifyAccessToken.mockResolvedValue(
      admin({ mustChangePassword: true }),
    );
    const client = socket({ token: 'access-token' });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('does not let an admin without fleet.view join any fleet room', async () => {
    const { authService, gateway } = createGateway();
    authService.verifyAccessToken.mockResolvedValue(admin({ permissions: [] }));
    const client = socket({ token: 'access-token' });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins an admin to either the requested origin or global fleet room', async () => {
    const first = createGateway();
    first.authService.verifyAccessToken.mockResolvedValue(admin());
    const originClient = socket({
      token: 'access-token',
      originLocationId: 'origin-1',
    });
    await first.gateway.handleConnection(originClient as never);
    expect(originClient.join).toHaveBeenCalledWith(fleetOriginRoom('origin-1'));
    expect(originClient.join).not.toHaveBeenCalledWith(FLEET_ADMIN_ROOM);

    const second = createGateway();
    second.authService.verifyAccessToken.mockResolvedValue(admin());
    const globalClient = socket({ token: 'access-token' });
    await second.gateway.handleConnection(globalClient as never);
    expect(globalClient.join).toHaveBeenCalledWith(FLEET_ADMIN_ROOM);
  });

  it('derives driver route rooms from the authenticated driver, not handshake routeId', async () => {
    const { authService, gateway, prisma } = createGateway();
    authService.verifyAccessToken.mockResolvedValue(driver());
    prisma.deliveryRoute.findMany.mockResolvedValue([
      { id: 'route-1', originLocationId: 'origin-1' },
      { id: 'route-2', originLocationId: null },
    ]);
    const client = socket({
      token: 'access-token',
      routeId: 'route-belonging-to-someone-else',
    });

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith(fleetDriverRoom('driver-1'));
    expect(client.join).toHaveBeenCalledWith(fleetRouteRoom('route-1'));
    expect(client.join).toHaveBeenCalledWith(fleetRouteRoom('route-2'));
    expect(client.join).not.toHaveBeenCalledWith(fleetOriginRoom('origin-1'));
    expect(client.join).not.toHaveBeenCalledWith(
      fleetRouteRoom('route-belonging-to-someone-else'),
    );
    expect(prisma.deliveryRoute.findMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        status: {
          in: [DeliveryRouteStatus.PENDING, DeliveryRouteStatus.IN_PROGRESS],
        },
      },
      select: { id: true },
    });
  });

  it('disconnects tracked sockets after session revocation notification', async () => {
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue(admin()),
    };
    const prisma = { deliveryRoute: { findMany: jest.fn() } };
    const registry = new SessionRevocationRegistry();
    const gateway = new FleetGateway(
      authService as never,
      prisma as never,
      registry,
    );
    const client = socket({ token: 'access-token' });

    await gateway.handleConnection(client as never);
    registry.notify(['admin-1']);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits position.updated to admin, origin, and route rooms', () => {
    const { emit, gateway, server } = createGateway();
    const payload = {
      vehicleId: 'vehicle-1',
      vehicleCode: 'UNIDAD-01',
      routeId: 'route-1',
      driverId: 'driver-1',
      originLocationId: 'origin-1',
      latitude: 19.1738,
      longitude: -96.1342,
      accuracyMeters: 12.5,
      speedKph: 32.2,
      headingDegrees: 185,
      recordedAt: '2026-08-12T16:00:00.000Z',
    };

    gateway.emitPositionUpdated(payload);

    expect(server.to).toHaveBeenNthCalledWith(1, FLEET_ADMIN_ROOM);
    expect(server.to).toHaveBeenNthCalledWith(2, fleetOriginRoom('origin-1'));
    expect(server.to).toHaveBeenNthCalledWith(3, fleetRouteRoom('route-1'));
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith(FLEET_POSITION_UPDATED_EVENT, payload);
  });

  it('emits geofence transitions to global, origin, and route rooms with the persisted payload', () => {
    const { emit, gateway, server } = createGateway();
    const payload = {
      eventId: 'event-1',
      type: 'ENTER' as const,
      zoneId: 'zone-1',
      zoneName: 'Zona Norte',
      vehicleId: 'vehicle-1',
      vehicleCode: 'UNIDAD-01',
      routeId: 'route-1',
      latitude: 19.1738,
      longitude: -96.1342,
      occurredAt: '2026-08-12T16:00:00.000Z',
    };

    gateway.emitGeofenceEntered(payload, 'origin-1');

    expect(server.to).toHaveBeenNthCalledWith(1, FLEET_ADMIN_ROOM);
    expect(server.to).toHaveBeenNthCalledWith(2, fleetOriginRoom('origin-1'));
    expect(server.to).toHaveBeenNthCalledWith(3, fleetRouteRoom('route-1'));
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith(FLEET_GEOFENCE_ENTERED_EVENT, payload);
  });

  it('emits incident.created to global, origin, and route rooms without evidence payloads', () => {
    const { emit, gateway, server } = createGateway();
    const payload = {
      incidentId: 'incident-1',
      deliveryOrderId: 'order-1',
      routeId: 'route-1',
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      status: 'OPEN' as const,
      reason: 'Cliente no localizado',
      occurredAt: '2026-08-12T16:00:00.000Z',
      position: { latitude: 19.1738, longitude: -96.1342 },
      stop: null,
    };

    gateway.emitIncidentCreated(payload, 'origin-1');

    expect(server.to).toHaveBeenNthCalledWith(1, FLEET_ADMIN_ROOM);
    expect(server.to).toHaveBeenNthCalledWith(2, fleetOriginRoom('origin-1'));
    expect(server.to).toHaveBeenNthCalledWith(3, fleetRouteRoom('route-1'));
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith(FLEET_INCIDENT_CREATED_EVENT, payload);
  });
});
