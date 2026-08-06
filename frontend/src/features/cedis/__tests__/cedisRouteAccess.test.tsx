// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionRoute } from "../../auth/routes/PermissionRoute";
import { RoleRoute } from "../../auth/routes/RoleRoute";
import { PERMISSIONS } from "../../auth/permissions";
import { ROUTE_ACCESS_ROLES } from "../../../components/layout/routeAccess";

const mockAuth = vi.hoisted(() => ({
  user: {
    email: "admin@pollos.local",
    id: "admin-1",
    name: "Admin",
    permissions: ["cedis.view"],
    role: "ADMIN",
  },
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => mockAuth,
}));

function renderProtectedRoute() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/cedis"]}>
      <Routes>
        <Route element={<p>Forbidden</p>} path="/403" />
        <Route
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.cedis}>
              <PermissionRoute permission={PERMISSIONS.cedisView}>
                <p>CEDIS autorizado</p>
              </PermissionRoute>
            </RoleRoute>
          }
          path="/cedis"
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderIncomingRoute() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/cedis/incoming"]}>
      <Routes>
        <Route element={<p>Forbidden</p>} path="/403" />
        <Route
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.cedisIncoming}>
              <PermissionRoute permission={PERMISSIONS.cedisReceiveSupplies}>
                <p>Recepción autorizada</p>
              </PermissionRoute>
            </RoleRoute>
          }
          path="/cedis/incoming"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CEDIS protected route", () => {
  beforeEach(() => {
    mockAuth.user = {
      email: "admin@pollos.local",
      id: "admin-1",
      name: "Admin",
      permissions: [PERMISSIONS.cedisView],
      role: "ADMIN",
    };
  });

  it("permite el acceso cuando coinciden rol y permiso", () => {
    expect(renderProtectedRoute()).toContain("CEDIS autorizado");
  });

  it("rechaza un rol que no pertenece al alcance CEDIS", () => {
    mockAuth.user = {
      email: "driver@pollos.local",
      id: "driver-1",
      name: "Reparto",
      permissions: [PERMISSIONS.cedisView],
      role: "DRIVER",
    };

    expect(renderProtectedRoute()).not.toContain("CEDIS autorizado");
  });

  it("rechaza un rol permitido sin cedis.view", () => {
    mockAuth.user = {
      email: "seller@pollos.local",
      id: "seller-1",
      name: "Ventas",
      permissions: [],
      role: "SELLER",
    };

    expect(renderProtectedRoute()).not.toContain("CEDIS autorizado");
  });

  it("permite a SELLER entrar a recepción con cedis.receive_supplies", () => {
    mockAuth.user = {
      email: "seller@pollos.local",
      id: "seller-1",
      name: "Vendedor",
      permissions: [PERMISSIONS.cedisReceiveSupplies],
      role: "SELLER",
    };

    expect(renderIncomingRoute()).toContain("Recepción autorizada");
  });
});
