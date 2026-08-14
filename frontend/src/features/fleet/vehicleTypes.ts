export type Vehicle = {
  id: string;
  code: string;
  displayName: string;
  plateNumber: string | null;
  homeLocationId: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type VehicleListData = {
  items: Vehicle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type VehicleListFilters = {
  page: number;
  limit: number;
  search: string;
  isActive: "" | "true" | "false";
};

export type CreateVehiclePayload = {
  code: string;
  displayName: string;
  plateNumber?: string | null;
  homeLocationId?: string | null;
};

export type UpdateVehiclePayload = Partial<CreateVehiclePayload> & {
  isActive?: boolean;
};
