import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryController, DeliveryOrdersController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
