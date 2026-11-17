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
  CEDIS_SUPPLY_RECEIVED_EVENT,
  type CedisSupplyReceivedPayload,
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
})
export class CedisGateway {
  @WebSocketServer()
  server!: Server<CedisClientToServerEvents, CedisServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionRevocationRegistry,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authorize(socket as CedisSocket).then(
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

  async handleConnection(socket: CedisSocket): Promise<void> {
    if (this.sessions.isTracked(socket)) return;
    try {
      await this.authorize(socket);
    } catch {
      socket.disconnect(true);
    }
  }

  private async authorize(socket: CedisSocket): Promise<void> {
    const auth = socket.handshake?.auth as HandshakeAuth;
    if (typeof auth?.token !== 'string' || !auth.token.trim())
      throw new Error('Missing socket authentication');
    await this.sessions.authorize(
      socket,
      () => this.authService.verifyRealtimeSession(auth.token as string),
      async (user) => {
        if (typeof auth.locationId !== 'string' || !auth.locationId.trim())
          throw new Error('Missing socket authentication');
        await this.assertLocationAccess(user, auth.locationId);
        return [
          cedisLocationRoom(auth.locationId),
          ...(user.role === 'ADMIN' ? [CEDIS_ADMIN_ROOM] : []),
        ];
      },
    );
  }

  emitSupplyCreated(supply: CedisSupplyCreatedPayload): void {
    this.sessions.pruneExpired();
    this.server
      .to([
        cedisLocationRoom(supply.origin.id),
        cedisLocationRoom(supply.destination.id),
        CEDIS_ADMIN_ROOM,
      ])
      .emit(CEDIS_SUPPLY_CREATED_EVENT, supply);
  }

  emitSupplyReceived(supply: CedisSupplyReceivedPayload): void {
    this.sessions.pruneExpired();
    this.server
      .to([
        cedisLocationRoom(supply.origin.id),
        cedisLocationRoom(supply.destination.id),
        CEDIS_ADMIN_ROOM,
      ])
      .emit(CEDIS_SUPPLY_RECEIVED_EVENT, supply);
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
