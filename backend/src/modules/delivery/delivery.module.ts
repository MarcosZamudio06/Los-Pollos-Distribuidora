import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
<<<<<<< HEAD
import { FleetModule } from '../fleet/fleet.module';
=======
import { GeospatialModule } from '../geospatial/geospatial.module';
>>>>>>> 2bc79e07 (Blocker de fase 6 pendiente a revisión)
import { InventoryModule } from '../inventory/inventory.module';
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
import { VehicleController } from './vehicle.controller';
import { VehicleService } from './vehicle.service';

@Module({
<<<<<<< HEAD
  imports: [AuthModule, ConfigModule, FleetModule, InventoryModule],
=======
  imports: [AuthModule, ConfigModule, InventoryModule, GeospatialModule],
>>>>>>> 2bc79e07 (Blocker de fase 6 pendiente a revisión)
  controllers: [
    DeliveryController,
    DeliveryOrdersController,
    RouteSettlementsController,
    DeliveryRoutePlanningController,
    GeocodingController,
    RoutingTechnicalStatusController,
    VehicleController,
  ],
  providers: [
    DeliveryService,
    DeliveryRoutePlanningService,
    RoutingProvidersService,
    RoutingTechnicalStatusService,
    VehicleService,
  ],
  exports: [DeliveryService, VehicleService],
})
export class DeliveryModule {}
