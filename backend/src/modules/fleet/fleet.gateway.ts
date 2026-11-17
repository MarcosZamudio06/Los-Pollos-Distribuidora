import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { DeliveryRouteStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  FLEET_ADMIN_ROOM,
  FLEET_GEOFENCE_ENTERED_EVENT,
  FLEET_GEOFENCE_EXITED_EVENT,
  FLEET_GATEWAY_NAMESPACE,
  FLEET_GATEWAY_PATH,
  FLEET_INCIDENT_CREATED_EVENT,
  FLEET_POSITION_UPDATED_EVENT,
  FLEET_ROUTE_UPDATED_EVENT,
  fleetDriverRoom,
  fleetOriginRoom,
  fleetRouteRoom,
  type FleetGeofenceEventPayload,
  type FleetIncidentCreatedPayload,
  type FleetClientToServerEvents,
  type FleetPositionUpdatedPayload,
  type FleetRealtimePayload,
  type FleetServerToClientEvents,
} from './fleet-realtime.types';

type FleetSocket = Socket<FleetClientToServerEvents, FleetServerToClientEvents>;

type HandshakeAuth = {
  token?: unknown;
  originLocationId?: unknown;
};

@WebSocketGateway({
  namespace: FLEET_GATEWAY_NAMESPACE,
  path: FLEET_GATEWAY_PATH,
})
export class FleetGateway {
  @WebSocketServer()
  server!: Server<FleetClientToServerEvents, FleetServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionRevocationRegistry,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authorize(socket as FleetSocket).then(
        () =>
          next(
            this.sessions.isTracked(socket)
              ? undefined
              : new Error('Unauthorized socket session'),
          ),
        () => next(new Error('Unauthorized socket session')),
      );
    });
  }

  async handleConnection(socket: FleetSocket): Promise<void> {
    if (this.sessions.isTracked(socket)) return;
    try {
      await this.authorize(socket);
    } catch {
      socket.disconnect(true);
    }
  }

  private async authorize(socket: FleetSocket): Promise<void> {
    const auth = socket.handshake?.auth as HandshakeAuth;
    if (typeof auth?.token !== 'string' || !auth.token.trim())
      throw new Error('Missing socket authentication');
    await this.sessions.authorize(
      socket,
      () => this.authService.verifyRealtimeSession(auth.token as string),
      async (user) => {
        this.assertSocketAccess(user);
        const origin = this.parseOptionalOrigin(auth.originLocationId);
        if (user.role === 'ADMIN')
          return [origin ? fleetOriginRoom(origin) : FLEET_ADMIN_ROOM];
        const routes = await this.prisma.deliveryRoute.findMany({
          where: {
            driverId: user.id,
            status: {
              in: [
                DeliveryRouteStatus.PENDING,
                DeliveryRouteStatus.IN_PROGRESS,
              ],
            },
          },
          select: { id: true },
        });
        return [
          fleetDriverRoom(user.id),
          ...(routes ?? []).map((route) => fleetRouteRoom(route.id)),
        ];
      },
    );
  }

  emitPositionUpdated(payload: FleetPositionUpdatedPayload): void {
    this.sessions.pruneExpired();
    this.server
      .to(FLEET_ADMIN_ROOM)
      .emit(FLEET_POSITION_UPDATED_EVENT, payload);
    if (payload.originLocationId) {
      this.server
        .to(fleetOriginRoom(payload.originLocationId))
        .emit(FLEET_POSITION_UPDATED_EVENT, payload);
    }
    this.server
      .to(fleetRouteRoom(payload.routeId))
      .emit(FLEET_POSITION_UPDATED_EVENT, payload);
  }

  emitRouteUpdated(
    payload: FleetRealtimePayload,
    originLocationId?: string | null,
    driverId?: string | null,
  ): void {
    this.sessions.pruneExpired();
    const rooms: string[] = [FLEET_ADMIN_ROOM];
    if (originLocationId) rooms.push(fleetOriginRoom(originLocationId));
    if (driverId) rooms.push(fleetDriverRoom(driverId));
    // A union delivers once, even when a client belongs to multiple authorized rooms.
    this.server.to(rooms).emit(FLEET_ROUTE_UPDATED_EVENT, payload);
  }

  emitIncidentCreated(
    payload: FleetIncidentCreatedPayload,
    originLocationId?: string | null,
  ): void {
    this.sessions.pruneExpired();
    this.server
      .to(FLEET_ADMIN_ROOM)
      .emit(FLEET_INCIDENT_CREATED_EVENT, payload);
    if (originLocationId) {
      this.server
        .to(fleetOriginRoom(originLocationId))
        .emit(FLEET_INCIDENT_CREATED_EVENT, payload);
    }
    this.server
      .to(fleetRouteRoom(payload.routeId))
      .emit(FLEET_INCIDENT_CREATED_EVENT, payload);
  }

  emitGeofenceEntered(
    payload: FleetGeofenceEventPayload,
    originLocationId?: string | null,
  ): void {
    this.sessions.pruneExpired();
    this.server
      .to(FLEET_ADMIN_ROOM)
      .emit(FLEET_GEOFENCE_ENTERED_EVENT, payload);
    if (originLocationId) {
      this.server
        .to(fleetOriginRoom(originLocationId))
        .emit(FLEET_GEOFENCE_ENTERED_EVENT, payload);
    }
    this.server
      .to(fleetRouteRoom(payload.routeId))
      .emit(FLEET_GEOFENCE_ENTERED_EVENT, payload);
  }

  emitGeofenceExited(
    payload: FleetGeofenceEventPayload,
    originLocationId?: string | null,
  ): void {
    this.sessions.pruneExpired();
    this.server.to(FLEET_ADMIN_ROOM).emit(FLEET_GEOFENCE_EXITED_EVENT, payload);
    if (originLocationId) {
      this.server
        .to(fleetOriginRoom(originLocationId))
        .emit(FLEET_GEOFENCE_EXITED_EVENT, payload);
    }
    this.server
      .to(fleetRouteRoom(payload.routeId))
      .emit(FLEET_GEOFENCE_EXITED_EVENT, payload);
  }

  private assertSocketAccess(user: AuthenticatedPrincipal): void {
    if (user.mustChangePassword) {
      throw new Error('Password change is required');
    }
    if (user.role === 'ADMIN') {
      if (!user.permissions?.includes(PERMISSIONS.FLEET_VIEW)) {
        throw new Error('Fleet view permission is required');
      }
      return;
    }
    if (user.role !== 'DRIVER') {
      throw new Error('Unauthorized fleet role');
    }
  }

  private parseOptionalOrigin(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('originLocationId must be a non-empty string');
    }
    return value.trim();
  }
}
