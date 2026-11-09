import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  SALE_CREATED_EVENT,
  SALES_GATEWAY_NAMESPACE,
  SALES_GATEWAY_PATH,
  type SaleOrderPayload,
  type SalesClientToServerEvents,
  type SalesServerToClientEvents,
  salesLocationRoom,
} from './sales-realtime.types';

type SalesSocket = Socket<SalesClientToServerEvents, SalesServerToClientEvents>;

type HandshakeAuth = {
  locationId?: unknown;
  token?: unknown;
};

@WebSocketGateway({
  namespace: SALES_GATEWAY_NAMESPACE,
  path: SALES_GATEWAY_PATH,
})
export class SalesGateway {
  @WebSocketServer()
  server!: Server<SalesClientToServerEvents, SalesServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionRevocationRegistry,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authorize(socket as SalesSocket).then(
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

  async handleConnection(socket: SalesSocket): Promise<void> {
    if (this.sessions.isTracked(socket)) return;
    try {
      await this.authorize(socket);
    } catch {
      socket.disconnect(true);
    }
  }

  private async authorize(socket: SalesSocket): Promise<void> {
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
        return [salesLocationRoom(auth.locationId)];
      },
    );
  }

  emitSaleCreated(order: SaleOrderPayload): void {
    this.sessions.pruneExpired();
    this.server
      .to(salesLocationRoom(order.location.id))
      .emit(SALE_CREATED_EVENT, order);
  }

  private async assertLocationAccess(
    user: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    if (user.mustChangePassword || !['ADMIN', 'SELLER'].includes(user.role)) {
      throw new Error('Unauthorized sales role');
    }

    if (user.role === 'SELLER' && user.operationalLocationId !== locationId) {
      throw new Error('Location is not assigned to seller');
    }

    const location = await this.prisma.operationalLocation.findUnique({
      where: { id: locationId },
      select: { id: true, isActive: true },
    });
    if (!location?.isActive) throw new Error('Operational location not found');
  }
}
