import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { RouteSettlementsController } from './route-settlements.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryController, DeliveryOrdersController, RouteSettlementsController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
