// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTE_ACCESS_ROLES } from "../../../components/layout/routeAccess";
import { RoleRoute } from "../../auth/routes/RoleRoute";

const mockAuth = vi.hoisted(() => ({
  user: {
    email: "driver@pollos.local",
    id: "driver-1",
    name: "Reparto",
    role: "DRIVER",
  },
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => mockAuth,
}));

function renderNavigationRoute() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
      <Routes>
        <Route element={<p>Forbidden</p>} path="/403" />
        <Route
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.driverNavigation}>
              <p>Navegación autorizada</p>
            </RoleRoute>
          }
          path="/my-routes/:routeId/navigation"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("driver navigation route access", () => {
  beforeEach(() => {
    mockAuth.user = {
      email: "driver@pollos.local",
      id: "driver-1",
      name: "Reparto",
      role: "DRIVER",
    };
  });

  it("allows DRIVER and rejects ADMIN for the DRIVER-only route", () => {
    expect(renderNavigationRoute()).toContain("Navegación autorizada");

    mockAuth.user.role = "ADMIN";
    expect(renderNavigationRoute()).not.toContain("Navegación autorizada");
  });
});
