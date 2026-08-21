import type {
  DriverNavigationResponse,
  RouteLocationPosition,
} from "../../rutas-reparto/types";
import { useDriverNavigationSession } from "./useDriverNavigationSession";

type UseDriverNavigationOptions = {
  enabled?: boolean;
  position?: RouteLocationPosition | null;
  routeId?: string;
};

export type UseDriverNavigationResult = {
  data: DriverNavigationResponse | null;
  error: unknown;
  isError: boolean;
  isPending: boolean;
};

/** @deprecated Use useDriverNavigationSession for camera and recalculation state. */
export function useDriverNavigation(
  options: UseDriverNavigationOptions,
): UseDriverNavigationResult {
  const session = useDriverNavigationSession(options);
  return {
    data: session.data,
    error: session.error,
    isError: session.isError,
    isPending: session.isRecalculating,
  };
}

