import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Response } from "@playwright/test";
import {
  createBrowserDriverOracle,
  type BrowserDriverSnapshot,
} from "../../backend/test/browser-driver-oracle";

const photoFixture = fileURLToPath(
  new URL("./fixtures/driver-delivery.png", import.meta.url),
);

const authResponse = (action: string) => (response: Response) =>
  new URL(response.url()).pathname === `/api/auth/${action}` &&
  response.request().method() === "POST";

function apiResponse(path: string, method: string) {
  return (response: Response) =>
    new URL(response.url()).pathname === path &&
    response.request().method() === method;
}

async function loginAsDriver(page: Page, email: string) {
  const refresh = page.waitForResponse(authResponse("refresh"));
  await page.goto("/login");
  expect((await refresh).status()).toBe(401);
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel(/^Contraseña/).fill(process.env.E2E_ADMIN_PASSWORD!);
  const response = page.waitForResponse(authResponse("login"));
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
}

function expectNoJourneySideEffects(
  before: BrowserDriverSnapshot,
  after: BrowserDriverSnapshot,
) {
  expect(after.paymentCount - before.paymentCount).toBe(0);
  expect(after.accountReceivableCount - before.accountReceivableCount).toBe(0);
  expect(after.incidentCount - before.incidentCount).toBe(0);
}

test("DRIVER completes one paid delivery with durable photo evidence through the real stack", async ({
  browser,
  context,
  page,
}) => {
  const oracle = await createBrowserDriverOracle();
  const { fixture } = oracle;
  try {
    const before = await oracle.snapshot();
    expect(before.routeOwnerId).toBe(fixture.driverId);
    expect(before.routeStatus).toBe("IN_PROGRESS");
    expect(before.pendingOrdersCount).toBe(1);
    expect(before.deliveryOrderCount).toBe(1);
    expect(before.deliveryOrderStatus).toBe("PENDING");
    expect(before.deliveredAt).toBeNull();
    expect(before.deliveredByUserId).toBeNull();
    expect(before.evidenceCount).toBe(0);
    expect(before.photoEvidenceCount).toBe(0);
    expect(before.paymentCount).toBe(1);
    expect(before.accountReceivableCount).toBe(0);
    expect(before.incidentCount).toBe(0);
    expect(before.positionCount).toBe(0);
    expect(before.positionAccuracyMeters).toBeNull();
    expect(before.positionRecordedAt).toBeNull();

    const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
    const geolocationAccuracy = 10;
    await context.grantPermissions(["geolocation"], {
      origin: new URL(baseURL).origin,
    });
    await context.setGeolocation({
      latitude: fixture.latitude,
      longitude: fixture.longitude,
      accuracy: geolocationAccuracy,
    });

    await loginAsDriver(page, fixture.driverEmail);
    const roleNavigation = page.getByRole("navigation", {
      name: "Accesos por rol",
    });
    await roleNavigation
      .getByRole("link", { name: "Mi ruta en mapa", exact: true })
      .click();
    await expect(page).toHaveURL(/\/my-routes$/);
    await expect(
      page.getByRole("heading", { name: "Entregas asignadas", exact: true }),
    ).toBeVisible();

    const routeSelector = page
      .getByRole("button")
      .filter({ hasText: fixture.routeName });
    await expect(routeSelector).toBeVisible();
    await routeSelector.click();
    await expect(
      page.getByRole("heading", { name: fixture.routeName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: fixture.customerName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cobro", exact: true }),
    ).toBeDisabled();

    await page
      .getByRole("link", { name: "Abrir navegación", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/my-routes/${fixture.routeId}/navigation$`),
    );
    const positionResponsePromise = page.waitForResponse(
      apiResponse("/api/fleet/positions", "POST"),
    );
    await page
      .getByRole("button", { name: "Iniciar navegación", exact: true })
      .click();
    const positionResponse = await positionResponsePromise;
    expect(positionResponse.status()).toBe(201);

    const afterPosition = await oracle.snapshot();
    expect(afterPosition.positionCount - before.positionCount).toBe(1);
    expect(afterPosition.positionCount).toBe(1);
    expect(afterPosition.positionRouteId).toBe(fixture.routeId);
    expect(afterPosition.positionVehicleId).toBe(fixture.vehicleId);
    expect(afterPosition.positionDriverId).toBe(fixture.driverId);
    expect(afterPosition.positionLatitude).toBeCloseTo(fixture.latitude, 6);
    expect(afterPosition.positionLongitude).toBeCloseTo(fixture.longitude, 6);
    expect(afterPosition.positionAccuracyMeters).toBeLessThanOrEqual(100);
    expect(afterPosition.positionRecordedAt).not.toBeNull();
    expect(
      Date.now() - Date.parse(afterPosition.positionRecordedAt!),
    ).toBeLessThan(60_000);

    const navigationStatus = page.getByRole("status", {
      name: "Instrucción de navegación",
      exact: true,
    });
    await expect(navigationStatus).toBeVisible();
    await expect(navigationStatus).not.toContainText("Sin GPS");
    await expect(navigationStatus).not.toContainText(
      "Permiso de ubicación denegado",
    );
    await expect(
      page.getByRole("button", {
        name: "Iniciar navegación",
        exact: true,
      }),
    ).toHaveCount(0);
    const openDelivery = page.getByRole("button", {
      name: "Abrir entrega",
      exact: true,
    });
    await expect(openDelivery).toBeEnabled();

    console.log(
      JSON.stringify({
        browser: `Chromium ${browser.version()}`,
        geolocationPermissionGranted: "YES",
        browserContextGeolocationConfigured: "YES",
        accuracy: geolocationAccuracy,
        iniciarNavegacionClicked: true,
        fleetPositionPostReached: true,
        fleetPositionHttpStatus: positionResponse.status(),
        vehiclePositionBefore: before.positionCount,
        vehiclePositionDelta:
          afterPosition.positionCount - before.positionCount,
        persistedIdsCorrect:
          afterPosition.positionRouteId === fixture.routeId &&
          afterPosition.positionVehicleId === fixture.vehicleId &&
          afterPosition.positionDriverId === fixture.driverId,
        uiTrackingActive: true,
        abrirEntregaEnabled: true,
      }),
    );
    await openDelivery.click();

    const operationsPanel = page.getByRole("region", {
      name: "Acciones operativas de la parada",
      exact: true,
    });
    await expect(operationsPanel).toBeVisible();
    await expect(
      operationsPanel.getByRole("heading", {
        name: fixture.customerName,
        level: 2,
        exact: true,
      }),
    ).toBeVisible();
    await operationsPanel
      .getByRole("button", { name: "Evidencia", exact: true })
      .click();
    const evidenceDialog = page.getByRole("dialog", {
      name: "Capturar evidencia",
      exact: true,
    });
    await expect(evidenceDialog).toBeVisible();
    await evidenceDialog
      .getByLabel("Foto de entrega", { exact: true })
      .setInputFiles(photoFixture);
    await expect(
      evidenceDialog.getByRole("img", {
        name: "Vista previa de la evidencia fotográfica",
        exact: true,
      }),
    ).toBeVisible();
    const createEvidenceResponse = page.waitForResponse(
      apiResponse(`/api/delivery-orders/${fixture.orderId}/evidence`, "POST"),
    );
    const storageReadbackResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === oracle.objectStorageOrigin &&
        response.request().method() === "GET" &&
        response.request().resourceType() === "image"
      );
    });
    await evidenceDialog
      .getByRole("button", { name: "Guardar evidencia", exact: true })
      .click();
    expect((await createEvidenceResponse).status()).toBe(201);
    const storageReadback = await storageReadbackResponse;
    expect(storageReadback.status()).toBe(200);
    expect(storageReadback.headers()["content-type"]).toMatch(/^image\//);
    await expect(operations.getByText("Foto", { exact: true })).toBeVisible();

    await operations
      .getByRole("button", { name: "Estado", exact: true })
      .click();
    const statusDialog = page.getByRole("dialog", {
      name: "Actualizar entrega",
      exact: true,
    });
    await statusDialog
      .getByRole("combobox", { name: "Nuevo estado", exact: true })
      .selectOption("DELIVERED");
    const deliveredResponse = page.waitForResponse(
      apiResponse(`/api/delivery-orders/${fixture.orderId}/status`, "PATCH"),
    );
    await statusDialog
      .getByRole("button", { name: "Actualizar estado", exact: true })
      .click();
    expect((await deliveredResponse).status()).toBe(200);

    await page.goBack();
    await expect(page).toHaveURL(/\/my-routes$/);
    await routeSelector.click();
    await expect(page.getByText("Entregado", { exact: true })).toBeVisible();
    const persistedPhoto = page.getByRole("img", {
      name: "Evidencia fotográfica",
      exact: true,
    });
    await expect(persistedPhoto).toBeVisible();
    const afterDelivery = await oracle.snapshot();
    expect(afterDelivery.routeStatus).toBe("IN_PROGRESS");
    expect(afterDelivery.pendingOrdersCount).toBe(0);
    expect(afterDelivery.deliveryOrderCount).toBe(1);
    expect(afterDelivery.deliveryOrderStatus).toBe("DELIVERED");
    expect(afterDelivery.deliveredAt).not.toBeNull();
    expect(afterDelivery.deliveredByUserId).toBe(fixture.driverId);
    expect(afterDelivery.evidenceCount).toBe(1);
    expect(afterDelivery.photoEvidenceCount).toBe(1);
    expect(afterDelivery.capturedByUserId).toBe(fixture.driverId);
    expect(afterDelivery.photoStorageKey).toMatch(/^evidence\//);
    expect(afterDelivery.photoMimeType).toMatch(/^image\/(?:jpeg|png|webp)$/);
    expect(afterDelivery.photoSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(afterDelivery.photoSizeBytes).toBeGreaterThan(0);
    expect(afterDelivery.photoMetadata).toEqual({
      source: "data-url",
      width: 1,
      height: 1,
    });
    expectNoJourneySideEffects(before, afterDelivery);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: fixture.routeName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Entregado", { exact: true })).toBeVisible();
    await expect(persistedPhoto).toBeVisible();
    const afterRefresh = await oracle.snapshot();
    expect(
      afterRefresh.deliveryOrderCount - afterDelivery.deliveryOrderCount,
    ).toBe(0);
    expect(afterRefresh.evidenceCount - afterDelivery.evidenceCount).toBe(0);
    expect(
      afterRefresh.photoEvidenceCount - afterDelivery.photoEvidenceCount,
    ).toBe(0);
    expectNoJourneySideEffects(afterDelivery, afterRefresh);

    const completeRouteResponse = page.waitForResponse(
      apiResponse(`/api/delivery-routes/${fixture.routeId}/status`, "PATCH"),
    );
    await page
      .getByRole("button", { name: "Terminar ruta", exact: true })
      .click();
    const completionDialog = page.getByRole("alertdialog", {
      name: "¿Terminar esta ruta?",
      exact: true,
    });
    await completionDialog
      .getByRole("button", { name: "Confirmar término", exact: true })
      .click();
    expect((await completeRouteResponse).status()).toBe(200);
    await expect(page.getByText("Completada", { exact: true })).toBeVisible();

    const completed = await oracle.snapshot();
    expect(completed.routeOwnerId).toBe(fixture.driverId);
    expect(completed.routeStatus).toBe("COMPLETED");
    expect(completed.pendingOrdersCount).toBe(0);
    expect(completed.deliveryOrderCount).toBe(1);
    expect(completed.deliveryOrderStatus).toBe("DELIVERED");
    expect(completed.deliveredAt).not.toBeNull();
    expect(completed.deliveredByUserId).toBe(fixture.driverId);
    expect(completed.photoEvidenceCount).toBe(1);
    expect(completed.capturedByUserId).toBe(fixture.driverId);
    expectNoJourneySideEffects(afterRefresh, completed);

    console.log(
      JSON.stringify({
        browser: `Chromium ${browser.version()}`,
        apiMocks: 0,
        journey: "DRIVER paid delivery with PHOTO evidence",
        routeStatus: completed.routeStatus,
        deliveryOrderStatus: completed.deliveryOrderStatus,
        deliveredBy: completed.deliveredByUserId,
        photoEvidenceCount: completed.photoEvidenceCount,
        capturedBy: completed.capturedByUserId,
        paymentDelta: completed.paymentCount - before.paymentCount,
        accountReceivableDelta:
          completed.accountReceivableCount - before.accountReceivableCount,
        incidentDelta: completed.incidentCount - before.incidentCount,
        refreshDuplicateDeltas: {
          deliveryOrders:
            afterRefresh.deliveryOrderCount - afterDelivery.deliveryOrderCount,
          evidence: afterRefresh.evidenceCount - afterDelivery.evidenceCount,
          photos:
            afterRefresh.photoEvidenceCount - afterDelivery.photoEvidenceCount,
          payments: afterRefresh.paymentCount - afterDelivery.paymentCount,
          accountReceivables:
            afterRefresh.accountReceivableCount -
            afterDelivery.accountReceivableCount,
          incidents: afterRefresh.incidentCount - afterDelivery.incidentCount,
        },
      }),
    );
  } finally {
    await oracle.disconnect();
  }
});
