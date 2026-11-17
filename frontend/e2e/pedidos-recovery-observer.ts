/// <reference lib="dom" />
// Imported only into runner-owned copies. No business request, signal read or cache write.
import { readVisibleSaleNumbers } from "../../shared/pedidos-recovery-contract";
import { queryClient } from "../src/lib/queryClient";
import type {
  RecoveryCache,
  RecoveryEvent,
  RecoverySnapshot,
} from "../../shared/pedidos-recovery-contract";
const events: RecoveryEvent[] = [];
let sequence = 0,
  requestSequence = 0;
function record(value: Omit<RecoveryEvent, "seq" | "at">) {
  const event = { ...value, seq: ++sequence, at: Date.now() };
  events.push(event);
  return event.seq;
}
function filtersOf(input: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (input && typeof input === "object")
    for (const [k, v] of Object.entries(input))
      if (
        [
          "locationId",
          "dateFrom",
          "dateTo",
          "limit",
          "paymentType",
          "saleChannel",
        ].includes(k) &&
        v !== undefined &&
        v !== ""
      )
        result[k] = String(v);
  return result;
}
function ordersOf(value: unknown) {
  const data = value as
    | {
        data?: { items?: { id: string; location?: { id: string } }[] };
        items?: { id: string; location?: { id: string } }[];
      }
    | undefined;
  return data?.data?.items ?? data?.items ?? [];
}
function cache(): RecoveryCache[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.queryKey[0] === "branch-orders")
    .map((q) => ({
      key: q.queryHash,
      filters: filtersOf(q.queryKey[1]),
      ids: ordersOf(q.state.data).map((x) => x.id),
      observers: q.getObserversCount(),
      status: q.state.status,
      fetchStatus: q.state.fetchStatus,
      dataUpdatedAt: q.state.dataUpdatedAt,
    }));
}
function keyOf(queryKey: readonly unknown[] | undefined) {
  return queryKey
    ? queryClient.getQueryCache().find({ queryKey, exact: true })?.queryHash
    : undefined;
}
export function observeOrdersConnection(filters: unknown) {
  record({
    phase: "onConnected",
    key: keyOf(["branch-orders", filters]),
    filters: filtersOf(filters),
  });
}
export function observeOrdersLifecycle(phase: string) {
  record({ phase });
}
queryClient.getQueryCache().subscribe((event) => {
  if (event.query.queryKey[0] !== "branch-orders") return;
  record({
    phase: "cache-" + event.type,
    key: event.query.queryHash,
    queryStatus: event.query.state.status,
    fetchStatus: event.query.state.fetchStatus,
    dataUpdatedAt: event.query.state.dataUpdatedAt,
    observers: event.query.getObserversCount(),
    ids: ordersOf(event.query.state.data).map((x) => x.id),
  });
});
for (const name of [
  "cancelQueries",
  "invalidateQueries",
  "refetchQueries",
] as const) {
  const original = queryClient[name].bind(queryClient) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  queryClient[name] = ((...args: unknown[]) => {
    const queryKey = (args[0] as { queryKey?: readonly unknown[] } | undefined)
      ?.queryKey;
    const key = keyOf(queryKey);
    if (queryKey?.[0] === "branch-orders")
      record({ phase: name + "-start", key });
    return original(...args).then(
      (result) => {
        if (queryKey?.[0] === "branch-orders")
          record({ phase: name + "-end", key });
        return result;
      },
      (error) => {
        if (queryKey?.[0] === "branch-orders")
          record({ phase: name + "-error", key });
        throw error;
      },
    );
  }) as (typeof queryClient)[typeof name];
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    globalThis.location?.origin ?? "http://test.invalid",
  );
  if (url.pathname !== "/api/sales/orders") return originalFetch(input, init);
  const id = "orders-" + ++requestSequence;
  record({
    phase: "http-start",
    id,
    filters: filtersOf(Object.fromEntries(url.searchParams)),
  });
  try {
    const response = await originalFetch(input, init);
    record({ phase: "http-headers", id, status: response.status });
    const json = response.json.bind(response);
    Reflect.set(response, "json", () =>
      json().then(
        (body) => {
          const orders = ordersOf(body);
          record({
            phase: "http-json-complete",
            id,
            ids: orders.map((x) => x.id),
            locations: orders.map((x) => x.location?.id ?? ""),
          });
          return body;
        },
        (error) => {
          record({ phase: "http-json-error", id });
          throw error;
        },
      ),
    );
    return response;
  } catch (error) {
    record({ phase: "http-error", id });
    throw error;
  }
};
function snapshot(): RecoverySnapshot {
  return {
    events: [...events],
    cache: cache(),
    visible: readVisibleSaleNumbers(document),
    selectedLocationId:
      document.querySelector<HTMLSelectElement>("select")?.value ?? "",
    pageClosed: false,
    browserConnected: true,
  };
}
Object.assign(globalThis, {
  __pedidosRecovery: {
    snapshot,
    mark: (phase: string) => record({ phase }),
    probeRead: () => {
      void queryClient.refetchQueries({
        queryKey: ["branch-orders"],
        type: "active",
      });
    },
  },
});

const observedManagers = new WeakSet<object>();
export function observeOrdersSocket(candidate: unknown) {
  const socket = candidate as {
    io: { on(event: string, listener: () => void): unknown };
  };
  if (observedManagers.has(socket.io)) return;
  observedManagers.add(socket.io);
  socket.io.on("open", () => record({ phase: "transport-open" }));
  socket.io.on("close", () => record({ phase: "transport-close" }));
}
