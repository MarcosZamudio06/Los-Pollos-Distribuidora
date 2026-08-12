// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RouteLoadErrorBoundary,
  RouteLoadingFallback,
} from "../routeLoadingState";
import { createLazyRoute } from "../routeLoaders";

describe("route loading infrastructure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an accessible loading fallback for deferred routes", () => {
    const html = renderToStaticMarkup(<RouteLoadingFallback />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Cargando módulo");
    expect(html).toContain("aria-live=\"polite\"");
  });

  it("preloads the same module used by the lazy route component", async () => {
    const importer = vi.fn(async () => ({
      DemoPage: () => <div>Demo</div>,
    }));
    const route = createLazyRoute(importer, "DemoPage");

    await route.preload();

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable error state when a route chunk cannot load", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return undefined;
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    function BrokenRoute(): never {
      throw new Error("chunk unavailable");
    }

    await act(async () => {
      root.render(
        <RouteLoadErrorBoundary>
          <BrokenRoute />
        </RouteLoadErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("No se pudo cargar el módulo");
    expect(container.querySelector("button")?.textContent).toContain(
      "Reintentar",
    );
    expect(consoleError).toHaveBeenCalled();

    root.unmount();
  });
});
