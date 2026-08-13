import type { StyleSpecification } from "maplibre-gl";

export type MapEnvironment = "development" | "test" | "production";

export type MapConfig = Readonly<{
  mode: string;
  styleUrl?: string;
}>;

export type ResolvedMapStyle = StyleSpecification | string;
