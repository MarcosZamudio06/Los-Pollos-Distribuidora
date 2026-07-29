import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SalesGateway } from './sales.gateway';
import type { SaleOrderPayload } from './sales-realtime.types';

type PersistedOrder = {
  id: string;
  saleNumber: string;
  createdAt: Date;
  total: { toString(): string };
  status: 'CONFIRMED' | 'DRAFT' | 'CANCELLED';
  customer: { id: string; name: string } | null;
  location: { id: string; name: string };
  items: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    unit: 'KG' | 'PIECE' | 'KG_AND_PIECE';
    quantityKg: { toString(): string } | null;
    quantityPieces: number | null;
  }>;
};

@Injectable()
export class SalesRealtimeService {
  private readonly logger = new Logger(SalesRealtimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesGateway: SalesGateway,
  ) {}

  async publishCreated(saleId: string): Promise<void> {
    try {
      const sale = (await this.prisma.sale.findUnique({
        where: { id: saleId },
        include: {
          customer: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              productId: true,
              productNameSnapshot: true,
              unit: true,
              quantityKg: true,
              quantityPieces: true,
            },
          },
        },
      })) as PersistedOrder | null;

      if (!sale || sale.status !== 'CONFIRMED') return;

      this.salesGateway.emitSaleCreated(this.toOrderPayload(sale));
    } catch (error) {
      // The committed sale remains available through REST if real-time delivery fails.
      this.logger.error(
        `Unable to publish sale.created for sale ${saleId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  toOrderPayload(sale: PersistedOrder): SaleOrderPayload {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      createdAt: sale.createdAt.toISOString(),
      location: sale.location,
      customer: sale.customer,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        unit: item.unit,
        quantityKg: item.quantityKg?.toString() ?? null,
        quantityPieces: item.quantityPieces,
      })),
      total: sale.total.toString(),
      status: 'CONFIRMED',
    };
  }
}
