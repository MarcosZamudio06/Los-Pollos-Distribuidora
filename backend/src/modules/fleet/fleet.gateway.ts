import { Logger, Optional } from '@nestjs/common';
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

type DriverRouteRoom = {
  id: string;
};

@WebSocketGateway({
  namespace: FLEET_GATEWAY_NAMESPACE,
  path: FLEET_GATEWAY_PATH,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
})
export class FleetGateway {
  private readonly logger = new Logger(FleetGateway.name);
  private readonly socketsByUser = new Map<string, Set<FleetSocket>>();

  @WebSocketServer()
  server!: Server<FleetClientToServerEvents, FleetServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    @Optional() sessionRevocationRegistry?: SessionRevocationRegistry,
  ) {
    sessionRevocationRegistry?.subscribe((userIds) => {
      for (const userId of userIds) this.disconnectUser(userId);
    });
  }

  async handleConnection(socket: FleetSocket): Promise<void> {
    try {
      const auth = socket.handshake?.auth as HandshakeAuth | undefined;
      if (typeof auth?.token !== 'string' || !auth.token.trim()) {
        throw new Error('Missing socket authentication');
      }

      const user = await this.authService.verifyAccessToken(auth.token);
      this.assertSocketAccess(user);
      const requestedOriginLocationId = this.parseOptionalOrigin(
        auth.originLocationId,
      );

      if (user.role === 'ADMIN') {
        if (requestedOriginLocationId) {
          await socket.join(fleetOriginRoom(requestedOriginLocationId));
        } else {
          await socket.join(FLEET_ADMIN_ROOM);
        }
      } else {
        await this.joinDriverRooms(socket, user.id);
      }

      this.trackSocket(user.id, socket);
    } catch (error) {
      this.logger.warn(
        `Rejected fleet socket connection: ${error instanceof Error ? error.message : 'unknown reason'}`,
      );
      socket.disconnect(true);
    }
  }

  emitPositionUpdated(payload: FleetPositionUpdatedPayload): void {
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

  emitRouteUpdated(payload: FleetRealtimePayload): void {
    this.server.to(FLEET_ADMIN_ROOM).emit(FLEET_ROUTE_UPDATED_EVENT, payload);
  }

  emitIncidentCreated(
    payload: FleetIncidentCreatedPayload,
    originLocationId?: string | null,
  ): void {
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

  private async joinDriverRooms(
    socket: FleetSocket,
    driverId: string,
  ): Promise<void> {
    await socket.join(fleetDriverRoom(driverId));
    const routes = (await this.prisma.deliveryRoute.findMany({
      where: {
        driverId,
        status: {
          in: [DeliveryRouteStatus.PENDING, DeliveryRouteStatus.IN_PROGRESS],
        },
      },
      select: { id: true },
    })) as DriverRouteRoom[] | undefined;

    for (const route of routes ?? []) {
      await socket.join(fleetRouteRoom(route.id));
    }
  }

  private parseOptionalOrigin(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('originLocationId must be a non-empty string');
    }
    return value.trim();
  }

  private trackSocket(userId: string, socket: FleetSocket): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<FleetSocket>();
    sockets.add(socket);
    this.socketsByUser.set(userId, sockets);
    if (typeof socket.once !== 'function') return;

    socket.once('disconnect', () => {
      const current = this.socketsByUser.get(userId);
      current?.delete(socket);
      if (current?.size === 0) this.socketsByUser.delete(userId);
    });
  }

  private disconnectUser(userId: string): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    for (const socket of sockets) socket.disconnect(true);
    this.socketsByUser.delete(userId);
  }
}
