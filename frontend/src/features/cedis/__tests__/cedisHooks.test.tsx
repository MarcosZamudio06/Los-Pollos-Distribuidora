// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateCedisSupply } from "../hooks";

const serviceMocks = vi.hoisted(() => ({
  createSupply: vi.fn(),
  createReturn: vi.fn(),
  refreshCycle: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  accessToken: "access-token",
  user: { id: "warehouse-1", role: "WAREHOUSE" },
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../cedisService", () => ({
  cedisService: serviceMocks,
}));

function Harness({ onReady }: { onReady: (run: () => Promise<unknown>) => void }) {
  const mutation = useCreateCedisSupply("cycle-1");
  onReady(() =>
    mutation.mutateAsync({
      expectedVersion: 2,
      items: [{ productId: "product-1", quantityKg: 5, unit: "KG" }],
    }),
  );
  return null;
}

describe("CEDIS mutation invalidation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    serviceMocks.createSupply.mockResolvedValue({ id: "transfer-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("invalida dashboard CEDIS y consultas dependientes después de abastecer", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
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
      await run?.();
    });

    expect(serviceMocks.createSupply).toHaveBeenCalledWith(
      "cycle-1",
      expect.objectContaining({ expectedVersion: 2 }),
      "access-token",
      expect.any(String),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["cedis"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["inventory-balances"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["reports"],
    });
  });
});
