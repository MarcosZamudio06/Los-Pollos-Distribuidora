// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CedisBranchReturnsPage } from "../CedisBranchReturnsPage";

vi.mock("../../inventario/components/BranchReturnsView", () => ({
  BranchReturnsView: () => (
    <section>
      <h2>Formulario de devoluciones a CEDIS</h2>
      <p>La devolución se registra en la sucursal.</p>
    </section>
  ),
}));

describe("CedisBranchReturnsPage", () => {
  it("presenta el formulario y no una cola de devoluciones", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/cedis/returns"]}>
        <CedisBranchReturnsPage />
      </MemoryRouter>,
    );

    expect(html).toContain("Formulario de devoluciones a CEDIS");
    expect(html).toContain("La devolución se registra en la sucursal");
    expect(html).not.toContain("cola");
    expect(html).not.toContain("Devoluciones pendientes");
  });
});
