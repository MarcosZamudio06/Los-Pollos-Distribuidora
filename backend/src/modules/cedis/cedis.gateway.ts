import { Logger, Optional } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CEDIS_ADMIN_ROOM,
  CEDIS_GATEWAY_NAMESPACE,
  CEDIS_GATEWAY_PATH,
  CEDIS_SUPPLY_CREATED_EVENT,
  cedisLocationRoom,
  type CedisClientToServerEvents,
  type CedisServerToClientEvents,
  type CedisSupplyCreatedPayload,
} from './cedis-realtime.types';

type CedisSocket = Socket<CedisClientToServerEvents, CedisServerToClientEvents>;

type HandshakeAuth = {
  locationId?: unknown;
  token?: unknown;
};

@WebSocketGateway({
  namespace: CEDIS_GATEWAY_NAMESPACE,
  path: CEDIS_GATEWAY_PATH,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
})
export class CedisGateway {
  private readonly logger = new Logger(CedisGateway.name);
  private readonly socketsByUser = new Map<string, Set<CedisSocket>>();

  @WebSocketServer()
  server!: Server<CedisClientToServerEvents, CedisServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    @Optional() sessionRevocationRegistry?: SessionRevocationRegistry,
  ) {
    sessionRevocationRegistry?.subscribe((userIds) => {
      for (const userId of userIds) this.disconnectUser(userId);
    });
  }

  async handleConnection(socket: CedisSocket): Promise<void> {
    try {
      const { locationId, token } = socket.handshake.auth as HandshakeAuth;
      if (
        typeof token !== 'string' ||
        typeof locationId !== 'string' ||
        !locationId.trim()
      ) {
        throw new Error('Missing socket authentication');
      }

      const user = await this.authService.verifyAccessToken(token);
      await this.assertLocationAccess(user, locationId);
      await socket.join(cedisLocationRoom(locationId));
      if (user.role === 'ADMIN') await socket.join(CEDIS_ADMIN_ROOM);

      const sockets = this.socketsByUser.get(user.id) ?? new Set<CedisSocket>();
      sockets.add(socket);
      this.socketsByUser.set(user.id, sockets);
      socket.once('disconnect', () => {
        const current = this.socketsByUser.get(user.id);
        current?.delete(socket);
        if (current?.size === 0) this.socketsByUser.delete(user.id);
      });
    } catch (error) {
      this.logger.warn(
        `Rejected CEDIS socket connection: ${error instanceof Error ? error.message : 'unknown reason'}`,
      );
      socket.disconnect(true);
    }
  }

  emitSupplyCreated(supply: CedisSupplyCreatedPayload): void {
    this.server
      .to(cedisLocationRoom(supply.origin.id))
      .emit(CEDIS_SUPPLY_CREATED_EVENT, supply);
    this.server
      .to(cedisLocationRoom(supply.destination.id))
      .emit(CEDIS_SUPPLY_CREATED_EVENT, supply);
    this.server.to(CEDIS_ADMIN_ROOM).emit(CEDIS_SUPPLY_CREATED_EVENT, supply);
  }

  private disconnectUser(userId: string): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    for (const socket of sockets) socket.disconnect(true);
    this.socketsByUser.delete(userId);
  }

  private async assertLocationAccess(
    user: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    if (
      user.mustChangePassword ||
      !['ADMIN', 'SELLER', 'WAREHOUSE'].includes(user.role)
    ) {
      throw new Error('Unauthorized CEDIS role');
    }
    if (!user.permissions?.includes(PERMISSIONS.CEDIS_RECEIVE_SUPPLIES)) {
      throw new Error('Missing CEDIS supply receipt permission');
    }

    const location = await this.prisma.operationalLocation.findUnique({
      where: { id: locationId },
      select: { id: true, type: true, isActive: true },
    });
    if (!location?.isActive) throw new Error('Operational location not found');

    if (user.role === 'ADMIN') return;
    if (
      user.role === 'SELLER' &&
      user.operationalLocationId === locationId &&
      location.type === 'BRANCH'
    ) {
      return;
    }
    if (
      user.role === 'WAREHOUSE' &&
      user.operationalLocationId === locationId &&
      location.type === 'DISTRIBUTION_CENTER'
    ) {
      return;
    }
    throw new Error('Location is not assigned to user');
  }
}
