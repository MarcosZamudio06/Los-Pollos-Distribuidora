import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GEOCODING_PROVIDER } from './contracts/geocoding-provider';
import { MAP_STYLE_CONFIG_PROVIDER } from './contracts/map-style-config-provider';
import { ROUTE_OPTIMIZATION_PROVIDER } from './contracts/route-optimization-provider';
import { ROUTING_PROVIDER } from './contracts/routing-provider';
import { MapConfigController } from './map-config.controller';
import { MapConfigService } from './map-config.service';
import { OsrmRoutingProvider } from './providers/osrm-routing.provider';
import { PhotonGeocodingProvider } from './providers/photon-geocoding.provider';
import { VroomRouteOptimizationProvider } from './providers/vroom-route-optimization.provider';

@Module({
  imports: [ConfigModule],
  controllers: [MapConfigController],
  providers: [
    PhotonGeocodingProvider,
    OsrmRoutingProvider,
    VroomRouteOptimizationProvider,
    MapConfigService,
    { provide: GEOCODING_PROVIDER, useExisting: PhotonGeocodingProvider },
    { provide: ROUTING_PROVIDER, useExisting: OsrmRoutingProvider },
    {
      provide: ROUTE_OPTIMIZATION_PROVIDER,
      useExisting: VroomRouteOptimizationProvider,
    },
    { provide: MAP_STYLE_CONFIG_PROVIDER, useExisting: MapConfigService },
  ],
  exports: [
    GEOCODING_PROVIDER,
    ROUTING_PROVIDER,
    ROUTE_OPTIMIZATION_PROVIDER,
    MAP_STYLE_CONFIG_PROVIDER,
  ],
})
export class GeospatialModule {}
