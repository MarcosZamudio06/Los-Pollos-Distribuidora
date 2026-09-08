import { createHash } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import {
  createBrowserFleetOracle,
  type BrowserFleetSnapshot,
} from "../../backend/test/browser-fleet-oracle";

const FLEET_POSITION_UPDATED_EVENT = "fleet.position.updated";
const FLEET_SOCKET_PATH = "/api/socket.io";
const FLEET_SOCKET_NAMESPACE = "/fleet";
const FLEET_VEHICLES_SOURCE = "fleet-vehicles";

type PositionPublication = {
  id: string;
  vehicleId: string;
  routeId: string;
  recordedAt: string;
  receivedAt: string;
};

type AdminRuntimeEvidence = {
  liveResponses: Array<{ status: number; url: string }>;
  socketPathRequests: string[];
  socketUrls: string[];
  socketNamespaces: Set<string>;
  positionEvents: Array<Record<string, unknown>>;
  mainFrameNavigations: number;
};

const authResponse = (action: string) => (response: Response) =>
  new URL(response.url()).pathname === `/api/auth/${action}` &&
  response.request().method() === "POST";

function apiResponse(path: string, method: string) {
  return (response: Response) =>
    new URL(response.url()).pathname === path &&
    response.request().method() === method;
}

function isFleetSocketUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname === `${FLEET_SOCKET_PATH}/` ||
      parsed.pathname === FLEET_SOCKET_PATH
    );
  } catch {
    return false;
  }
}

function parseSocketPositionEvent(frame: string) {
  const namespacePrefix = `42${FLEET_SOCKET_NAMESPACE},`;
  const frameStart = frame.indexOf(namespacePrefix);
  if (frameStart < 0) return null;

  try {
    const decoded = JSON.parse(
      frame.slice(frameStart + namespacePrefix.length),
    ) as unknown;
    if (
      !Array.isArray(decoded) ||
      decoded[0] !== FLEET_POSITION_UPDATED_EVENT
    ) {
      return null;
    }
    const payload = decoded[1];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function observeAdminRuntime(page: Page): AdminRuntimeEvidence {
  const evidence: AdminRuntimeEvidence = {
    liveResponses: [],
    socketPathRequests: [],
    socketUrls: [],
    socketNamespaces: new Set<string>(),
    positionEvents: [],
    mainFrameNavigations: 0,
  };

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) evidence.mainFrameNavigations += 1;
  });
  page.on("request", (request) => {
    if (isFleetSocketUrl(request.url())) {
      evidence.socketPathRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/fleet/live") return;
    if (response.request().method() !== "GET") return;
    evidence.liveResponses.push({
      status: response.status(),
      url: response.url(),
    });
  });
  page.on("websocket", (socket) => {
    if (!isFleetSocketUrl(socket.url())) return;
    evidence.socketUrls.push(socket.url());
    socket.on("framesent", (event) => {
      const payload = event.payload;
      if (
        typeof payload === "string" &&
        payload.includes(`${FLEET_SOCKET_NAMESPACE},`)
      ) {
        evidence.socketNamespaces.add(FLEET_SOCKET_NAMESPACE);
      }
    });
    socket.on("framereceived", (event) => {
      const payload = event.payload;
      if (typeof payload !== "string") return;
      if (payload.startsWith(`40${FLEET_SOCKET_NAMESPACE}`)) {
        evidence.socketNamespaces.add(FLEET_SOCKET_NAMESPACE);
      }
      const positionEvent = parseSocketPositionEvent(payload);
      if (positionEvent) evidence.positionEvents.push(positionEvent);
    });
  });

  return evidence;
}

async function login(page: Page, email: string) {
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

function unwrapData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The browser response did not contain an object envelope");
  }
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The browser response did not contain data");
  }
  return data as Record<string, unknown>;
}

function readPositionPublication(value: unknown): PositionPublication {
  const data = unwrapData(value);
  const fields = [
    "id",
    "vehicleId",
    "routeId",
    "recordedAt",
    "receivedAt",
  ] as const;
  fields.forEach((field) => {
    if (typeof data[field] !== "string" || data[field].length === 0) {
      throw new Error(`Fleet position publication is missing ${field}`);
    }
  });
  return {
    id: data.id as string,
    vehicleId: data.vehicleId as string,
    routeId: data.routeId as string,
    recordedAt: data.recordedAt as string,
    receivedAt: data.receivedAt as string,
  };
}

function postBody(response: Response) {
  const value = response.request().postDataJSON() as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Fleet position POST did not contain a JSON body");
  }
  return value as Record<string, unknown>;
}

function browserGeolocation(position: {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}) {
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracyMeters,
  };
}

function positionFromSnapshot(snapshot: BrowserFleetSnapshot, id: string) {
  const position = snapshot.positions.find((candidate) => candidate.id === id);
  if (!position)
    throw new Error(`Persisted VehiclePosition ${id} was not found`);
  return position;
}

async function stableCanvasScreenshot(canvas: Locator) {
  let stableImage = await canvas.screenshot();
  let stableHash = createHash("sha256").update(stableImage).digest("hex");
  await expect
    .poll(
      async () => {
        const image = await canvas.screenshot();
        const currentHash = createHash("sha256").update(image).digest("hex");
        const isStable = currentHash === stableHash;
        stableHash = currentHash;
        stableImage = image;
        return isStable;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  return { hash: stableHash, image: stableImage };
}

async function waitForPositionEvent(
  evidence: AdminRuntimeEvidence,
  expected: {
    latitude: number;
    longitude: number;
    routeId: string;
    vehicleId: string;
  },
) {
  await expect
    .poll(
      () =>
        evidence.positionEvents.find(
          (event) =>
            event.routeId === expected.routeId &&
            event.vehicleId === expected.vehicleId &&
            event.latitude === expected.latitude &&
            event.longitude === expected.longitude,
        ) ?? null,
      { timeout: 10_000 },
    )
    .not.toBeNull();
  return evidence.positionEvents.find(
    (event) =>
      event.routeId === expected.routeId &&
      event.vehicleId === expected.vehicleId &&
      event.latitude === expected.latitude &&
      event.longitude === expected.longitude,
  )!;
}

function expectPositionDelta(
  before: BrowserFleetSnapshot,
  after: BrowserFleetSnapshot,
  position: { id: string; latitude: number; longitude: number },
) {
  expect(after.positionCount - before.positionCount).toBe(1);
  expect(after.latestPosition?.id).toBe(position.id);
  expect(after.latestPosition?.latitude).toBeCloseTo(position.latitude, 6);
  expect(after.latestPosition?.longitude).toBeCloseTo(position.longitude, 6);
  expect(after.latestPosition?.vehicleId).toBe(
    before.latestPosition?.vehicleId,
  );
  expect(after.latestPosition?.routeId).toBe(before.latestPosition?.routeId);
  expect(after.latestPosition?.driverId).toBe(before.latestPosition?.driverId);
}

function expectNonInterference(
  before: BrowserFleetSnapshot,
  after: BrowserFleetSnapshot,
) {
  expect(after.saleCount).toBe(before.saleCount);
  expect(after.paymentCount).toBe(before.paymentCount);
  expect(after.accountReceivableCount).toBe(before.accountReceivableCount);
  expect(after.evidenceCount).toBe(before.evidenceCount);
  expect(after.incidentCount).toBe(before.incidentCount);
}

test("DRIVER GPS reaches ADMIN MapLibre through the real Fleet Socket.IO delta", async ({
  browser,
}, testInfo: TestInfo) => {
  const oracle = await createBrowserFleetOracle();
  const { fixture } = oracle;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  let adminContext: BrowserContext | undefined;
  let driverContext: BrowserContext | undefined;

  try {
    const createdAdminContext = await browser.newContext({ baseURL });
    const createdDriverContext = await browser.newContext({ baseURL });
    adminContext = createdAdminContext;
    driverContext = createdDriverContext;
    const adminPage = await createdAdminContext.newPage();
    const driverPage = await createdDriverContext.newPage();
    const adminEvidence = observeAdminRuntime(adminPage);

    const before = await oracle.snapshot();
    expect(before.routeOwnerId).toBe(fixture.driverId);
    expect(before.routeVehicleId).toBe(fixture.vehicleId);
    expect(before.routeStatus).toBe("IN_PROGRESS");
    expect(before.positionCount).toBe(1);
    expect(before.latestPosition?.id).toBe(fixture.initialPositionId);
    expect(before.latestPosition?.clientEventId).toBe(
      fixture.initialClientEventId,
    );
    expect(before.latestPosition?.latitude).toBeCloseTo(
      fixture.positionA.latitude,
      6,
    );
    expect(before.latestPosition?.longitude).toBeCloseTo(
      fixture.positionA.longitude,
      6,
    );
    expect(before.latestPosition?.accuracyMeters).toBeLessThanOrEqual(100);

    await login(adminPage, process.env.E2E_ADMIN_EMAIL!);
    const adminNavigation = adminPage.getByRole("navigation", {
      name: "Accesos por rol",
    });
    const initialLiveResponse = adminPage.waitForResponse(
      apiResponse("/api/fleet/live", "GET"),
    );
    await adminNavigation
      .getByRole("link", { name: "Monitoreo de flota", exact: true })
      .click();
    const initialLive = await initialLiveResponse;
    expect(initialLive.status()).toBe(200);
    const initialLiveData = unwrapData(await initialLive.json());
    const initialItems = initialLiveData.items;
    expect(Array.isArray(initialItems)).toBe(true);
    const initialItem = (initialItems as Array<Record<string, unknown>>).find(
      (item) =>
        (item.vehicle as Record<string, unknown> | undefined)?.id ===
        fixture.vehicleId,
    );
    expect(initialItem).toBeDefined();
    const initialPosition = initialItem?.position as Record<string, unknown>;
    expect(initialPosition.latitude).toBeCloseTo(fixture.positionA.latitude, 6);
    expect(initialPosition.longitude).toBeCloseTo(
      fixture.positionA.longitude,
      6,
    );
    expect((initialItem?.route as Record<string, unknown>).id).toBe(
      fixture.routeId,
    );
    expect((initialItem?.driver as Record<string, unknown>).id).toBe(
      fixture.driverId,
    );
    await expect(adminPage).toHaveURL(/\/delivery-routes\/live$/);
    await expect(
      adminPage.getByLabel("Mapa de monitoreo de flota", { exact: true }),
    ).toBeVisible();
    await expect(
      adminPage
        .getByTestId("fleet-unit-button")
        .filter({ hasText: fixture.vehicleCode }),
    ).toBeVisible();
    await expect(
      adminPage.getByText("El mapa no está disponible.", { exact: false }),
    ).toHaveCount(0);
    const mapCanvas = adminPage
      .getByLabel("Mapa de monitoreo de flota", { exact: true })
      .locator("canvas.maplibregl-canvas");
    await expect(mapCanvas).toHaveCount(1);
    await expect(mapCanvas).toBeVisible();
    const canvasBox = await mapCanvas.boundingBox();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(0);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(0);
    const mapA = await stableCanvasScreenshot(mapCanvas);
    await testInfo.attach("fleet-map-a", {
      body: mapA.image,
      contentType: "image/png",
    });
    await expect(
      adminPage.getByText("Tiempo real conectado", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          adminEvidence.socketPathRequests.length +
          adminEvidence.socketUrls.length,
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() => adminEvidence.socketNamespaces.has(FLEET_SOCKET_NAMESPACE))
      .toBe(true);
    expect(adminEvidence.liveResponses).toHaveLength(1);

    await login(driverPage, fixture.driverEmail);
    await driverContext.grantPermissions(["geolocation"], {
      origin: new URL(baseURL).origin,
    });
    await driverContext.setGeolocation(browserGeolocation(fixture.positionA));
    const driverNavigation = driverPage.getByRole("navigation", {
      name: "Accesos por rol",
    });
    await driverNavigation
      .getByRole("link", { name: "Mi ruta en mapa", exact: true })
      .click();
    await expect(driverPage).toHaveURL(/\/my-routes$/);
    const routeSelector = driverPage
      .getByRole("button")
      .filter({ hasText: fixture.routeName });
    await expect(routeSelector).toBeVisible();
    await routeSelector.click();
    await expect(
      driverPage.getByRole("heading", { name: fixture.routeName, exact: true }),
    ).toBeVisible();
    await driverPage
      .getByRole("link", { name: "Abrir navegación", exact: true })
      .click();
    await expect(driverPage).toHaveURL(
      new RegExp(`/my-routes/${fixture.routeId}/navigation$`),
    );
    const positionAResponsePromise = driverPage.waitForResponse(
      apiResponse("/api/fleet/positions", "POST"),
    );
    await driverPage
      .getByRole("button", { name: "Iniciar navegación", exact: true })
      .click();
    const positionAResponse = await positionAResponsePromise;
    expect(positionAResponse.status()).toBe(201);
    expect(postBody(positionAResponse).latitude).toBe(
      fixture.positionA.latitude,
    );
    expect(postBody(positionAResponse).longitude).toBe(
      fixture.positionA.longitude,
    );
    const publicationA = readPositionPublication(
      await positionAResponse.json(),
    );
    expect(publicationA.vehicleId).toBe(fixture.vehicleId);
    expect(publicationA.routeId).toBe(fixture.routeId);
    const afterA = await oracle.snapshot();
    const persistedA = positionFromSnapshot(afterA, publicationA.id);
    expect(publicationA.recordedAt).toBe(persistedA.recordedAt);
    expect(publicationA.receivedAt).toBe(persistedA.receivedAt);
    expectPositionDelta(before, afterA, {
      id: persistedA.id,
      latitude: fixture.positionA.latitude,
      longitude: fixture.positionA.longitude,
    });
    expect(persistedA.driverId).toBe(fixture.driverId);
    expect(persistedA.accuracyMeters).toBeLessThanOrEqual(100);
    expect(Date.now() - Date.parse(persistedA.recordedAt)).toBeLessThan(60_000);
    expect(adminEvidence.liveResponses).toHaveLength(1);

    const positionBResponsePromise = driverPage.waitForResponse(
      apiResponse("/api/fleet/positions", "POST"),
    );
    await driverContext.setGeolocation(browserGeolocation(fixture.positionB));
    const positionBResponse = await positionBResponsePromise;
    expect(positionBResponse.status()).toBe(201);
    expect(postBody(positionBResponse).latitude).toBe(
      fixture.positionB.latitude,
    );
    expect(postBody(positionBResponse).longitude).toBe(
      fixture.positionB.longitude,
    );
    const publicationB = readPositionPublication(
      await positionBResponse.json(),
    );
    expect(publicationB.vehicleId).toBe(fixture.vehicleId);
    expect(publicationB.routeId).toBe(fixture.routeId);
    const afterB = await oracle.snapshot();
    const persistedB = positionFromSnapshot(afterB, publicationB.id);
    expect(publicationB.recordedAt).toBe(persistedB.recordedAt);
    expect(publicationB.receivedAt).toBe(persistedB.receivedAt);
    expectPositionDelta(afterA, afterB, {
      id: persistedB.id,
      latitude: fixture.positionB.latitude,
      longitude: fixture.positionB.longitude,
    });
    expect(persistedB.driverId).toBe(fixture.driverId);
    expect(persistedB.accuracyMeters).toBeLessThanOrEqual(100);
    expect(Date.now() - Date.parse(persistedB.recordedAt)).toBeLessThan(60_000);
    expect(Date.parse(persistedB.recordedAt)).toBeGreaterThan(
      Date.parse(persistedA.recordedAt),
    );

    expect(adminEvidence.liveResponses).toHaveLength(1);
    const positionEventB = await waitForPositionEvent(adminEvidence, {
      latitude: fixture.positionB.latitude,
      longitude: fixture.positionB.longitude,
      routeId: fixture.routeId,
      vehicleId: fixture.vehicleId,
    });
    expect(positionEventB.id).toBe(persistedB.id);
    expect(positionEventB.vehicleId).toBe(fixture.vehicleId);
    expect(positionEventB.routeId).toBe(fixture.routeId);
    expect(positionEventB.driverId).toBe(fixture.driverId);
    expect(positionEventB.latitude).toBe(fixture.positionB.latitude);
    expect(positionEventB.longitude).toBe(fixture.positionB.longitude);
    expect(positionEventB.accuracyMeters).toBe(persistedB.accuracyMeters);
    expect(positionEventB.recordedAt).toBe(persistedB.recordedAt);
    expect(positionEventB.receivedAt).toBe(persistedB.receivedAt);
    const navigationCountBeforeMapDelta = adminEvidence.mainFrameNavigations;
    await expect
      .poll(
        async () =>
          createHash("sha256")
            .update(await mapCanvas.screenshot())
            .digest("hex"),
        { timeout: 10_000 },
      )
      .not.toBe(mapA.hash);
    const mapB = await stableCanvasScreenshot(mapCanvas);
    await testInfo.attach("fleet-map-b", {
      body: mapB.image,
      contentType: "image/png",
    });
    expect(mapB.hash).not.toBe(mapA.hash);
    expect(adminEvidence.mainFrameNavigations).toBe(
      navigationCountBeforeMapDelta,
    );
    expect(await adminPage.url()).toMatch(/\/delivery-routes\/live$/);
    expect(adminEvidence.liveResponses).toHaveLength(1);
    expectNonInterference(before, afterB);

    console.log(
      JSON.stringify({
        taskId: "FQA-005E-FLEET-REALTIME-MAP",
        browser: `Chromium ${browser.version()}`,
        apiMocks: 0,
        admin: {
          route: "/delivery-routes/live",
          mapLibreLoaded: true,
          initialLiveStatus: initialLive.status(),
          liveSnapshotCount: adminEvidence.liveResponses.length,
          socketIoPath: FLEET_SOCKET_PATH,
          socketIoNamespace: FLEET_SOCKET_NAMESPACE,
          socketConnected: true,
        },
        driver: {
          positionA: fixture.positionA,
          postAStatus: positionAResponse.status(),
          positionB: fixture.positionB,
          postBStatus: positionBResponse.status(),
        },
        postgres: {
          positionFixtureCountBefore: before.positionCount,
          positionDeltaA: afterA.positionCount - before.positionCount,
          positionDeltaB: afterB.positionCount - afterA.positionCount,
          persistedPositionB: persistedB,
        },
        realtime: {
          event: FLEET_POSITION_UPDATED_EVENT,
          payloadId: positionEventB.id,
          persistedId: persistedB.id,
          adminChangedWithoutReload: true,
          extraLiveGetsAfterInitial: adminEvidence.liveResponses.length - 1,
        },
        mapLibre: {
          source: FLEET_VEHICLES_SOURCE,
          layers: ["fleet-vehicle-base", "fleet-vehicles-symbol"],
          featureA: fixture.positionA,
          featureB: fixture.positionB,
          observationMethod: "stable Chromium MapLibre canvas screenshots",
          canvasHashChanged: mapA.hash !== mapB.hash,
        },
        nonInterference: {
          saleDelta: afterB.saleCount - before.saleCount,
          paymentDelta: afterB.paymentCount - before.paymentCount,
          accountReceivableDelta:
            afterB.accountReceivableCount - before.accountReceivableCount,
          evidenceDelta: afterB.evidenceCount - before.evidenceCount,
          incidentDelta: afterB.incidentCount - before.incidentCount,
        },
      }),
    );
  } finally {
    await driverContext?.close();
    await adminContext?.close();
    await oracle.disconnect();
  }
});
