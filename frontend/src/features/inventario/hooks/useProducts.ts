import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { productService } from "../services/productService";
import type {
  InventoryAdjustmentValues,
  InventoryTransferValues,
  ProductFormValues,
} from "../types";

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  presentationType?: string;
  unit?: string;
  locationId?: string;
  lowStock?: boolean;
  isActive?: string;
};

export type InventoryTransferCommand = {
  id: string;
  idempotencyKey?: string;
};

export type InventoryTransferCancellationCommand = InventoryTransferCommand & {
  reason: string;
};

export type InventoryQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function invalidateInventoryQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-balances"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
    queryClient.invalidateQueries({ queryKey: ["cedis-inventory-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["cedis"] }),
    queryClient.invalidateQueries({ queryKey: ["products"] }),
  ]);
}

export function useProducts(filters: ProductFilters) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => productService.listProducts(filters, accessToken),
  });
}

export function useInventoryCategories() {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["inventory-categories"],
    queryFn: () => productService.listCategories(accessToken),
  });
}

export function useInventoryLocations(options: InventoryQueryOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken && (options.enabled ?? true)),
    queryKey: ["inventory-locations"],
    queryFn: () => productService.listLocations(accessToken),
    refetchInterval: options.refetchInterval,
  });
}

export function useSaveProduct(productId?: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProductFormValues) =>
      productId
        ? productService.updateProduct(productId, values, accessToken)
        : productService.createProduct(values, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useInventoryBalances(filters: {
  locationId?: string;
  productId?: string;
  lowStock?: boolean;
}) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["inventory-balances", filters],
    queryFn: () => productService.listBalances(filters, accessToken),
  });
}

export function useCedisInventorySummary(
  cedisLocationId?: string,
  businessDate?: string,
) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken && cedisLocationId && businessDate),
    queryKey: ["cedis-inventory-summary", cedisLocationId, businessDate],
    queryFn: () =>
      productService.getCedisInventorySummary(
        cedisLocationId as string,
        businessDate as string,
        accessToken,
      ),
  });
}

export function useCreateInventoryAdjustment() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: InventoryAdjustmentValues) =>
      productService.createAdjustment(values, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
    },
  });
}

export function useInventoryMovements(
  filters: Record<string, string | undefined>,
) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["inventory-movements", filters],
    queryFn: () => productService.listMovements(filters, accessToken),
  });
}

export function useInventoryTransfers(options: InventoryQueryOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken && (options.enabled ?? true)),
    queryKey: ["inventory-transfers"],
    queryFn: () => productService.listTransfers(accessToken),
    refetchInterval: options.refetchInterval,
  });
}

export function useInventoryTransferDetail(id?: string) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(id),
    queryKey: ["inventory-transfers", id],
    queryFn: () => productService.getTransfer(id as string, accessToken),
  });
}

export function useCreateInventoryTransfer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: InventoryTransferValues) =>
      productService.createTransfer(values, accessToken),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] }),
  });
}

export function useConfirmInventoryTransfer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, idempotencyKey }: InventoryTransferCommand) =>
      productService.confirmTransfer(
        id,
        accessToken,
        idempotencyKey?.trim() || createIdempotencyKey(),
      ),
    onSuccess: () => invalidateInventoryQueries(queryClient),
  });
}

export function useCancelInventoryTransfer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      idempotencyKey,
      reason,
    }: InventoryTransferCancellationCommand) =>
      productService.cancelTransfer(
        id,
        reason,
        accessToken,
        idempotencyKey?.trim() || createIdempotencyKey(),
      ),
    onSuccess: () => invalidateInventoryQueries(queryClient),
  });
}
