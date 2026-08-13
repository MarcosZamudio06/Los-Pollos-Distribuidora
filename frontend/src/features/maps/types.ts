export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

export type MapViewport = MapCoordinates & {
  zoom: number;
};

export type MapAttribution = {
  label: string;
  url?: string;
};

export type MapCapabilities = {
  geocoding: boolean;
  routing: boolean;
  optimization: boolean;
};

export type MapClientConfig = {
  renderer: "maplibre";
  available: boolean;
  styleUrl: string;
  revision: string;
  attribution: MapAttribution[];
  defaultViewport: MapViewport;
  capabilities: MapCapabilities;
};

export type MapLibrePoint = [longitude: number, latitude: number];

export type MapMarkerProps = {
  coordinates: MapCoordinates;
  draggable?: boolean;
  onDragEnd?: (coordinates: MapCoordinates) => void;
};

export type MapGeocodingResult = MapCoordinates & {
  label: string;
  osmType?: string | null;
  osmId?: string | null;
};

export type MapGeocodingRequestOptions = {
  signal?: AbortSignal;
  latitude?: number;
  longitude?: number;
  limit?: number;
};

export type MapGeocodingClient = {
  search: (
    query: string,
    options?: MapGeocodingRequestOptions,
  ) => Promise<MapGeocodingResult[]>;
  reverse: (
    coordinates: MapCoordinates,
    options?: Pick<MapGeocodingRequestOptions, "signal">,
  ) => Promise<MapGeocodingResult>;
};

export type MapErrorKind =
  | "webgl"
  | "style"
  | "tiles"
  | "glyphs"
  | "sprites"
  | "runtime";

export type MapCanvasError = {
  kind: MapErrorKind;
  message: string;
};

export type MapUnavailableReason = MapErrorKind | "config" | "disabled" | "loading";

export type MapCanvasProps = {
  config: MapClientConfig;
  initialCoordinates?: MapCoordinates;
  marker?: MapMarkerProps;
  onCoordinateChange?: (coordinates: MapCoordinates) => void;
  onError?: (error: MapCanvasError) => void;
  className?: string;
  ariaLabel?: string;
};

export function toMapLibrePoint({
  latitude,
  longitude,
}: MapCoordinates): MapLibrePoint {
  return [longitude, latitude];
}
