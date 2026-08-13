import { useMemo } from "react";
import {
  resolveMapClientConfig,
} from "../../lib/maps/mapClientConfig";
import { runtimeMapConfig } from "../../lib/maps/mapConfig";

export function useMapClientConfig(enabled = true) {
  return useMemo(() => {
    if (!enabled) {
      return {
        data: null,
        error: null,
        isError: false,
        isLoading: false,
      } as const;
    }

    try {
      return {
        data: resolveMapClientConfig(runtimeMapConfig),
        error: null,
        isError: false,
        isLoading: false,
      } as const;
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Map configuration is invalid."),
        isError: true,
        isLoading: false,
      } as const;
    }
  }, [enabled]);
}
