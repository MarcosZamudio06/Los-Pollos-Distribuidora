import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "../ReportsPage";

vi.mock("../../auth", () => ({
  useAuth: () => ({ user: { id: "seller", role: "SELLER" } }),
}));
vi.mock("../hooks", () => ({
  useSalesDailyReport: () => ({ isLoading: true }),
}));
vi.mock("../../rutas-reparto/hooks", () => ({
  useRoutePlannerCatalog: () => ({ data: [] }),
}));
vi.mock("../../../components/shared/operational-catalogs", () => ({
  CatalogSelect: () => null,
  MiniAjaxSelect: () => null,
  useOperationalCatalog: () => ({ data: [] }),
}));
afterEach(() => vi.useRealTimers());
describe("Reports initial operational date", () => {
  it("does not request the following UTC day during the Mexico City evening", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-24T02:30:00Z"));
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    );
    expect(html).toContain('value="2026-10-23"');
    expect(html).not.toContain('value="2026-10-24"');
  });
});
