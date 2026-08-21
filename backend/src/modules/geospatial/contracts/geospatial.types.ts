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

export type NavigationManeuverType =
  | 'DEPART'
  | 'ARRIVE'
  | 'CONTINUE'
  | 'TURN'
  | 'NEW_NAME'
  | 'MERGE'
  | 'ON_RAMP'
  | 'OFF_RAMP'
  | 'FORK'
  | 'END_OF_ROAD'
  | 'ROUNDABOUT'
  | 'ROUNDABOUT_TURN'
  | 'ROTARY'
  | 'EXIT_ROUNDABOUT'
  | 'EXIT_ROTARY'
  | 'NOTIFICATION'
  | 'UNKNOWN';

export type NavigationManeuverModifier =
  | 'UTURN'
  | 'SHARP_RIGHT'
  | 'RIGHT'
  | 'SLIGHT_RIGHT'
  | 'STRAIGHT'
  | 'SLIGHT_LEFT'
  | 'LEFT'
  | 'SHARP_LEFT'
  | null;

export type NavigationRouteStep = {
  distanceMeters: number;
  durationSeconds: number;
  streetName: string | null;
  maneuver: {
    type: NavigationManeuverType;
    modifier: NavigationManeuverModifier;
    location: Coordinates;
    bearingBefore: number | null;
    bearingAfter: number | null;
    exit: number | null;
  };
};

export type RoutingOptions = {
  includeSteps?: boolean;
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
  steps?: NavigationRouteStep[];
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
