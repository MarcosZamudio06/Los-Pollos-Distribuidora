import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth";
import {
  fleetSocket,
  type FleetIncidentCreated,
  type FleetGeofenceEvent,
  type FleetPositionUpdated,
} from "../../lib/fleetSocket";
import {
  appendGeofenceEvent,
  applyIncidentCreated,
  applyPositionUpdated,
} from "./fleetLiveUtils";
import { fleetService } from "./fleetService";
import type {
  FleetConnectionState,
  FleetHeatmapFilters,
  FleetGeofenceTimelineEvent,
  FleetLiveSnapshot,
} from "./types";

export const fleetLiveQueryKey = (originLocationId: string) =>
  ["fleet", "live", { originLocationId }] as const;

export const fleetHeatmapQueryKey = (filters: FleetHeatmapFilters) =>
  ["fleet", "heatmap", filters] as const;

export function useFleetHeatmap(filters: FleetHeatmapFilters, active: boolean) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken) && active,
    queryKey: fleetHeatmapQueryKey(filters),
    queryFn: () => fleetService.getHeatmap(filters, accessToken),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useFleetOrigins() {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: ["fleet", "origins"],
    queryFn: () => fleetService.listOrigins(accessToken),
  });
}

export const deliveryZonesQueryKey = (originLocationId: string) =>
  ["fleet", "delivery-zones", { originLocationId }] as const;

export function useDeliveryZones(originLocationId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(accessToken),
    queryKey: deliveryZonesQueryKey(originLocationId),
    queryFn: () =>
      fleetService.listDeliveryZones({ originLocationId }, accessToken),
    staleTime: 30_000,
  });
}

export function useFleetLive(originLocationId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => fleetLiveQueryKey(originLocationId),
    [originLocationId],
  );
  // Identity, not just scope equality: A -> B -> A still needs a new handshake.
  const subscription = useMemo(
    () => ({ accessToken, originLocationId }),
    [accessToken, originLocationId],
  );
  const [connection, setConnection] = useState<{
    subscription: typeof subscription;
    state: FleetConnectionState;
  } | null>(null);
  const [incidentCount, setIncidentCount] = useState(0);
  const [geofenceEventsByOrigin, setGeofenceEventsByOrigin] = useState<
    Record<string, FleetGeofenceTimelineEvent[]>
  >({});
  const snapshotsInFlight = useRef(
    new Set<Map<string, FleetPositionUpdated>>(),
  );
  const eventIdsRef = useRef(new Set<string>());
  const incidentIdsRef = useRef(new Set<string>());
  const eventsKey = originLocationId || "__all__";

  const query = useQuery({
    enabled: Boolean(accessToken),
    queryKey,
    queryFn: async () => {
      const deltas = new Map<string, FleetPositionUpdated>();
      snapshotsInFlight.current.add(deltas);
      try {
        let snapshot = await fleetService.getLive(
          { originLocationId },
          accessToken,
        );
        // A snapshot read may precede a GPS commit whose delta arrived during the request.
        for (const position of deltas.values())
          snapshot = applyPositionUpdated(snapshot, position);
        return snapshot;
      } finally {
        snapshotsInFlight.current.delete(deltas);
      }
    },
    refetchInterval: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    const setConnectionState = (state: FleetConnectionState) => {
      if (active) setConnection({ subscription, state });
    };

    const handlePositionUpdated = (position: FleetPositionUpdated) => {
      if (!active) return;
      for (const deltas of snapshotsInFlight.current) {
        const key = `${position.routeId}:${position.vehicleId}`;
        const previous = deltas.get(key);
        if (
          !previous ||
          Date.parse(position.recordedAt) > Date.parse(previous.recordedAt)
        ) {
          deltas.set(key, position);
        }
      }
      queryClient.setQueryData<FleetLiveSnapshot | undefined>(
        queryKey,
        (snapshot) =>
          snapshot ? applyPositionUpdated(snapshot, position) : snapshot,
      );
    };

    const handleGeofenceEvent = (event: FleetGeofenceEvent) => {
      if (!active) return;
      if (!event.eventId || eventIdsRef.current.has(event.eventId)) return;
      eventIdsRef.current.add(event.eventId);
      setGeofenceEventsByOrigin((current) => {
        const currentEvents = current[eventsKey] ?? [];
        const nextEvents = appendGeofenceEvent(currentEvents, event);
        return nextEvents === currentEvents
          ? current
          : { ...current, [eventsKey]: nextEvents };
      });
    };

    const handleIncidentCreated = (event: FleetIncidentCreated) => {
      if (!active) return;
      if (!event.incidentId || incidentIdsRef.current.has(event.incidentId)) {
        return;
      }
      incidentIdsRef.current.add(event.incidentId);
      queryClient.setQueryData<FleetLiveSnapshot | undefined>(
        queryKey,
        (snapshot) =>
          snapshot ? applyIncidentCreated(snapshot, event) : snapshot,
      );
      setIncidentCount((count) => count + 1);
      // The route may not be cached yet, or an older REST read may still be in flight.
      // Re-read committed state instead of losing the hint or inventing a route.
      reconcileSnapshot();
    };

    const reconcileSnapshot = () => {
      if (!active) return;
      // Invalidation alone reuses an initial in-flight request with no cached data.
      // Cancel that obsolete read before starting the authoritative post-event snapshot.
      void queryClient.cancelQueries({ queryKey }).then(() => {
        if (active) return queryClient.invalidateQueries({ queryKey });
      });
    };

    const cleanup = fleetSocket.subscribe(
      accessToken,
      originLocationId || undefined,
      {
        onPositionUpdated: handlePositionUpdated,
        onRouteUpdated: reconcileSnapshot,
        onIncidentCreated: handleIncidentCreated,
        onGeofenceEntered: handleGeofenceEvent,
        onGeofenceExited: handleGeofenceEvent,
        onConnected: () => {
          setConnectionState("connected");
          // Covers reconnects and changes missed between a cached snapshot and subscription.
          reconcileSnapshot();
        },
        onConnectionError: () => setConnectionState("error"),
        onDisconnected: () => setConnectionState("disconnected"),
        onReconnecting: () => setConnectionState("reconnecting"),
      },
    );

    return () => {
      active = false;
      cleanup();
    };
  }, [
    accessToken,
    eventsKey,
    originLocationId,
    queryClient,
    queryKey,
    subscription,
  ]);

  const connectionState: FleetConnectionState = !accessToken
    ? "disconnected"
    : connection?.subscription === subscription
      ? connection.state
      : "connecting";

  return {
    ...query,
    connectionState,
    incidentCount,
    geofenceEvents: geofenceEventsByOrigin[eventsKey] ?? [],
  };
}
