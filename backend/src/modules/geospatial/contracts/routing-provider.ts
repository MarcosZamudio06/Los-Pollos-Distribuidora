import type {
  Coordinates,
  RoutingOptions,
  RoutingResult,
} from './geospatial.types';

export type {
  Coordinates,
  GeoJsonGeometry,
  NavigationManeuverModifier,
  NavigationManeuverType,
  NavigationRouteStep,
  RouteLeg,
  RoutingOptions,
  RoutingResult,
} from './geospatial.types';

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

export interface RoutingProvider {
  buildRoute(
    points: Coordinates[],
    options?: RoutingOptions,
  ): Promise<RoutingResult>;
}
