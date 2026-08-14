import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoutingProvider } from '../contracts/routing-provider';
import type {
  Coordinates,
  GeoJsonGeometry,
  RoutingResult,
} from '../contracts/geospatial.types';
import {
  configuredTimeout,
  requestProviderJson,
  requiredProviderUrl,
} from './provider-http';

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    geometry?: GeoJsonGeometry;
    distance?: number;
    duration?: number;
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
};

@Injectable()
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(OsrmRoutingProvider.name);
  private readonly osrmUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.osrmUrl = requiredProviderUrl(config, 'OSRM_URL');
    this.timeoutMs = configuredTimeout(
      config,
      'ROUTING_TIMEOUT_MS',
      'ROUTING_TIMEOUT_MS',
      10000,
    );
  }

  async buildRoute(points: Coordinates[]): Promise<RoutingResult> {
    const path = points
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(';');
    const url = new URL(`/route/v1/driving/${path}`, this.osrmUrl);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'false');

    const payload = await requestProviderJson<OsrmResponse>({
      logger: this.logger,
      provider: 'OSRM',
      operation: 'route',
      unavailableMessage: 'OSRM routing provider is unavailable',
      timeoutMs: this.timeoutMs,
      url,
      resultFor: (response) =>
        response.code === 'Ok' && response.routes?.[0]?.geometry
          ? 'route'
          : 'no_route',
    });
    const route = payload.routes?.[0];
    if (
      payload.code !== 'Ok' ||
      !route?.geometry ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    ) {
      throw new UnprocessableEntityException(
        'OSRM could not build a route for the selected stops',
      );
    }

    return {
      geometry: route.geometry,
      distanceMeters: Math.round(route.distance as number),
      durationSeconds: Math.round(route.duration as number),
      legs: (route.legs ?? [])
        .filter(
          (leg) =>
            Number.isFinite(leg.distance) && Number.isFinite(leg.duration),
        )
        .map((leg) => ({
          distanceMeters: Math.round(leg.distance as number),
          durationSeconds: Math.round(leg.duration as number),
        })),
    };
  }
}
