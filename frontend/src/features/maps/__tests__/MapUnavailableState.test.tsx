// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapUnavailableState } from "../MapUnavailableState";

describe("MapUnavailableState", () => {
  it("explains a WebGL failure and exposes a retry action", () => {
    const html = renderToStaticMarkup(
      <MapUnavailableState
        onRetry={() => undefined}
        reason="webgl"
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Mapa no disponible");
    expect(html).toContain("WebGL");
    expect(html).toContain("Reintentar");
    expect(html).toContain("text-white");
  });

  it("renders a quiet loading state without a retry action", () => {
    const html = renderToStaticMarkup(
      <MapUnavailableState reason="loading" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Cargando mapa");
    expect(html).not.toContain("Reintentar");
  });
});
