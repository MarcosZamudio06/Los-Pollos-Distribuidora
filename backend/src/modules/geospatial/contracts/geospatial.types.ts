export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type GeocodingResult = Coordinates & {
  label: string;
  osmType?: string | null;
  osmId?: string | null;
};

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
};

export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
  [key: string]: unknown;
};

export type RoutingResult = {
  geometry: GeoJsonGeometry;
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
};

export type OptimizationStop = {
  id: string;
  coordinates: Coordinates;
};

export type OptimizationInput = {
  origin: Coordinates;
  stops: OptimizationStop[];
};

export type OptimizedStop = {
  id: string;
  sequence: number;
};
