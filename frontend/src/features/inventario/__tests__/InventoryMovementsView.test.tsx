import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  locations: {
    data: [{ id: "loc-1", name: "Centro de distribución principal" }],
    error: undefined,
    isLoading: false,
  },
  movements: {
    data: [],
    error: undefined,
    isLoading: false,
  },
}));

vi.mock("../hooks/useProducts", () => ({
  useInventoryLocations: () => mockState.locations,
  useInventoryMovements: () => mockState.movements,
}));

vi.mock("../components/AsyncState", () => ({
  AsyncState: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/shared/table-pagination", () => ({
  TablePagination: () => null,
  useTablePagination: (items: unknown[]) => ({
    pageItems: items,
    page: 1,
    pageCount: 1,
    setPage: vi.fn(),
  }),
}));

import { InventoryMovementsView } from "../components/InventoryMovementsView";

describe("InventoryMovementsView", () => {
  it("constrains the location and movement selects inside the filter grid", () => {
    const html = renderToStaticMarkup(<InventoryMovementsView />);
    const selectClasses = [
      ...html.matchAll(/<select\b[^>]*class="([^"]*)"/g),
    ].map((match) => match[1]);

    expect(html).toContain('<div class="min-w-0"><span class="grid gap-1">');
    expect(selectClasses[0]).toContain("w-full min-w-0 max-w-full");
    expect(selectClasses[1]).toContain("w-full min-w-0 max-w-full");
  });
});
