import { apiClient } from "../../lib/api";
import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  Vehicle,
  VehicleListData,
  VehicleListFilters,
} from "./vehicleTypes";

type VehicleListEnvelope = {
  data?: VehicleListData;
  message?: string;
  success?: boolean;
};

type VehicleEnvelope = {
  data?: Vehicle;
  message?: string;
  success?: boolean;
};

function authHeaders(accessToken?: string | null) {
  return accessToken
    ? { authorization: `Bearer ${accessToken}` }
    : undefined;
}

function withParams(path: string, filters: VehicleListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search) params.set("search", filters.search);
  if (filters.isActive) params.set("isActive", filters.isActive);
  return `${path}?${params.toString()}`;
}

function unwrapVehicle(response: VehicleEnvelope) {
  if (!response.data) {
    throw new Error("La API no devolvió la unidad registrada.");
  }
  return response.data;
}

export const vehicleService = {
  async listVehicles(
    filters: VehicleListFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<VehicleListEnvelope>(
      withParams("/vehicles", filters),
      { headers: authHeaders(accessToken) },
    );
    return (
      response.data ?? {
        items: [],
        total: 0,
        page: filters.page,
        limit: filters.limit,
        totalPages: 0,
      }
    );
  },

  async createVehicle(
    payload: CreateVehiclePayload,
    accessToken?: string | null,
  ) {
    const response = await apiClient.post<VehicleEnvelope, CreateVehiclePayload>(
      "/vehicles",
      {
        body: payload,
        headers: authHeaders(accessToken),
      },
    );
    return unwrapVehicle(response);
  },

  async updateVehicle(
    id: string,
    payload: UpdateVehiclePayload,
    accessToken?: string | null,
  ) {
    const response = await apiClient.patch<VehicleEnvelope, UpdateVehiclePayload>(
      `/vehicles/${id}`,
      {
        body: payload,
        headers: authHeaders(accessToken),
      },
    );
    return unwrapVehicle(response);
  },
};
