import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
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
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
})
export class SalesGateway {
  private readonly logger = new Logger(SalesGateway.name);

  @WebSocketServer()
  server!: Server<SalesClientToServerEvents, SalesServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: SalesSocket): Promise<void> {
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
      await socket.join(salesLocationRoom(locationId));
    } catch (error) {
      this.logger.warn(
        `Rejected sales socket connection: ${error instanceof Error ? error.message : 'unknown reason'}`,
      );
      socket.disconnect(true);
    }
  }

  emitSaleCreated(order: SaleOrderPayload): void {
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
