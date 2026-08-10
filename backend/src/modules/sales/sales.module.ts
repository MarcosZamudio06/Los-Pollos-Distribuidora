import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PointOfSaleDailyCloseModule } from '../point-of-sale-daily-close/point-of-sale-daily-close.module';
import { SalesController } from './sales.controller';
import { SalesGateway } from './sales.gateway';
import { SalesRealtimeService } from './sales-realtime.service';
import { SalesService } from './sales.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    InventoryModule,
    PointOfSaleDailyCloseModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SalesGateway, SalesRealtimeService],
  exports: [SalesService],
})
export class SalesModule {}
