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

export function useFleetHeatmap(
  filters: FleetHeatmapFilters,
  active: boolean,
) {
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
      fleetService.listDeliveryZones(
        { originLocationId },
        accessToken,
      ),
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
  const [connectionState, setConnectionState] = useState<FleetConnectionState>(
    accessToken ? "connecting" : "disconnected",
  );
  const [incidentCount, setIncidentCount] = useState(0);
  const [geofenceEventsByOrigin, setGeofenceEventsByOrigin] = useState<
    Record<string, FleetGeofenceTimelineEvent[]>
  >({});
  const connectedOnce = useRef(false);
  const eventIdsRef = useRef(new Set<string>());
  const incidentIdsRef = useRef(new Set<string>());
  const eventsKey = originLocationId || "__all__";

  const query = useQuery({
    enabled: Boolean(accessToken),
    queryKey,
    queryFn: () => fleetService.getLive({ originLocationId }, accessToken),
    refetchInterval: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const handlePositionUpdated = (position: FleetPositionUpdated) => {
      queryClient.setQueryData<FleetLiveSnapshot | undefined>(
        queryKey,
        (snapshot) =>
          snapshot ? applyPositionUpdated(snapshot, position) : snapshot,
      );
    };

    const handleGeofenceEvent = (event: FleetGeofenceEvent) => {
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
    };

    const cleanup = fleetSocket.subscribe(
      accessToken,
      originLocationId || undefined,
      {
        onPositionUpdated: handlePositionUpdated,
        onRouteUpdated: () => {
          void queryClient.invalidateQueries({ queryKey });
        },
        onIncidentCreated: handleIncidentCreated,
        onGeofenceEntered: handleGeofenceEvent,
        onGeofenceExited: handleGeofenceEvent,
        onConnected: () => {
          const isRecovery = connectedOnce.current;
          connectedOnce.current = true;
          setConnectionState("connected");
          if (isRecovery) {
            void queryClient.invalidateQueries({ queryKey });
          }
        },
        onConnectionError: () => setConnectionState("error"),
        onDisconnected: () => setConnectionState("disconnected"),
        onReconnecting: () => setConnectionState("reconnecting"),
      },
    );

    return () => {
      cleanup();
    };
  }, [accessToken, eventsKey, originLocationId, queryClient, queryKey]);

  return {
    ...query,
    connectionState,
    incidentCount,
    geofenceEvents: geofenceEventsByOrigin[eventsKey] ?? [],
  };
}
