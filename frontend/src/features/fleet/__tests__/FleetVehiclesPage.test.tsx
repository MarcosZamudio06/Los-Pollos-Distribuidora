// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetVehiclesPage } from "../pages/FleetVehiclesPage";

const state = vi.hoisted(() => ({
  create: { isPending: false, mutateAsync: vi.fn() },
  update: { isPending: false, mutateAsync: vi.fn() },
  vehicles: {
    data: {
      items: [
        {
          id: "vehicle-1",
          code: "UNIDAD-01",
          displayName: "Reparto Centro",
          plateNumber: "ABC-123",
          homeLocationId: "location-1",
          isActive: true,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null,
  },
}));

vi.mock("../../auth", () => ({
  PERMISSIONS: { fleetManage: "fleet.manage" },
  useAuth: () => ({ accessToken: "token", user: { permissions: ["fleet.manage"] } }),
}));

vi.mock("../hooks", () => ({
  useFleetOrigins: () => ({
    data: [{ id: "location-1", name: "CEDIS Veracruz", isActive: true }],
  }),
}));

vi.mock("../vehicleHooks", () => ({
  useCreateVehicle: () => state.create,
  useUpdateVehicle: () => state.update,
  useVehicles: () => state.vehicles,
}));

function setNativeValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
}

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<FleetVehiclesPage />));
  return { container, root };
}

describe("FleetVehiclesPage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    state.create.mutateAsync.mockReset();
    state.update.mutateAsync.mockReset();
    state.create.mutateAsync.mockResolvedValue({});
    state.update.mutateAsync.mockResolvedValue({});
  });

  it("shows the vehicle directory and opens a visual registration form", async () => {
    const { container, root } = await renderPage();

    try {
      expect(container.textContent).toContain("Unidades de entrega");
      expect(container.textContent).toContain("UNIDAD-01");
      expect(container.textContent).toContain("CEDIS Veracruz");

      const newButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Nueva unidad"),
      );
      expect(newButton).toBeTruthy();

      await act(async () => newButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(container.textContent).toContain("Registrar unidad");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("sends the registration payload from the visual form", async () => {
    const { container, root } = await renderPage();

    try {
      const newButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Nueva unidad"),
      );
      await act(async () => newButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

      const inputs = Array.from(container.querySelectorAll("input"));
      const code = inputs.find((input) => input.name === "code");
      const displayName = inputs.find((input) => input.name === "displayName");
      if (!code || !displayName) throw new Error("Vehicle form inputs not found");

      await act(async () => {
        setNativeValue(code, "UNIDAD-02");
        code.dispatchEvent(new Event("input", { bubbles: true }));
        setNativeValue(displayName, "Reparto Norte");
        displayName.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const submit = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Registrar unidad"),
      );
      expect(submit).toBeTruthy();
      await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

      expect(state.create.mutateAsync).toHaveBeenCalledWith({
        code: "UNIDAD-02",
        displayName: "Reparto Norte",
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("sends changed fields from the edit form to PATCH", async () => {
    const { container, root } = await renderPage();

    try {
      const editButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Editar"),
      );
      expect(editButton).toBeTruthy();
      await act(async () =>
        editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );

      const plate = container.querySelector('input[name="plateNumber"]');
      if (!(plate instanceof HTMLInputElement))
        throw new Error("Vehicle plate input not found");
      await act(async () => {
        setNativeValue(plate, "XYZ-987");
        plate.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const submit = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Guardar cambios"),
      );
      expect(submit).toBeTruthy();
      await act(async () =>
        submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );

      expect(state.update.mutateAsync).toHaveBeenCalledWith({
        plateNumber: "XYZ-987",
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
