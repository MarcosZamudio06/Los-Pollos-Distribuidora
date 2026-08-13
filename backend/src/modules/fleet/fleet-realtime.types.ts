export const FLEET_GATEWAY_NAMESPACE = '/fleet' as const;
export const FLEET_GATEWAY_PATH = '/api/socket.io' as const;

export const FLEET_POSITION_UPDATED_EVENT = 'fleet.position.updated' as const;
export const FLEET_ROUTE_UPDATED_EVENT = 'fleet.route.updated' as const;
export const FLEET_INCIDENT_CREATED_EVENT = 'fleet.incident.created' as const;
export const FLEET_GEOFENCE_ENTERED_EVENT = 'fleet.geofence.entered' as const;
export const FLEET_GEOFENCE_EXITED_EVENT = 'fleet.geofence.exited' as const;

export const FLEET_ADMIN_ROOM = 'fleet:admin' as const;

export type FleetPositionUpdatedPayload = {
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

export type FleetGeofenceEventPayload = {
  eventId: string;
  type: 'ENTER' | 'EXIT';
  zoneId: string;
  zoneName: string;
  vehicleId: string;
  vehicleCode: string;
  routeId: string;
  latitude: number;
  longitude: number;
  occurredAt: string;
};

export type FleetIncidentCreatedPayload = {
  incidentId: string;
  deliveryOrderId: string;
  routeId: string;
  vehicleId: string | null;
  driverId: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CANCELLED';
  reason: string;
  occurredAt: string;
  position: { latitude: number; longitude: number } | null;
  stop: { latitude: number; longitude: number } | null;
};

export type FleetRealtimePayload = Record<string, unknown>;

export type FleetServerToClientEvents = {
  [FLEET_POSITION_UPDATED_EVENT]: (
    payload: FleetPositionUpdatedPayload,
  ) => void;
  [FLEET_ROUTE_UPDATED_EVENT]: (payload: FleetRealtimePayload) => void;
  [FLEET_INCIDENT_CREATED_EVENT]: (
    payload: FleetIncidentCreatedPayload,
  ) => void;
  [FLEET_GEOFENCE_ENTERED_EVENT]: (payload: FleetGeofenceEventPayload) => void;
  [FLEET_GEOFENCE_EXITED_EVENT]: (payload: FleetGeofenceEventPayload) => void;
};

export type FleetClientToServerEvents = Record<string, never>;

export function fleetOriginRoom(originLocationId: string): string {
  return `fleet:origin:${originLocationId}`;
}

export function fleetRouteRoom(routeId: string): string {
  return `fleet:route:${routeId}`;
}

export function fleetDriverRoom(driverId: string): string {
  return `fleet:driver:${driverId}`;
}
