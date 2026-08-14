import { lazy, Suspense } from "react";
import { MapUnavailableState } from "./MapUnavailableState";
import type { MapCanvasProps } from "./types";

const MapLibreCanvas = lazy(() => import("./MapLibreCanvas"));

export function LazyMapCanvas(props: MapCanvasProps) {
  if (!props.config.available) {
    return <MapUnavailableState className={props.className} reason="disabled" />;
  }

  return (
    <Suspense
      fallback={
        <MapUnavailableState className={props.className} reason="loading" />
      }
    >
      <MapLibreCanvas {...props} />
    </Suspense>
  );
}
