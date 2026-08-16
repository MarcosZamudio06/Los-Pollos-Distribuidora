import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FleetController } from './fleet.controller';
import { DeliveryZoneController } from './delivery-zone.controller';
import { FleetGateway } from './fleet.gateway';
import { FleetService } from './fleet.service';
import { FleetPositionRetentionJob } from './fleet-position-retention.job';
import { GeofenceService } from './geofence.service';
import { NullTrafficProvider } from './traffic/null-traffic.provider';
import { TRAFFIC_PROVIDER } from './traffic/traffic-provider';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule],
  controllers: [FleetController, DeliveryZoneController],
  providers: [
    FleetService,
    FleetPositionRetentionJob,
    FleetGateway,
    GeofenceService,
    { provide: TRAFFIC_PROVIDER, useClass: NullTrafficProvider },
  ],
  exports: [FleetService, FleetGateway, GeofenceService, TRAFFIC_PROVIDER],
})
export class FleetModule {}
