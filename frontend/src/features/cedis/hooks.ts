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
  CedisCancelCycleCommand,
  CedisCloseCycleCommand,
  CedisCycleCommand,
  CedisDashboardFilters,
  CedisIncomingSuppliesFilters,
  CedisReceiveSupplyCommand,
  CedisReturnsFilters,
  CedisMutationInput,
  CedisOpenCycleCommand,
  CedisReopenCycleCommand,
  CedisRefreshCommand,
  CreateBranchLocationPayload,
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

export function useCreateBranchLocation() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("create-branch"),
    mutationFn: (payload: CreateBranchLocationPayload) =>
      cedisService.createLocation(payload, accessToken),
    onSuccess: async (_location, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: cedisQueryKeys.operationalLocations,
        }),
        queryClient.invalidateQueries({
          queryKey: cedisQueryKeys.locations("distribution-centers"),
        }),
        queryClient.invalidateQueries({
          queryKey: cedisQueryKeys.branches(payload.parentId),
        }),
      ]);
    },
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
    queryFn: () => cedisService.getCycleSummary(cycleId as string, accessToken),
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

export function useCedisIncomingSupplies(
  filters: CedisIncomingSuppliesFilters | null,
) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && filters?.businessDate),
    placeholderData: keepPreviousData,
    queryKey: cedisQueryKeys.incomingSupplies(filters ?? { businessDate: "" }),
    queryFn: () => {
      if (!filters) throw new Error("Incoming supply filters are required");
      return cedisService.listIncomingSupplies(filters, accessToken);
    },
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

export function useCedisReturns(filters: CedisReturnsFilters | null) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && filters?.businessDate),
    placeholderData: keepPreviousData,
    queryKey: cedisQueryKeys.returns(filters ?? { businessDate: '' }),
    queryFn: () => {
      if (!filters) throw new Error('CEDIS return filters are required');
      return cedisService.listReturns(filters, accessToken);
    },
    refetchInterval: CEDIS_REFRESH_INTERVAL_MS,
  });
}

export function useCompleteCedisReturn() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations('complete-return'),
    mutationFn: (input: { transferId: string; idempotencyKey?: string }) =>
      cedisService.completeReturn(
        input.transferId,
        accessToken,
        input.idempotencyKey ?? idempotencyKey(),
      ),
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useCedisIncomingSupply(transferId: string | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    enabled: Boolean(accessToken && transferId),
    queryKey: ["cedis", "incoming-supplies", transferId],
    queryFn: () =>
      cedisService.getIncomingSupply(transferId as string, accessToken),
  });
}

export function useCedisLogisticsResources(enabled = true) {
  const { accessToken } = useAuth();
  const drivers = useQuery({
    enabled: Boolean(accessToken && enabled),
    queryKey: ['cedis', 'logistics', 'drivers'],
    queryFn: () => cedisService.listLogisticsDrivers(accessToken),
    staleTime: CEDIS_LOCATIONS_STALE_TIME_MS,
  });
  const vehicles = useQuery({
    enabled: Boolean(accessToken && enabled),
    queryKey: ['cedis', 'logistics', 'vehicles'],
    queryFn: () => cedisService.listLogisticsVehicles(accessToken),
    staleTime: CEDIS_LOCATIONS_STALE_TIME_MS,
  });
  return { drivers, vehicles };
}

export function useReceiveCedisSupply() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("receive-supply"),
    mutationFn: (input: {
      transferId: string;
      payload: CedisReceiveSupplyCommand;
      idempotencyKey?: string;
    }) =>
      cedisService.receiveIncomingSupply(
        input.transferId,
        input.payload,
        accessToken,
        input.idempotencyKey ?? idempotencyKey(),
      ),
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

async function invalidateCedisDependencies(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: cedisQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["products"] }),
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
    mutationFn: (
      input: CedisCycleCommand | CedisMutationInput<CedisCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.createSupply(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useCreateCedisReturn(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("return"),
    mutationFn: (
      input: CedisCycleCommand | CedisMutationInput<CedisCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.createReturn(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useRefreshCedisCycle(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("refresh"),
    mutationFn: (
      input: CedisRefreshCommand | CedisMutationInput<CedisRefreshCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.refreshCycle(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

function isMutationInput<T>(
  input: T | CedisMutationInput<T>,
): input is CedisMutationInput<T> {
  return (
    typeof input === "object" &&
    input !== null &&
    "payload" in input &&
    "idempotencyKey" in input
  );
}

export function useOpenCedisCycle() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("open"),
    mutationFn: (
      input: CedisOpenCycleCommand | CedisMutationInput<CedisOpenCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.openCycle(
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useCloseCedisCycle(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("close"),
    mutationFn: (
      input:
        CedisCloseCycleCommand | CedisMutationInput<CedisCloseCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.closeCycle(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useReopenCedisCycle(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("reopen"),
    mutationFn: (
      input:
        CedisReopenCycleCommand | CedisMutationInput<CedisReopenCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.reopenCycle(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}

export function useCancelCedisCycle(cycleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cedisQueryKeys.mutations("cancel"),
    mutationFn: (
      input:
        CedisCancelCycleCommand | CedisMutationInput<CedisCancelCycleCommand>,
    ) => {
      const command = isMutationInput(input)
        ? input
        : { payload: input, idempotencyKey: idempotencyKey() };
      return cedisService.cancelCycle(
        cycleId,
        command.payload,
        accessToken,
        command.idempotencyKey,
      );
    },
    onSuccess: () => invalidateCedisDependencies(queryClient),
  });
}
