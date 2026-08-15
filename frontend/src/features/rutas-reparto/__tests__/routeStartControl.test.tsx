// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteStartControl } from "../components/RouteStartControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
});

async function renderControl(
  overrides: Partial<ComponentProps<typeof RouteStartControl>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <RouteStartControl
        hasVehicle
        isStarting={false}
        onStart={vi.fn()}
        routeName="Ruta Centro"
        vehicleName="Unidad 1"
        {...overrides}
      />,
    ),
  );
  return container;
}

describe("RouteStartControl", () => {
  it("requires confirmation before starting a pending route", async () => {
    const onStart = vi.fn();
    const container = await renderControl({ onStart });

    expect(container.textContent).toContain("Iniciar ruta");
    const trigger = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Iniciar ruta",
    );

    await act(async () => trigger?.click());

    expect(document.body.textContent).toContain("¿Iniciar esta ruta?");
    expect(onStart).not.toHaveBeenCalled();

    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Confirmar inicio",
    );
    await act(async () => confirm?.click());

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("explains when a pending route cannot start without a vehicle", async () => {
    const container = await renderControl({
      hasVehicle: false,
      vehicleName: null,
    });

    expect(container.textContent).toContain("No puedes iniciar esta ruta");
    expect(container.textContent).toContain("unidad asignada");
    expect(container.textContent).not.toContain("Confirmar inicio");
  });
});
