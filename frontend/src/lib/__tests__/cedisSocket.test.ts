import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ socket: null as unknown }));
vi.mock("socket.io-client", () => ({ io: () => state.socket }));
describe("CEDIS connection lifecycle", () => {
  it("reports connection states and symmetrically removes all subscription handlers", async () => {
    vi.resetModules();
    type Handler = (...args: unknown[]) => void;
    const callbacks = new Map<string, Set<Handler>>(),
      manager = new Map<string, Set<Handler>>();
    const add = (m: Map<string, Set<Handler>>, event: string, fn: Handler) => {
      if (!m.has(event)) m.set(event, new Set());
      m.get(event)!.add(fn);
    };
    const socket = {
      auth: {},
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: (e: string, f: Handler) => add(callbacks, e, f),
      off: (e: string, f: Handler) => callbacks.get(e)?.delete(f),
      io: {
        on: (e: string, f: Handler) => add(manager, e, f),
        off: (e: string, f: Handler) => manager.get(e)?.delete(f),
      },
    };
    state.socket = socket;
    const { cedisSocket } = await import("../cedisSocket");
    const statuses: string[] = [];
    const received = vi.fn();
    const cleanup = cedisSocket.subscribe(
      "fixture",
      "branch",
      vi.fn(),
      vi.fn(),
      {
        onConnectionState: (s) => statuses.push(s),
        onSupplyReceived: received,
      },
    );
    const fire = (event: string, ...args: unknown[]) => {
      for (const fn of callbacks.get(event) ?? []) fn(...args);
    };
    expect(statuses).toEqual(["connecting"]);
    fire("connect_error", new Error("generic"));
    expect(statuses.at(-1)).toBe("error");
    fire("connect");
    expect(statuses.at(-1)).toBe("connected");
    for (const fn of manager.get("reconnect_attempt") ?? []) fn();
    expect(statuses.at(-1)).toBe("reconnecting");
    fire("disconnect", "transport close");
    expect(statuses.at(-1)).toBe("disconnected");
    fire("cedis.supply.received", { transferId: "fixture" });
    expect(received).toHaveBeenCalledTimes(1);
    cleanup();
    expect([...callbacks.values()].every((s) => s.size === 0)).toBe(true);
    expect([...manager.values()].every((s) => s.size === 0)).toBe(true);
  });
});
