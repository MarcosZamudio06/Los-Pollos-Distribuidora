// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteLocationTrackingControl } from "../components/RouteLocationTrackingControl";
import type {
  RouteLocationTrackingResult,
} from "../useRouteLocationTracking";

function tracking(
  overrides: Partial<RouteLocationTrackingResult> = {},
): RouteLocationTrackingResult {
  return {
    canStart: true,
    errorMessage: null,
    isEligible: true,
    isTracking: false,
    lastPosition: null,
    lastPublishedAt: null,
    lastPublishedPosition: null,
    start: vi.fn(),
    status: "stopped",
    stop: vi.fn(),
    ...overrides,
  };
}

async function renderControl(
  value: RouteLocationTrackingResult,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<RouteLocationTrackingControl tracking={value} />);
  });
  return { container, root };
}

describe("RouteLocationTrackingControl", () => {
  afterEach(() => document.body.replaceChildren());

  it("requires an explicit action and explains the active-route privacy boundary", async () => {
    const value = tracking();
    const { container, root } = await renderControl(value);

    expect(container.textContent).toContain("Iniciar seguimiento GPS");
    expect(container.textContent).toContain("Detenido");
    expect(container.textContent).toContain(
      "Tu ubicación se comparte con el equipo operativo únicamente mientras esta ruta esté activa.",
    );
    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(value.start).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("renders synchronization errors and the active status visibly", async () => {
    const { container, root } = await renderControl(
      tracking({
        errorMessage: "La ruta ya no admite seguimiento GPS.",
        isTracking: false,
        status: "sync_error",
      }),
    );

    expect(container.querySelector('[data-tracking-status="sync_error"]')).not.toBeNull();
    expect(container.textContent).toContain("Error de sincronización");
    expect(container.textContent).toContain(
      "La ruta ya no admite seguimiento GPS.",
    );
    await act(async () => root.unmount());
  });

  it("does not render a control for an ineligible route", async () => {
    const { container, root } = await renderControl(
      tracking({ isEligible: false, canStart: false }),
    );

    expect(container.textContent).toBe("");
    await act(async () => root.unmount());
  });
});
