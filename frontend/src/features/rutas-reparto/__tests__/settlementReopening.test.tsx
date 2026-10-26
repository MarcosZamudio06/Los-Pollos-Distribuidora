// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReopenRouteSettlementDialog } from "../components/ReopenRouteSettlementDialog";
import { RouteSettlementView } from "../pages/RouteSettlementView";
import { ApiClientError } from "../../../lib/api";
import type { RouteSettlementDetail } from "../types";
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  role: "ADMIN",
  status: "CLOSED",
}));
vi.mock("../../auth", () => ({
  useAuth: () => ({ user: { role: mocks.role } }),
}));
vi.mock("../hooks", () => ({
  useReopenRouteSettlement: () => ({
    mutateAsync: mocks.mutate,
    isPending: false,
  }),
  useRouteSettlement: () => ({
    data: {
      id: "s",
      routeId: "r",
      version: 2,
      status: mocks.status,
      orders: [],
      payments: [],
    },
    refetch: vi.fn(),
  }),
  useCloseRouteSettlement: () => ({ mutateAsync: vi.fn() }),
  useOpenRouteSettlement: () => ({ mutateAsync: vi.fn() }),
}));
let root: Root;
let container: HTMLDivElement;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.role = "ADMIN";
  mocks.status = "CLOSED";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(el: ReactElement) {
  await act(async () => root.render(el));
}
function button(label: string) {
  const b = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );
  if (!b) throw new Error("Missing " + label);
  return b;
}
async function reason(value: string) {
  const i = document.querySelector("input")!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(i, value);
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const refresh = vi.fn(
  async () => ({ status: "CLOSED", version: 4 }) as RouteSettlementDetail,
);
function dialog(done = vi.fn()) {
  return (
    <ReopenRouteSettlementDialog
      settlementId="s"
      version={2}
      onClose={vi.fn()}
      onReopened={done}
      onRefresh={refresh}
    />
  );
}
it("requires trimmed reason, sends exact version and key and prevents double confirmation", async () => {
  let resolve!: () => void;
  mocks.mutate.mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const done = vi.fn();
  await render(dialog(done));
  expect(button("Confirmar reapertura").disabled).toBe(true);
  await reason("  ");
  expect(button("Confirmar reapertura").disabled).toBe(true);
  await reason(" Review correction ");
  await act(async () => {
    button("Confirmar reapertura").click();
    button("Confirmar reapertura").click();
  });
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
    payload: { reason: "Review correction", expectedVersion: 2 },
    idempotencyKey: expect.any(String),
  });
  await act(async () => resolve());
  expect(done).toHaveBeenCalledOnce();
  expect(document.querySelector("h2")?.className).toContain("text-white");
});
it("retries lost responses with the same frozen payload/key, without editing the command", async () => {
  mocks.mutate
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({});
  await render(dialog());
  await reason("Review");
  await act(async () => button("Confirmar reapertura").click());
  expect(document.querySelector("input")?.disabled).toBe(true);
  await act(async () => button("Confirmar reapertura").click());
  expect(mocks.mutate.mock.calls[1][0]).toEqual(mocks.mutate.mock.calls[0][0]);
});
it("requires explicit authority refresh for 409 and creates a new versioned command, never a changed replay", async () => {
  mocks.mutate
    .mockRejectedValueOnce(new ApiClientError("stale version", 409, null))
    .mockResolvedValueOnce({});
  await render(dialog());
  await reason("Review");
  await act(async () => button("Confirmar reapertura").click());
  expect(button("Confirmar reapertura").disabled).toBe(true);
  await act(async () => button("Consultar estado actual").click());
  await act(async () => button("Confirmar reapertura").click());
  const [a, b] = mocks.mutate.mock.calls.map(
    (c) =>
      c[0] as { payload: { expectedVersion: number }; idempotencyKey: string },
  );
  expect(a.payload.expectedVersion).toBe(2);
  expect(b.payload.expectedVersion).toBe(4);
  expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
});
it("keeps authorization errors visible without pretending the transition succeeded", async () => {
  const done = vi.fn();
  mocks.mutate.mockRejectedValue(
    new ApiClientError("Only ADMIN can reopen a settlement", 403, null),
  );
  await render(dialog(done));
  await reason("Review");
  await act(async () => button("Confirmar reapertura").click());
  expect(document.body.textContent).toContain("Only ADMIN");
  expect(done).not.toHaveBeenCalled();
});
it.each(["COLLECTIONS", "DRIVER", "SELLER", "WAREHOUSE", "BILLING"])(
  "does not expose reopening to %s",
  async (role) => {
    mocks.role = role;
    await render(
      <MemoryRouter initialEntries={["/route-settlements/s"]}>
        <Routes>
          <Route
            path="/route-settlements/:settlementId"
            element={<RouteSettlementView />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Reabrir liquidación",
      ),
    ).toBe(false);
  },
);
it("ADMIN sees reopening only for CLOSED", async () => {
  const view = (
    <MemoryRouter initialEntries={["/route-settlements/s"]}>
      <Routes>
        <Route
          path="/route-settlements/:settlementId"
          element={<RouteSettlementView />}
        />
      </Routes>
    </MemoryRouter>
  );
  await render(view);
  expect(button("Reabrir liquidación")).toBeTruthy();
  mocks.status = "OPEN";
  await render(<div>{view}</div>);
  expect(
    Array.from(document.querySelectorAll("button")).some(
      (b) => b.textContent === "Reabrir liquidación",
    ),
  ).toBe(false);
});
