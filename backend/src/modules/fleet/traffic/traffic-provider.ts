export const TRAFFIC_PROVIDER = Symbol('TRAFFIC_PROVIDER');

export type TrafficCoordinate = [number, number];

export type TrafficLineString = {
  type: 'LineString';
  coordinates: TrafficCoordinate[];
};

export type TrafficBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type TrafficCongestionLevel =
  'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export type TrafficSegment = {
  id: string;
  geometry: TrafficLineString;
  congestionLevel: TrafficCongestionLevel;
  observedAt: string;
  source: string;
};

export type TrafficProviderCapabilities = {
  available: boolean;
  provider: string | null;
};

export type TrafficProviderHealth = TrafficProviderCapabilities & {
  status: 'up' | 'down' | 'unavailable';
};

export interface TrafficProvider {
  getTrafficSnapshot(
    bounds: TrafficBounds,
    observedAt: Date,
  ): Promise<readonly TrafficSegment[]>;
  getCapabilities(): Promise<TrafficProviderCapabilities>;
  healthCheck(): Promise<TrafficProviderHealth>;
}
