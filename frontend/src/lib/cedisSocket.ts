import { installSessionRecovery } from "./realtimeRecovery";
import { io, type Socket } from "socket.io-client";

export const CEDIS_SUPPLY_CREATED_EVENT = "cedis.supply.created" as const;
export const CEDIS_SUPPLY_RECEIVED_EVENT = "cedis.supply.received" as const;
export type CedisConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
export type CedisConnectionHandlers = {
  onConnectionState?: (state: CedisConnectionState) => void;
  onSupplyReceived?: (
    supply: CedisSupplyCreated & { receiptId: string },
  ) => void;
};

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
  [CEDIS_SUPPLY_RECEIVED_EVENT]: (
    supply: CedisSupplyCreated & { receiptId: string },
  ) => void;
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
    handlers: CedisConnectionHandlers = {},
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

    const connected = () => {
      handlers.onConnectionState?.("connected");
      onConnected?.();
    };
    const disconnected = () => handlers.onConnectionState?.("disconnected");
    const error = () => handlers.onConnectionState?.("error");
    const reconnecting = () => handlers.onConnectionState?.("reconnecting");
    handlers.onConnectionState?.(socket.connected ? "connected" : "connecting");
    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.on("connect_error", error);
    socket.io.on("reconnect_attempt", reconnecting);
    if (handlers.onSupplyReceived)
      socket.on(CEDIS_SUPPLY_RECEIVED_EVENT, handlers.onSupplyReceived);
    socket.on(CEDIS_SUPPLY_CREATED_EVENT, onSupplyCreated);

    const stopRecovery = installSessionRecovery(socket, token);
    if (!socket.connected) socket.connect();

    return () => {
      stopRecovery();
      socket.off(CEDIS_SUPPLY_CREATED_EVENT, onSupplyCreated);
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("connect_error", error);
      socket.io.off("reconnect_attempt", reconnecting);
      if (handlers.onSupplyReceived)
        socket.off(CEDIS_SUPPLY_RECEIVED_EVENT, handlers.onSupplyReceived);
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
