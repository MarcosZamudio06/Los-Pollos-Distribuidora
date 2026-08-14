// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CedisBranchReturnsPage } from "../CedisBranchReturnsPage";

vi.mock("../../inventario/components/BranchReturnsView", () => ({
  BranchReturnsView: () => (
    <section>
      <h2>Devoluciones a CEDIS</h2>
      <p>La vista cambia según la ubicación operativa.</p>
    </section>
  ),
}));

describe("CedisBranchReturnsPage", () => {
  it("delega la vista de devoluciones a la ubicación operativa", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/cedis/returns"]}>
        <CedisBranchReturnsPage />
      </MemoryRouter>,
    );

    expect(html).toContain("Devoluciones a CEDIS");
    expect(html).toContain("La vista cambia según la ubicación operativa");
  });
});
