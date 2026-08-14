import type { Coordinates, RoutingResult } from './geospatial.types';

export type {
  Coordinates,
  GeoJsonGeometry,
  RouteLeg,
  RoutingResult,
} from './geospatial.types';

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

export interface RoutingProvider {
  buildRoute(points: Coordinates[]): Promise<RoutingResult>;
}
