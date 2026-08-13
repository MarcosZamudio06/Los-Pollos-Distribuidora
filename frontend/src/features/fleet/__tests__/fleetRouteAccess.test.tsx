// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionRoute } from "../../auth/routes/PermissionRoute";
import { RoleRoute } from "../../auth/routes/RoleRoute";
import { PERMISSIONS } from "../../auth/permissions";
import { ROUTE_ACCESS_ROLES } from "../../../components/layout/routeAccess";

const auth = vi.hoisted(() => ({
  user: {
    id: "admin-1",
    name: "Admin",
    email: "admin@pollos.local",
    role: "ADMIN",
    permissions: ["fleet.view"],
  },
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => auth,
}));

function renderFleetAccess() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/delivery-routes/live"]}>
      <Routes>
        <Route element={<p>Forbidden</p>} path="/403" />
        <Route
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.fleetLive}>
              <PermissionRoute permission={PERMISSIONS.fleetView}>
                <p>Fleet autorizado</p>
              </PermissionRoute>
            </RoleRoute>
          }
          path="/delivery-routes/live"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("fleet live route access", () => {
  beforeEach(() => {
    auth.user = {
      id: "admin-1",
      name: "Admin",
      email: "admin@pollos.local",
      role: "ADMIN",
      permissions: [PERMISSIONS.fleetView],
    };
  });

  it("requires ADMIN and fleet.view", () => {
    expect(renderFleetAccess()).toContain("Fleet autorizado");

    auth.user = { ...auth.user, permissions: [] };
    expect(renderFleetAccess()).not.toContain("Fleet autorizado");

    auth.user = {
      ...auth.user,
      role: "DRIVER",
      permissions: [PERMISSIONS.fleetView],
    };
    expect(renderFleetAccess()).not.toContain("Fleet autorizado");
  });
});
