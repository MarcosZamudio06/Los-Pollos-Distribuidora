// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateDeliveryStatusDialog } from "../components/UpdateDeliveryStatusDialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  error: null as Error | null,
  mutateAsync: vi.fn(),
}));

vi.mock("../hooks", () => ({
  useUpdateDeliveryOrderStatus: () => ({
    error: mockState.error,
    isPending: false,
    mutateAsync: mockState.mutateAsync,
  }),
}));

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
  mockState.error = null;
  mockState.mutateAsync.mockReset();
});

describe("UpdateDeliveryStatusDialog", () => {
  it("shows the backend reason when delivery status is rejected", async () => {
    mockState.error = new Error("DELIVERED requires PHOTO evidence");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <UpdateDeliveryStatusDialog
          onClose={vi.fn()}
          order={{ id: "order-1", status: "IN_ROUTE" }}
          routeId="route-1"
        />,
      );
    });

    expect(container.textContent).toContain(
      "DELIVERED requires PHOTO evidence",
    );
  });
});
