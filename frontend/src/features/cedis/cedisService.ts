import { apiClient } from "../../lib/api";
import type {
  CedisBranchHistoryFilters,
  CedisBranchHistoryResponse,
  CedisCancelCycleCommand,
  CedisCloseCycleCommand,
  CedisCycleCommand,
  CedisCycleSummary,
  CedisDashboardFilters,
  CedisDashboardResponse,
  CedisIncomingSupply,
  CedisBranchReturn,
  CedisReturnsFilters,
  CedisReturnsResponse,
  CedisIncomingSuppliesFilters,
  CedisIncomingSuppliesResponse,
  CedisReceiveSupplyCommand,
  CedisLocation,
  CreateBranchLocationPayload,
  CedisOpenCycleCommand,
  CedisReopenCycleCommand,
  CedisRefreshCommand,
} from "./types";

type ApiEnvelope<T> = { data?: T } | T;
type LocationList = { items?: CedisLocation[] } | CedisLocation[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (isRecord(response) && "data" in response) {
    return response.data as T;
  }

  return response as T;
}

function unwrapLocations(response: ApiEnvelope<LocationList>) {
  const payload = unwrap(response);
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

function authHeaders(accessToken?: string | null, idempotencyKey?: string) {
  return {
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function withParams(
  path: string,
  filters: Record<string, string | number | boolean | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const cedisService = {
  async listLocations(
    filters: {
      type?: string;
      parentId?: string;
      isActive?: boolean;
      limit?: number;
      page?: number;
    },
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<ApiEnvelope<LocationList>>(
      withParams("/locations", filters),
      { headers: authHeaders(accessToken) },
    );

    return unwrapLocations(response);
  },

  async getLocation(locationId: string, accessToken?: string | null) {
    const response = await apiClient.get<ApiEnvelope<CedisLocation>>(
      `/locations/${locationId}`,
      { headers: authHeaders(accessToken) },
    );

    return unwrap(response);
  },

  async createLocation(
    payload: CreateBranchLocationPayload,
    accessToken?: string | null,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<CedisLocation>,
      CreateBranchLocationPayload
    >("/locations", {
      body: payload,
      headers: authHeaders(accessToken),
    });

    return unwrap(response);
  },

  async getDashboard(
    filters: CedisDashboardFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<ApiEnvelope<CedisDashboardResponse>>(
      withParams("/cedis/dashboard", {
        cedisLocationId: filters.cedisLocationId,
        businessDate: filters.businessDate,
        status: filters.status,
        search: filters.search,
      }),
      { headers: authHeaders(accessToken) },
    );

    return unwrap(response);
  },

  async getBranchHistory(
    branchId: string,
    filters: CedisBranchHistoryFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<
      ApiEnvelope<CedisBranchHistoryResponse>
    >(withParams(`/cedis/branches/${branchId}/history`, filters), {
      headers: authHeaders(accessToken),
    });

    return unwrap(response);
  },

  async getCycleSummary(cycleId: string, accessToken?: string | null) {
    const response = await apiClient.get<ApiEnvelope<CedisCycleSummary>>(
      `/cedis/branch-supply-cycles/${cycleId}/summary`,
      { headers: authHeaders(accessToken) },
    );

    return unwrap(response);
  },

  async listIncomingSupplies(
    filters: CedisIncomingSuppliesFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<
      ApiEnvelope<CedisIncomingSuppliesResponse>
    >(withParams("/cedis/incoming-supplies", filters), {
      headers: authHeaders(accessToken),
    });

    return unwrap(response);
  },

  async getIncomingSupply(transferId: string, accessToken?: string | null) {
    const response = await apiClient.get<ApiEnvelope<CedisIncomingSupply>>(
      `/cedis/incoming-supplies/${transferId}`,
      {
        headers: authHeaders(accessToken),
      },
    );

    return unwrap(response);
  },

  async listReturns(
    filters: CedisReturnsFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<ApiEnvelope<CedisReturnsResponse>>(
      withParams('/cedis/returns', filters),
      { headers: authHeaders(accessToken) },
    );
    return unwrap(response);
  },

  async getReturn(transferId: string, accessToken?: string | null) {
    const response = await apiClient.get<ApiEnvelope<CedisBranchReturn>>(
      `/cedis/returns/${transferId}`,
      { headers: authHeaders(accessToken) },
    );
    return unwrap(response);
  },

  async completeReturn(
    transferId: string,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<ApiEnvelope<CedisBranchReturn>, Record<string, never>>(
      `/cedis/returns/${transferId}/complete`,
      { body: {}, headers: authHeaders(accessToken, idempotencyKey) },
    );
    return unwrap(response);
  },

  async receiveIncomingSupply(
    transferId: string,
    payload: CedisReceiveSupplyCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<CedisIncomingSupply>,
      CedisReceiveSupplyCommand
    >(`/cedis/incoming-supplies/${transferId}/receive`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async openCycle(
    payload: CedisOpenCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisOpenCycleCommand
    >("/cedis/branch-supply-cycles", {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async createSupply(
    cycleId: string,
    payload: CedisCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisCycleCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/supplies`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async createReturn(
    cycleId: string,
    payload: CedisCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisCycleCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/returns`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async refreshCycle(
    cycleId: string,
    payload: CedisRefreshCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisRefreshCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/refresh`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async closeCycle(
    cycleId: string,
    payload: CedisCloseCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisCloseCycleCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/close`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async reopenCycle(
    cycleId: string,
    payload: CedisReopenCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisReopenCycleCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/reopen`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },

  async cancelCycle(
    cycleId: string,
    payload: CedisCancelCycleCommand,
    accessToken: string | null,
    idempotencyKey: string,
  ) {
    const response = await apiClient.post<
      ApiEnvelope<unknown>,
      CedisCancelCycleCommand
    >(`/cedis/branch-supply-cycles/${cycleId}/cancel`, {
      body: payload,
      headers: authHeaders(accessToken, idempotencyKey),
    });

    return unwrap(response);
  },
};
