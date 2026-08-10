import type { InventoryLocation, InventoryTransfer } from "./types";

export const CEDIS_RETURN_PENDING_STATUSES = [
  "DRAFT",
  "REQUESTED",
  "IN_TRANSIT",
] as const;

const pendingStatuses = new Set<string>(CEDIS_RETURN_PENDING_STATUSES);

export function isBranchToParentCedisTransfer(
  transfer: Pick<
    InventoryTransfer,
    "originLocationId" | "destinationLocationId"
  >,
  locationsById: ReadonlyMap<string, InventoryLocation>,
) {
  const origin = locationsById.get(transfer.originLocationId ?? "");
  const destination = locationsById.get(transfer.destinationLocationId ?? "");

  return Boolean(
    origin &&
      destination &&
      origin.type === "BRANCH" &&
      destination.type === "DISTRIBUTION_CENTER" &&
      origin.parentId === destination.id,
  );
}

export function isPendingCedisReturnTransfer(
  transfer: Pick<
    InventoryTransfer,
    "originLocationId" | "destinationLocationId" | "status"
  >,
  locationsById: ReadonlyMap<string, InventoryLocation>,
) {
  return (
    pendingStatuses.has(transfer.status) &&
    isBranchToParentCedisTransfer(transfer, locationsById)
  );
}
