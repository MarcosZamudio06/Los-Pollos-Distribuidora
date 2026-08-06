export const CEDIS_SUPPLY_CREATED_EVENT = 'cedis.supply.created' as const;
export const CEDIS_GATEWAY_NAMESPACE = '/cedis' as const;
export const CEDIS_GATEWAY_PATH = '/api/socket.io' as const;

export type CedisSupplyCreatedPayload = {
  transferId: string;
  transferNumber: string;
  cycleId: string;
  businessDate: string;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  requestedAt: string | null;
};

export type CedisServerToClientEvents = {
  [CEDIS_SUPPLY_CREATED_EVENT]: (supply: CedisSupplyCreatedPayload) => void;
};

export type CedisClientToServerEvents = Record<string, never>;

export function cedisLocationRoom(locationId: string): string {
  return `cedis:location:${locationId}`;
}

export const CEDIS_ADMIN_ROOM = 'cedis:admins';
