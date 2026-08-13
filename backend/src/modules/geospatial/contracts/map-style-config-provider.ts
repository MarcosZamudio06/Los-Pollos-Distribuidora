import type { Coordinates } from './geospatial.types';

export const MAP_STYLE_CONFIG_PROVIDER = Symbol('MAP_STYLE_CONFIG_PROVIDER');

export type MapClientConfig = {
  renderer: 'maplibre';
  available: boolean;
  styleUrl: string;
  revision: string;
  attribution: Array<{ label: string; url?: string }>;
  defaultViewport: Coordinates & { zoom: number };
  capabilities: {
    geocoding: boolean;
    routing: boolean;
    optimization: boolean;
  };
};

export interface MapStyleConfigProvider {
  getClientConfig(): Promise<MapClientConfig>;
}
