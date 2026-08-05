export type CedisCycleStatus =
  | "OPEN"
  | "READY_FOR_REVIEW"
  | "CLOSED"
  | "CANCELLED";

export type CedisLocation = {
  id: string;
  name: string;
  code?: string | null;
  type: string;
  parentId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
};

export type CedisDashboardFilters = {
  cedisLocationId: string;
  businessDate: string;
  status?: CedisCycleStatus;
  search?: string;
};

export type CedisDashboardLocation = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CedisDashboardCard = {
  branch: CedisDashboardLocation;
  cycle: {
    id: string;
    businessDate: string;
    status: CedisCycleStatus;
    version: number;
  } | null;
  physical: {
    deliveredKg: string;
    deliveredPieces: string;
    returnedKg: string;
    returnedPieces: string;
    expectedSoldKg: string;
    expectedSoldPieces: string;
    actualSoldKg: string;
    actualSoldPieces: string;
  } | null;
  financial: {
    expectedSales: string;
    actualSales: string;
    expectedCost?: string;
    actualCost?: string;
    expectedProfit?: string;
    actualProfit?: string;
    actualNetProfit?: string;
  } | null;
  cash: {
    expected: string;
    counted: string | null;
    difference: string | null;
  } | null;
  warningCount: number;
  lastActivityAt: string | null;
};

export type CedisDashboardResponse = {
  cedisLocationId: string;
  businessDate: string;
  items: CedisDashboardCard[];
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisBranchHistoryFilters = {
  dateFrom: string;
  dateTo: string;
  status?: CedisCycleStatus;
  page?: number;
  limit?: number;
};

export type CedisBranchHistoryResponse = {
  branchId: string;
  dateFrom: string;
  dateTo: string;
  items: CedisDashboardCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisCycleSummary = {
  id: string;
  businessDate: string;
  status: CedisCycleStatus;
  version: number;
  notes: string | null;
  branch: CedisDashboardLocation;
  distributionCenter: CedisDashboardLocation;
  totals: {
    deliveredKg: string;
    deliveredPieces: string;
    returnedKg: string;
    returnedPieces: string;
    expectedSoldKg: string;
    expectedSoldPieces: string;
    actualSoldKg: string;
    actualSoldPieces: string;
    expectedSales: string;
    actualSales: string;
    expectedCash: string;
    cashCounted: string | null;
    cashDifference: string | null;
    expectedCost?: string;
    actualCost?: string;
    expectedProfit?: string;
    actualProfit?: string;
    actualNetProfit?: string;
  };
  warningCount: number;
  lastActivityAt: string | null;
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisCycleCommandItem = {
  productId: string;
  unit: "KG" | "PIECE" | "KG_AND_PIECE";
  quantityKg?: number;
  quantityPieces?: number;
  unitEquivalentId?: string | null;
};

export type CedisCycleCommand = {
  expectedVersion: number;
  notes?: string;
  items: CedisCycleCommandItem[];
};

export type CedisRefreshCommand = {
  expectedVersion: number;
};
