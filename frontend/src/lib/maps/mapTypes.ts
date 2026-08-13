import type { StyleSpecification } from "maplibre-gl";

export type MapEnvironment = "development" | "test" | "production";

export type MapConfig = Readonly<{
  mode: string;
  styleUrl?: string;
}>;

export type ResolvedMapStyle = StyleSpecification | string;

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
