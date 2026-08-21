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
  NavigationManeuverModifier,
  NavigationManeuverType,
  NavigationRouteStep,
  RoutingOptions,
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
    legs?: Array<{
      distance?: number;
      duration?: number;
      steps?: OsrmStep[];
    }>;
  }>;
};

type OsrmStep = {
  distance?: number;
  duration?: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: unknown;
    bearing_before?: number;
    bearing_after?: number;
    exit?: number;
  };
};

const MANEUVER_TYPES = new Set<NavigationManeuverType>([
  'DEPART',
  'ARRIVE',
  'CONTINUE',
  'TURN',
  'NEW_NAME',
  'MERGE',
  'ON_RAMP',
  'OFF_RAMP',
  'FORK',
  'END_OF_ROAD',
  'ROUNDABOUT',
  'ROUNDABOUT_TURN',
  'ROTARY',
  'EXIT_ROUNDABOUT',
  'EXIT_ROTARY',
  'NOTIFICATION',
  'UNKNOWN',
]);

const MANEUVER_MODIFIERS = new Set<Exclude<NavigationManeuverModifier, null>>([
  'UTURN',
  'SHARP_RIGHT',
  'RIGHT',
  'SLIGHT_RIGHT',
  'STRAIGHT',
  'SLIGHT_LEFT',
  'LEFT',
  'SHARP_LEFT',
]);

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

  async buildRoute(
    points: Coordinates[],
    options: RoutingOptions = {},
  ): Promise<RoutingResult> {
    const path = points
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(';');
    const url = new URL(`/route/v1/driving/${path}`, this.osrmUrl);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', options.includeSteps ? 'true' : 'false');

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

    const result: RoutingResult = {
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

    if (options.includeSteps) {
      result.steps = (route.legs ?? []).flatMap((leg) =>
        (leg.steps ?? [])
          .map((step) => this.normalizeStep(step))
          .filter((step): step is NavigationRouteStep => step !== null),
      );
    }

    return result;
  }

  private normalizeStep(step: OsrmStep): NavigationRouteStep | null {
    const location = step.maneuver?.location;
    if (
      !Number.isFinite(step.distance) ||
      !Number.isFinite(step.duration) ||
      !Array.isArray(location) ||
      !Number.isFinite(location[0]) ||
      !Number.isFinite(location[1])
    ) {
      return null;
    }

    return {
      distanceMeters: Math.round(step.distance as number),
      durationSeconds: Math.round(step.duration as number),
      streetName: step.name?.trim() || null,
      maneuver: {
        type: this.normalizeManeuverType(step.maneuver?.type),
        modifier: this.normalizeManeuverModifier(step.maneuver?.modifier),
        location: {
          latitude: location[1] as number,
          longitude: location[0] as number,
        },
        bearingBefore: this.finiteOrNull(step.maneuver?.bearing_before),
        bearingAfter: this.finiteOrNull(step.maneuver?.bearing_after),
        exit:
          Number.isInteger(step.maneuver?.exit) &&
          (step.maneuver?.exit as number) > 0
            ? (step.maneuver?.exit as number)
            : null,
      },
    };
  }

  private normalizeManeuverType(value?: string): NavigationManeuverType {
    const normalized = this.normalizeToken(value);
    return MANEUVER_TYPES.has(normalized as NavigationManeuverType)
      ? (normalized as NavigationManeuverType)
      : 'UNKNOWN';
  }

  private normalizeManeuverModifier(
    value?: string,
  ): NavigationManeuverModifier {
    const normalized = this.normalizeToken(value);
    return MANEUVER_MODIFIERS.has(
      normalized as Exclude<NavigationManeuverModifier, null>,
    )
      ? (normalized as Exclude<NavigationManeuverModifier, null>)
      : null;
  }

  private normalizeToken(value?: string): string {
    return (
      value
        ?.trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase() ?? ''
    );
  }

  private finiteOrNull(value?: number): number | null {
    return Number.isFinite(value) ? (value as number) : null;
  }
}
