// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { PedidosPage } from "../../features/pedidos/PedidosPage";
import { CedisIncomingSuppliesPage } from "../../features/cedis/CedisIncomingSuppliesPage";
const state = vi.hoisted(() => ({
  read: vi.fn(),
  connected: null as null | (() => void),
  key: [] as readonly unknown[],
}));
vi.mock("../../features/auth", () => ({
  useAuth: () => ({
    accessToken: "valid",
    user: {
      id: "seller",
      role: "SELLER",
      operationalLocationId: "branch",
      permissions: ["cedis.receive_supplies"],
    },
  }),
}));
vi.mock("../../features/compras/hooks", () => ({
  usePurchaseLocations: () => ({ data: [] }),
}));
vi.mock("../../features/pedidos/hooks", () => ({
  useBranchOrders: (filters: unknown) => {
    state.key = ["branch-orders", filters];
    return useQuery({ queryKey: state.key, queryFn: state.read });
  },
}));
vi.mock("../../features/cedis/hooks", () => ({
  useCedisIncomingSupplies: (filters: unknown) => {
    state.key = ["cedis", "incoming-supplies", filters];
    return useQuery({ queryKey: state.key, queryFn: state.read });
  },
  useCedisIncomingSupply: () => ({}),
  useReceiveCedisSupply: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("../salesSocket", () => ({
  salesSocket: {
    subscribe: (_t: unknown, _l: unknown, h: { onConnected: () => void }) => {
      state.connected = h.onConnected;
      return () => {};
    },
  },
}));
vi.mock("../cedisSocket", () => ({
  cedisSocket: {
    subscribe: (
      _t: unknown,
      _l: unknown,
      _h: unknown,
      onConnected: () => void,
    ) => {
      state.connected = onConnected;
      return () => {};
    },
  },
}));
describe("REV-005 actual page connect callbacks with active QueryClient", () => {
  it.each([
    ["Sales", PedidosPage],
    ["CEDIS", CedisIncomingSuppliesPage],
  ] as const)(
    "%s discards an initial stale REST response and starts a new read",
    async (_name, Page) => {
      let finish!: (v: unknown) => void;
      state.connected = null;
      state.read
        .mockReset()
        .mockResolvedValue({ items: [], generation: "new", total: 0 })
        .mockImplementationOnce(() => new Promise((r) => (finish = r)));
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      try {
        await act(async () =>
          root.render(
            <MemoryRouter>
              <QueryClientProvider client={client}>
                <Page />
              </QueryClientProvider>
            </MemoryRouter>,
          ),
        );
        expect(state.read).toHaveBeenCalledTimes(1);
        expect(state.connected).not.toBeNull();
        await act(async () => {
          state.connected?.();
          await Promise.resolve();
        });
        await act(async () =>
          finish({ items: [], generation: "old", total: 0 }),
        );
        await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
        expect(client.getQueryData(state.key)).toMatchObject({
          generation: "new",
        });
      } finally {
        act(() => root.unmount());
        client.clear();
        host.remove();
      }
    },
  );
});
