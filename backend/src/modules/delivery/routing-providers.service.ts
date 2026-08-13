import { Inject, Injectable } from '@nestjs/common';
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from '../geospatial/contracts/geocoding-provider';
import {
  ROUTE_OPTIMIZATION_PROVIDER,
  type RouteOptimizationProvider,
} from '../geospatial/contracts/route-optimization-provider';
import {
  ROUTING_PROVIDER,
  type RoutingProvider,
} from '../geospatial/contracts/routing-provider';
import type { Coordinates } from '../geospatial/contracts/geospatial.types';

type Coordinate = [number, number];
type Stop = { saleId: string; longitude: number; latitude: number };

@Injectable()
export class RoutingProvidersService {
  constructor(
    @Inject(GEOCODING_PROVIDER)
    private readonly geocodingProvider: GeocodingProvider,
    @Inject(ROUTING_PROVIDER)
    private readonly routingProvider: RoutingProvider,
    @Inject(ROUTE_OPTIMIZATION_PROVIDER)
    private readonly routeOptimizationProvider: RouteOptimizationProvider,
  ) {}

  async searchAddress(
    query: string,
    limit = 5,
    latitude?: number,
    longitude?: number,
  ) {
    return this.geocodingProvider.search({
      query,
      limit,
      proximity:
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude }
          : undefined,
    });
  }

  async reverseAddress(latitude: number, longitude: number) {
    return this.geocodingProvider.reverse({
      latitude,
      longitude,
    });
  }

  async optimizeStops(origin: Coordinate, stops: Stop[]) {
    const result = await this.routeOptimizationProvider.optimize({
      origin: this.toCoordinates(origin),
      stops: stops.map((stop) => ({
        id: stop.saleId,
        coordinates: { latitude: stop.latitude, longitude: stop.longitude },
      })),
    });
    return result.map((stop) => ({ saleId: stop.id, sequence: stop.sequence }));
  }

  async buildRoute(coordinates: Coordinate[]) {
    return this.routingProvider.buildRoute(
      coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    );
  }

  private toCoordinates([longitude, latitude]: Coordinate): Coordinates {
    return { latitude, longitude };
  }
}
