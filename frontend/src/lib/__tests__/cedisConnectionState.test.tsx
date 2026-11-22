// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { CedisIncomingSuppliesPage } from "../../features/cedis/CedisIncomingSuppliesPage";
const state = vi.hoisted(() => ({
  listener: null as null | ((s: string) => void),
}));
vi.mock("../../features/auth", () => ({
  useAuth: () => ({
    accessToken: "fixture",
    user: { role: "SELLER", operationalLocationId: "branch" },
  }),
}));
vi.mock("../../features/cedis/hooks", () => ({
  useCedisIncomingSupplies: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
  }),
  useCedisIncomingSupply: () => ({}),
  useReceiveCedisSupply: () => ({ isPending: false }),
}));
vi.mock("../cedisSocket", () => ({
  cedisSocket: {
    subscribe: (
      _t: unknown,
      _l: unknown,
      _created: unknown,
      _connected: unknown,
      handlers: { onConnectionState: (s: string) => void },
    ) => {
      state.listener = handlers?.onConnectionState;
      return () => {};
    },
  },
}));
it("shows accessible actual-page connection and stale-data feedback without dropping REST data", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const client = new QueryClient();
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <CedisIncomingSuppliesPage />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
    const status = () =>
      node.querySelector(
        '[role="status"][aria-label="Estado de conexión CEDIS"]',
      );
    expect(status()).not.toBeNull();
    expect(status()?.textContent).toContain("Conectando");
    for (const [s, label] of [
      ["connected", "Conectado"],
      ["reconnecting", "Reconectando"],
      ["disconnected", "Desconectado"],
      ["error", "Error de conexión"],
    ]) {
      await act(async () => state.listener?.(s));
      expect(status()?.textContent).toContain(label);
    }
    expect(status()?.textContent).toContain("notificaciones");
    expect(node.textContent).toContain("No hay envíos pendientes");
  } finally {
    act(() => root.unmount());
    client.clear();
    node.remove();
  }
});
