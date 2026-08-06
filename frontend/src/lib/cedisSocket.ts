import { io, type Socket } from "socket.io-client";

export const CEDIS_SUPPLY_CREATED_EVENT = "cedis.supply.created" as const;

export type CedisSupplyCreated = {
  transferId: string;
  transferNumber: string;
  cycleId: string;
  businessDate: string;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  requestedAt: string | null;
};

type CedisServerEvents = {
  [CEDIS_SUPPLY_CREATED_EVENT]: (supply: CedisSupplyCreated) => void;
};

type CedisSocket = Socket<CedisServerEvents>;

function getSocketOrigin() {
  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ??
    import.meta.env.VITE_API_URL ??
    "/api"
  ).trim();
  if (!/^https?:\/\//i.test(apiBaseUrl)) return undefined;
  return new URL(apiBaseUrl).origin;
}

export function getCedisSocketUrl() {
  const origin = getSocketOrigin();
  return origin ? `${origin}/cedis` : "/cedis";
}

class CedisSocketClient {
  private socket: CedisSocket | null = null;
  private locationId: string | null = null;
  private token: string | null = null;

  subscribe(
    token: string,
    locationId: string,
    onSupplyCreated: (supply: CedisSupplyCreated) => void,
    onConnected?: () => void,
  ) {
    const shouldReconnect =
      this.locationId !== locationId || this.token !== token;
    const socket = this.getSocket();

    if (shouldReconnect) {
      socket.disconnect();
      this.locationId = locationId;
      this.token = token;
      socket.auth = { locationId, token };
    }

    socket.on(CEDIS_SUPPLY_CREATED_EVENT, onSupplyCreated);
    if (onConnected) socket.on("connect", onConnected);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off(CEDIS_SUPPLY_CREATED_EVENT, onSupplyCreated);
      if (onConnected) socket.off("connect", onConnected);
      socket.disconnect();
    };
  }

  private getSocket(): CedisSocket {
    if (this.socket) return this.socket;

    this.socket = io(getCedisSocketUrl(), {
      autoConnect: false,
      path: "/api/socket.io",
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      transports: ["websocket", "polling"],
    });
    return this.socket;
  }
}

export const cedisSocket = new CedisSocketClient();
