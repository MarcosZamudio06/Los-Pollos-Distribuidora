import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { vehicleService } from "./vehicleService";
import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  VehicleListFilters,
} from "./vehicleTypes";

export const vehicleListQueryKey = (filters: VehicleListFilters) =>
  ["fleet", "vehicles", filters] as const;

export function useVehicles(filters: VehicleListFilters) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: vehicleListQueryKey(filters),
    queryFn: () => vehicleService.listVehicles(filters, accessToken),
  });
}

function invalidateVehicleConsumers(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["fleet", "vehicles"] });
  void queryClient.invalidateQueries({ queryKey: ["route-planner", "vehicles"] });
  void queryClient.invalidateQueries({ queryKey: ["fleet", "live"] });
}

export function useCreateVehicle() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) =>
      vehicleService.createVehicle(payload, accessToken),
    onSuccess: () => invalidateVehicleConsumers(queryClient),
  });
}

export function useUpdateVehicle(vehicleId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateVehiclePayload) =>
      vehicleService.updateVehicle(vehicleId, payload, accessToken),
    onSuccess: () => invalidateVehicleConsumers(queryClient),
  });
}
