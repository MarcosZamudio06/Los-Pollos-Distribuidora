import type {
  CedisBranchHistoryFilters,
  CedisDashboardFilters,
  CedisIncomingSuppliesFilters,
  CedisReturnsFilters,
} from "./types";

export const cedisQueryKeys = {
  all: ["cedis"] as const,
  operationalLocations: ["locations"] as const,
  locations: (scope: string) => ["cedis", "locations", scope] as const,
  location: (locationId: string) => ["cedis", "location", locationId] as const,
  branches: (cedisLocationId: string) =>
    ["cedis", "branches", cedisLocationId] as const,
  dashboard: (filters: CedisDashboardFilters | null) =>
    ["cedis", "dashboard", filters] as const,
  branchHistory: (branchId: string, filters: CedisBranchHistoryFilters) =>
    ["cedis", "branches", branchId, "history", filters] as const,
  cycleSummary: (cycleId: string) =>
    ["cedis", "branch-supply-cycles", cycleId, "summary"] as const,
  incomingSupplies: (filters: CedisIncomingSuppliesFilters) =>
    ["cedis", "incoming-supplies", filters] as const,
  returns: (filters: CedisReturnsFilters) =>
    ["cedis", "returns", filters] as const,
  mutations: (
    operation:
      | "open"
      | "supply"
      | "return"
      | "refresh"
      | "close"
      | "reopen"
      | "cancel"
      | "create-branch"
      | "receive-supply"
      | "complete-return",
  ) => ["cedis", "mutations", operation] as const,
};
