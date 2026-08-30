import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GEOCODING_PROVIDER } from './contracts/geocoding-provider';
import { ROUTE_OPTIMIZATION_PROVIDER } from './contracts/route-optimization-provider';
import { ROUTING_PROVIDER } from './contracts/routing-provider';
import { OsrmRoutingProvider } from './providers/osrm-routing.provider';
import { PhotonGeocodingProvider } from './providers/photon-geocoding.provider';
import { VroomRouteOptimizationProvider } from './providers/vroom-route-optimization.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    PhotonGeocodingProvider,
    OsrmRoutingProvider,
    VroomRouteOptimizationProvider,
    { provide: GEOCODING_PROVIDER, useExisting: PhotonGeocodingProvider },
    { provide: ROUTING_PROVIDER, useExisting: OsrmRoutingProvider },
    {
      provide: ROUTE_OPTIMIZATION_PROVIDER,
      useExisting: VroomRouteOptimizationProvider,
    },
  ],
  exports: [GEOCODING_PROVIDER, ROUTING_PROVIDER, ROUTE_OPTIMIZATION_PROVIDER],
})
export class GeospatialModule {}
