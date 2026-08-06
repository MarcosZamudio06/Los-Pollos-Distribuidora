import type {
  CedisBranchHistoryFilters,
  CedisDashboardFilters,
  CedisIncomingSuppliesFilters,
} from "./types";

export const cedisQueryKeys = {
  all: ["cedis"] as const,
  locations: (scope: string) => ["cedis", "locations", scope] as const,
  location: (locationId: string) => ["cedis", "location", locationId] as const,
  dashboard: (filters: CedisDashboardFilters | null) =>
    ["cedis", "dashboard", filters] as const,
  branchHistory: (branchId: string, filters: CedisBranchHistoryFilters) =>
    ["cedis", "branches", branchId, "history", filters] as const,
  cycleSummary: (cycleId: string) =>
    ["cedis", "branch-supply-cycles", cycleId, "summary"] as const,
  incomingSupplies: (filters: CedisIncomingSuppliesFilters) =>
    ["cedis", "incoming-supplies", filters] as const,
  mutations: (
    operation:
      | "open"
      | "supply"
      | "return"
      | "refresh"
      | "close"
      | "reopen"
      | "cancel"
      | "receive-supply",
  ) => ["cedis", "mutations", operation] as const,
};
