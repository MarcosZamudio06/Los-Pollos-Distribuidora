// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../../lib/api";
import { CedisBranchCreatePage } from "../CedisBranchCreatePage";
import {
  buildCreateBranchLocationPayload,
  emptyBranchLocationFormValues,
  getBranchLocationSubmitError,
  validateBranchLocation,
} from "../branchLocationValidation";
import type { BranchLocationFormValues } from "../branchLocationValidation";

const hookMocks = vi.hoisted(() => ({
  locations: {
    data: [
      {
        id: "cedis-1",
        name: "CEDIS Centro",
        code: "C01",
        type: "DISTRIBUTION_CENTER",
        isActive: true,
      },
    ],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  mutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock("../hooks", () => ({
  useCedisLocations: () => hookMocks.locations,
  useCreateBranchLocation: () => hookMocks.mutation,
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ accessToken: "test-access-token" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

function renderPage() {
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.appendChild(container);

  return { container, root };
}

async function renderCreatePage(root: Root) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/admin/locations/branches/new"]}>
        <CedisBranchCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

async function setField(
  container: HTMLDivElement,
  id: string,
  value: string,
) {
  const field = container.querySelector(`#${id}`);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
    throw new Error(`Field #${id} was not rendered.`);
  }

  await act(async () => {
    const prototype =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm(container: HTMLDivElement) {
  const form = container.querySelector("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("Form not rendered.");

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function validFormValues(): BranchLocationFormValues {
  return {
    ...emptyBranchLocationFormValues,
    name: "  Sucursal Centro  ",
    code: "  S01  ",
    parentId: "cedis-1",
    address: "  Av. Centro 10  ",
    latitude: "19.432608",
    longitude: "-96.1342",
  };
}

describe("branch location validation", () => {
  it("requires the branch identity, CEDIS parent, and coordinate pair", () => {
    expect(validateBranchLocation(emptyBranchLocationFormValues)).toEqual({
      name: "El nombre de la sucursal es obligatorio.",
      parentId: "Selecciona un CEDIS activo.",
    });

    expect(
      validateBranchLocation({
        ...emptyBranchLocationFormValues,
        name: "Sucursal Centro",
        parentId: "cedis-1",
        latitude: "19.4",
      }),
    ).toEqual({
      coordinates: "Latitud y longitud deben capturarse juntas.",
    });
  });

  it("mirrors backend coordinate ranges and builds a BRANCH payload", () => {
    expect(
      validateBranchLocation({
        ...validFormValues(),
        latitude: "90.001",
      }),
    ).toEqual({ latitude: "La latitud debe estar entre -90 y 90." });

    expect(buildCreateBranchLocationPayload(validFormValues())).toEqual({
      name: "Sucursal Centro",
      code: "S01",
      type: "BRANCH",
      parentId: "cedis-1",
      address: "Av. Centro 10",
      latitude: 19.432608,
      longitude: -96.1342,
    });

    expect(
      buildCreateBranchLocationPayload({
        ...emptyBranchLocationFormValues,
        name: "Sucursal sin mapa",
        parentId: "cedis-1",
      }),
    ).toEqual({
      name: "Sucursal sin mapa",
      type: "BRANCH",
      parentId: "cedis-1",
    });
  });

  it.each([
    [400, "Revisa el nombre, la jerarquía y las coordenadas de la sucursal."],
    [403, "No tienes permiso para crear sucursales."],
    [404, "El CEDIS seleccionado ya no está disponible."],
    [409, "El código de sucursal ya está registrado."],
  ])("traduce HTTP %s a un estado operativo", (statusCode, message) => {
    expect(
      getBranchLocationSubmitError(
        new ApiClientError("request failed", statusCode, { statusCode }),
      ),
    ).toBe(message);
  });
});

describe("CedisBranchCreatePage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hookMocks.locations.data = [
      {
        id: "cedis-1",
        name: "CEDIS Centro",
        code: "C01",
        type: "DISTRIBUTION_CENTER",
        isActive: true,
      },
    ];
    hookMocks.locations.error = null;
    hookMocks.locations.isLoading = false;
    hookMocks.mutation.isPending = false;
    hookMocks.mutation.mutateAsync.mockReset();
    hookMocks.mutation.mutateAsync.mockResolvedValue({
      id: "branch-1",
      name: "Sucursal Centro",
      parentId: "cedis-1",
      type: "BRANCH",
    });
    ({ container, root } = renderPage());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("presenta la relación CEDIS → sucursal y deja disponible la captura manual", async () => {
    await renderCreatePage(root);

    expect(container.textContent).toContain("Nueva sucursal");
    expect(container.textContent).toContain("CEDIS Centro");
    expect(container.textContent).toContain("CEDIS → sucursal");
    expect(container.textContent).toContain("Captura manual disponible");
    expect(container.querySelector("#branch-address")).not.toBeNull();
    expect(container.querySelector("#branch-latitude")).not.toBeNull();
    expect(container.querySelector("#branch-longitude")).not.toBeNull();
  });

  it("bloquea un envío incompleto sin llamar al alta", async () => {
    await renderCreatePage(root);
    await submitForm(container);

    expect(hookMocks.mutation.mutateAsync).not.toHaveBeenCalled();
    expect(container.textContent).toContain("El nombre de la sucursal es obligatorio.");
    expect(container.textContent).toContain("Selecciona un CEDIS activo.");
  });

  it("envía type=BRANCH y navega al tablero después de crear", async () => {
    await renderCreatePage(root);
    await setField(container, "branch-name", "Sucursal Centro");
    await setField(container, "branch-code", "S01");
    await setField(container, "branch-parent-id", "cedis-1");
    await setField(container, "branch-address", "Av. Centro 10");
    await setField(container, "branch-latitude", "19.432608");
    await setField(container, "branch-longitude", "-96.1342");
    await submitForm(container);

    expect(hookMocks.mutation.mutateAsync).toHaveBeenCalledWith({
      name: "Sucursal Centro",
      code: "S01",
      type: "BRANCH",
      parentId: "cedis-1",
      address: "Av. Centro 10",
      latitude: 19.432608,
      longitude: -96.1342,
    });
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/cedis",
    );
  });

  it("presenta el conflicto de código sin perder la captura", async () => {
    hookMocks.mutation.mutateAsync.mockRejectedValueOnce(
      new ApiClientError("duplicate code", 409, { code: "LOCATION_CODE_TAKEN" }),
    );
    await renderCreatePage(root);
    await setField(container, "branch-name", "Sucursal Centro");
    await setField(container, "branch-parent-id", "cedis-1");
    await setField(container, "branch-code", "S01");
    await submitForm(container);

    expect(container.textContent).toContain("El código de sucursal ya está registrado.");
    expect((container.querySelector("#branch-name") as HTMLInputElement).value).toBe(
      "Sucursal Centro",
    );
  });
});
