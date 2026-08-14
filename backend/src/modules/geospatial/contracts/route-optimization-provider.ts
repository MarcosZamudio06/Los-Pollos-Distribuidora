import type { OptimizationInput, OptimizedStop } from './geospatial.types';

export type {
  OptimizationInput,
  OptimizationStop,
  OptimizedStop,
} from './geospatial.types';

export const ROUTE_OPTIMIZATION_PROVIDER = Symbol(
  'ROUTE_OPTIMIZATION_PROVIDER',
);

export interface RouteOptimizationProvider {
  optimize(input: OptimizationInput): Promise<OptimizedStop[]>;
}
