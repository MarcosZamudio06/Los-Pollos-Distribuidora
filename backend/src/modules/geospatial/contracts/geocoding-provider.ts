import type { Coordinates, GeocodingResult } from './geospatial.types';

export type { Coordinates, GeocodingResult } from './geospatial.types';

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

export type GeocodingSearchInput = {
  query: string;
  proximity?: Coordinates;
  limit: number;
};

export interface GeocodingProvider {
  search(input: GeocodingSearchInput): Promise<GeocodingResult[]>;
  reverse(point: Coordinates): Promise<GeocodingResult>;
}
