// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenRouteSettlement } from "../hooks";

const serviceMocks = vi.hoisted(() => ({
  openSettlement: vi.fn(),
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({ accessToken: "access-token" }),
}));

vi.mock("../deliveryService", () => ({
  deliveryService: serviceMocks,
}));

function Harness({
  onReady,
}: {
  onReady: (run: () => Promise<unknown>) => void;
}) {
  const mutation = useOpenRouteSettlement();
  onReady(() => mutation.mutateAsync("route-1"));
  return null;
}

describe("route settlement opening idempotency", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "stable-opening-key" });
    serviceMocks.openSettlement
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ id: "settlement-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reuses the same key after a lost response instead of creating a new command", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    let run: (() => Promise<unknown>) | undefined;
    root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(callback) => (run = callback)} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await expect(run?.()).rejects.toThrow("lost response");
    });
    await act(async () => {
      await expect(run?.()).resolves.toEqual({ id: "settlement-1" });
    });

    expect(serviceMocks.openSettlement).toHaveBeenNthCalledWith(
      1,
      "route-1",
      "stable-opening-key",
      "access-token",
    );
    expect(serviceMocks.openSettlement).toHaveBeenNthCalledWith(
      2,
      "route-1",
      "stable-opening-key",
      "access-token",
    );
  });
});
