import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { RouteSettlementsController } from './route-settlements.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryRoutePlanningController } from './delivery-route-planning.controller';
import { DeliveryRoutePlanningService } from './delivery-route-planning.service';
import { GeocodingController } from './geocoding.controller';
import { RoutingProvidersService } from './routing-providers.service';
import { RoutingTechnicalStatusController } from './routing-technical-status.controller';
import { RoutingTechnicalStatusService } from './routing-technical-status.service';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [DeliveryController, DeliveryOrdersController, RouteSettlementsController, DeliveryRoutePlanningController, GeocodingController, RoutingTechnicalStatusController],
  providers: [DeliveryService, DeliveryRoutePlanningService, RoutingProvidersService, RoutingTechnicalStatusService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
