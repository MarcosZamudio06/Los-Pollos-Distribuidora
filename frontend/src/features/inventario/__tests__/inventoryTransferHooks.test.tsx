// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCancelInventoryTransfer,
  useConfirmInventoryTransfer,
} from "../hooks/useProducts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const serviceMocks = vi.hoisted(() => ({
  cancelTransfer: vi.fn(),
  confirmTransfer: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  accessToken: "access-token",
  user: { id: "warehouse-1", role: "WAREHOUSE" },
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../services/productService", () => ({
  productService: serviceMocks,
}));

function ConfirmHarness({ onReady }: { onReady: (run: () => Promise<unknown>) => void }) {
  const mutation = useConfirmInventoryTransfer();
  onReady(() =>
    mutation.mutateAsync({
      id: "transfer-1",
    }),
  );
  return null;
}

function CancelHarness({ onReady }: { onReady: (run: () => Promise<unknown>) => void }) {
  const mutation = useCancelInventoryTransfer();
  onReady(() =>
    mutation.mutateAsync({
      id: "transfer-1",
      reason: "Diferencia física",
    }),
  );
  return null;
}

function expectInventoryInvalidations(
  invalidateQueries: ReturnType<typeof vi.spyOn>,
) {
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["inventory-transfers"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["inventory-balances"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["inventory-movements"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["cedis-inventory-summary"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["cedis"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["products"],
  });
}

describe("inventory transfer mutation invalidation", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;

  beforeEach(() => {
    serviceMocks.confirmTransfer.mockResolvedValue({ id: "transfer-1" });
    serviceMocks.cancelTransfer.mockResolvedValue({ id: "transfer-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("invalida CEDIS, productos y consultas de inventario al confirmar", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    let run: (() => Promise<unknown>) | undefined;
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <ConfirmHarness onReady={(callback) => (run = callback)} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await run?.();
    });

    expect(serviceMocks.confirmTransfer).toHaveBeenCalledWith(
      "transfer-1",
      "access-token",
      expect.any(String),
    );
    expectInventoryInvalidations(invalidateQueries);
  });

  it("invalida las mismas consultas al cancelar", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    let run: (() => Promise<unknown>) | undefined;
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <CancelHarness onReady={(callback) => (run = callback)} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await run?.();
    });

    expect(serviceMocks.cancelTransfer).toHaveBeenCalledWith(
      "transfer-1",
      "Diferencia física",
      "access-token",
      expect.any(String),
    );
    expectInventoryInvalidations(invalidateQueries);
  });
});
