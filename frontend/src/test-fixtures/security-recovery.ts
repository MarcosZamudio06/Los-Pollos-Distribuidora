// Browser fixture uses production clients/reconciliation and actual authenticated REST.
// This is a transport/cache acceptance surface, not a production business page.
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { fleetSocket } from "../lib/fleetSocket";
import { salesSocket } from "../lib/salesSocket";
import { cedisSocket } from "../lib/cedisSocket";
import { reconcileRealtimeQuery } from "../lib/realtimeRecovery";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
let stop = () => {},
  unobserve = () => {};
const state = { connections: 0, events: 0, coldRead: () => {}, stop: () => {} };
Object.assign(window, {
  securityRecovery: {
    state,
    start: (
      namespace: string,
      token: string,
      location: string,
      target: string,
    ) => {
      const key = ["security-recovery", namespace, target];
      const read = async () => {
        const response = await fetch(`/api/users/${target}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw Error("REST denied");
        return (await response.json()).data as { name: string };
      };
      const observe = () => {
        const observer = new QueryObserver<{ name: string }>(client, {
          queryKey: key,
          queryFn: read,
        });
        unobserve = observer.subscribe((result) => {
          if (result.data)
            document.querySelector("#state")!.textContent = result.data.name;
        });
      };
      observe();
      const connected = () => {
        state.connections++;
        void reconcileRealtimeQuery(client, key);
      };
      const event = () => {
        state.events++;
        void reconcileRealtimeQuery(client, key);
      };
      if (namespace === "Fleet")
        stop = fleetSocket.subscribe(token, undefined, {
          onPositionUpdated: event,
          onRouteUpdated: event,
          onConnected: connected,
        });
      if (namespace === "Sales")
        stop = salesSocket.subscribe(token, location, {
          onConnected: connected,
          onOrderCreated: event,
          onConnectionError: () => {},
          onDisconnected: () => {},
          onReconnecting: () => {},
        });
      if (namespace === "CEDIS")
        stop = cedisSocket.subscribe(token, location, event, connected);
      state.coldRead = () => {
        unobserve();
        client.removeQueries({ queryKey: key });
        observe();
      };
      state.stop = () => {
        stop();
        unobserve();
        client.clear();
      };
    },
  },
});
