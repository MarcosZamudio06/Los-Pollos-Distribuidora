import { io, type Socket } from "socket.io-client";

export const FLEET_POSITION_UPDATED_EVENT = "fleet.position.updated" as const;
export const FLEET_ROUTE_UPDATED_EVENT = "fleet.route.updated" as const;
export const FLEET_INCIDENT_CREATED_EVENT = "fleet.incident.created" as const;
export const FLEET_GEOFENCE_ENTERED_EVENT = "fleet.geofence.entered" as const;
export const FLEET_GEOFENCE_EXITED_EVENT = "fleet.geofence.exited" as const;

export type FleetPositionUpdated = {
  vehicleId: string;
  vehicleCode: string;
  routeId: string;
  driverId: string;
  originLocationId: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  recordedAt: string;
};

export type FleetGeofenceEvent = {
  eventId: string;
  type: "ENTER" | "EXIT";
  zoneId: string;
  zoneName: string;
  vehicleId: string;
  vehicleCode: string;
  routeId: string;
  latitude: number;
  longitude: number;
  occurredAt: string;
};

export type FleetIncidentCreated = {
  incidentId: string;
  deliveryOrderId: string;
  routeId: string;
  vehicleId: string | null;
  driverId: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CANCELLED";
  reason: string;
  occurredAt: string;
  position: { latitude: number; longitude: number } | null;
  stop: { latitude: number; longitude: number } | null;
};

export type FleetRealtimePayload = Record<string, unknown>;

type FleetServerEvents = {
  [FLEET_POSITION_UPDATED_EVENT]: (
    payload: FleetPositionUpdated,
  ) => void;
  [FLEET_ROUTE_UPDATED_EVENT]: (payload: FleetRealtimePayload) => void;
  [FLEET_INCIDENT_CREATED_EVENT]: (payload: FleetIncidentCreated) => void;
  [FLEET_GEOFENCE_ENTERED_EVENT]: (payload: FleetGeofenceEvent) => void;
  [FLEET_GEOFENCE_EXITED_EVENT]: (payload: FleetGeofenceEvent) => void;
};

type FleetSocket = Socket<FleetServerEvents>;

export type FleetSocketHandlers = {
  onPositionUpdated: (position: FleetPositionUpdated) => void;
  onRouteUpdated?: (payload: FleetRealtimePayload) => void;
  onIncidentCreated?: (payload: FleetIncidentCreated) => void;
  onGeofenceEntered?: (payload: FleetGeofenceEvent) => void;
  onGeofenceExited?: (payload: FleetGeofenceEvent) => void;
  onConnected?: () => void;
  onConnectionError?: () => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
};

function getSocketOrigin() {
  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ??
    import.meta.env.VITE_API_URL ??
    "/api"
  ).trim();
  if (!/^https?:\/\//i.test(apiBaseUrl)) return undefined;
  return new URL(apiBaseUrl).origin;
}

export function getFleetSocketUrl() {
  const origin = getSocketOrigin();
  return origin ? `${origin}/fleet` : "/fleet";
}

class FleetSocketClient {
  private socket: FleetSocket | null = null;
  private originLocationId: string | undefined;
  private token: string | null = null;

  subscribe(
    token: string,
    originLocationId: string | undefined,
    handlers: FleetSocketHandlers,
  ) {
    const shouldReconnect =
      this.originLocationId !== originLocationId || this.token !== token;
    const socket = this.getSocket();

    if (shouldReconnect) {
      socket.disconnect();
      this.originLocationId = originLocationId;
      this.token = token;
      socket.auth = {
        token,
        ...(originLocationId ? { originLocationId } : {}),
      };
    }

    socket.on(FLEET_POSITION_UPDATED_EVENT, handlers.onPositionUpdated);
    if (handlers.onRouteUpdated) {
      socket.on(FLEET_ROUTE_UPDATED_EVENT, handlers.onRouteUpdated);
    }
    if (handlers.onIncidentCreated) {
      socket.on(FLEET_INCIDENT_CREATED_EVENT, handlers.onIncidentCreated);
    }
    if (handlers.onGeofenceEntered) {
      socket.on(FLEET_GEOFENCE_ENTERED_EVENT, handlers.onGeofenceEntered);
    }
    if (handlers.onGeofenceExited) {
      socket.on(FLEET_GEOFENCE_EXITED_EVENT, handlers.onGeofenceExited);
    }
    if (handlers.onConnected) socket.on("connect", handlers.onConnected);
    if (handlers.onConnectionError) {
      socket.on("connect_error", handlers.onConnectionError);
    }
    if (handlers.onDisconnected) {
      socket.on("disconnect", handlers.onDisconnected);
    }
    if (handlers.onReconnecting) {
      socket.io.on("reconnect_attempt", handlers.onReconnecting);
    }

    if (!socket.connected) socket.connect();

    return () => {
      socket.off(FLEET_POSITION_UPDATED_EVENT, handlers.onPositionUpdated);
      if (handlers.onRouteUpdated) {
        socket.off(FLEET_ROUTE_UPDATED_EVENT, handlers.onRouteUpdated);
      }
      if (handlers.onIncidentCreated) {
        socket.off(FLEET_INCIDENT_CREATED_EVENT, handlers.onIncidentCreated);
      }
      if (handlers.onGeofenceEntered) {
        socket.off(FLEET_GEOFENCE_ENTERED_EVENT, handlers.onGeofenceEntered);
      }
      if (handlers.onGeofenceExited) {
        socket.off(FLEET_GEOFENCE_EXITED_EVENT, handlers.onGeofenceExited);
      }
      if (handlers.onConnected) socket.off("connect", handlers.onConnected);
      if (handlers.onConnectionError) {
        socket.off("connect_error", handlers.onConnectionError);
      }
      if (handlers.onDisconnected) {
        socket.off("disconnect", handlers.onDisconnected);
      }
      if (handlers.onReconnecting) {
        socket.io.off("reconnect_attempt", handlers.onReconnecting);
      }
      socket.disconnect();
    };
  }

  private getSocket(): FleetSocket {
    if (this.socket) return this.socket;

    this.socket = io(getFleetSocketUrl(), {
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

export const fleetSocket = new FleetSocketClient();
