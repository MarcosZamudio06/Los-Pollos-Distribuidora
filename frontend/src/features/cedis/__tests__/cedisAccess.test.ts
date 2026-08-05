import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { ROUTE_ACCESS_ROLES } from "../../../components/layout/routeAccess";

describe("CEDIS access", () => {
  it("permite la pantalla a ADMIN, WAREHOUSE y SELLER solamente", () => {
    expect(ROUTE_ACCESS_ROLES.cedis).toEqual(["ADMIN", "WAREHOUSE", "SELLER"]);
    expect(ROUTE_ACCESS_ROLES.cedis).not.toContain("COLLECTIONS");
    expect(ROUTE_ACCESS_ROLES.cedis).not.toContain("DRIVER");
  });

  it("requiere el permiso cedis.view además del rol", () => {
    const seller = {
      email: "seller@pollos.local",
      id: "seller-1",
      name: "Vendedor",
      role: "SELLER" as const,
      permissions: [PERMISSIONS.cedisView],
    };
    const sellerWithoutPermission = { ...seller, permissions: [] };

    expect(hasPermission(seller, PERMISSIONS.cedisView)).toBe(true);
    expect(hasPermission(sellerWithoutPermission, PERMISSIONS.cedisView)).toBe(
      false,
    );
  });
});
