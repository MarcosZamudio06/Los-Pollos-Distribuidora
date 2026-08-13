import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { mapsService } from "./mapsService";

export const mapsQueryKeys = {
  all: ["maps"] as const,
  config: () => ["maps", "config"] as const,
};

const MAPS_CONFIG_STALE_TIME_MS = 5 * 60_000;

export function useMapsConfig(enabled = true) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && enabled),
    queryKey: mapsQueryKeys.config(),
    queryFn: ({ signal }) => mapsService.getConfig(accessToken, signal),
    staleTime: MAPS_CONFIG_STALE_TIME_MS,
  });
}
