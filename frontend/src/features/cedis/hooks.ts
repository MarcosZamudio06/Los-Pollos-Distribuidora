import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../auth";
import { cedisQueryKeys } from "./queryKeys";
import { cedisService } from "./cedisService";
import type {
  CedisBranchHistoryFilters,
  CedisCycleCommand,
  CedisDashboardFilters,
  CedisRefreshCommand,
} from "./types";

const CEDIS_REFRESH_INTERVAL_MS = 60_000;
const CEDIS_LOCATIONS_STALE_TIME_MS = 5 * 60_000;

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function useCedisLocations(enabled = true) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && enabled),
    queryKey: cedisQueryKeys.locations("distribution-centers"),
    queryFn: () =>
      cedisService.listLocations(
        { isActive: true, limit: 100, page: 1, type: "DISTRIBUTION_CENTER" },
        accessToken,
      ),
    staleTime: CEDIS_LOCATIONS_STALE_TIME_MS,
  });
}

export function useOperationalLocation(
  locationId: string | undefined,
  enabled = true,
) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && locationId && enabled),
    queryKey: cedisQueryKeys.location(locationId ?? "disabled"),
    queryFn: () => cedisService.getLocation(locationId as string, accessToken),
    staleTime: CEDIS_LOCATIONS_STALE_TIME_MS,
  });
}

export function useCedisDashboard(filters: CedisDashboardFilters | null) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(
      accessToken && filters?.cedisLocationId && filters.businessDate,
    ),
    placeholderData: keepPreviousData,
    queryKey: cedisQueryKeys.dashboard(filters),
    queryFn: () => {
      if (!filters) throw new Error("CEDIS dashboard filters are required");
      return cedisService.getDashboard(filters, accessToken);
    },
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

export function useCedisBranchHistory(
  branchId: string | undefined,
  filters: CedisBranchHistoryFilters,
) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && branchId),
    placeholderData: keepPreviousData,
    queryKey: cedisQueryKeys.branchHistory(branchId ?? "disabled", filters),
    queryFn: () =>
      cedisService.getBranchHistory(branchId as string, filters, accessToken),
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

export function useCedisCycleSummary(cycleId: string | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && cycleId),
    queryKey: cedisQueryKeys.cycleSummary(cycleId ?? "disabled"),
    queryFn: () =>
      cedisService.getCycleSummary(cycleId as string, accessToken),
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

async function invalidateCedisDependencies(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: cedisQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["inventory-balances"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
    queryClient.invalidateQueries({ queryKey: ["daily-close"] }),
    queryClient.invalidateQueries({ queryKey: ["reports"] }),
  ]);
}

export function useCreateCedisSupply(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("supply"),
    mutationFn: (payload: CedisCycleCommand) =>
      cedisService.createSupply(
        cycleId,
        payload,
        accessToken,
        idempotencyKey(),
      ),
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useCreateCedisReturn(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("return"),
    mutationFn: (payload: CedisCycleCommand) =>
      cedisService.createReturn(
        cycleId,
        payload,
        accessToken,
        idempotencyKey(),
      ),
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useRefreshCedisCycle(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("refresh"),
    mutationFn: (payload: CedisRefreshCommand) =>
      cedisService.refreshCycle(
        cycleId,
        payload,
        accessToken,
        idempotencyKey(),
      ),
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}
