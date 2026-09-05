import { expect, test, type Page, type Response } from "@playwright/test";
import {
  createBrowserCedisOracle,
  type BrowserCedisSnapshot,
} from "../../backend/test/browser-cedis-oracle";

const authResponse = (action: string) => (response: Response) =>
  new URL(response.url()).pathname === `/api/auth/${action}` &&
  response.request().method() === "POST";

function apiResponse(path: string, method: string) {
  return (response: Response) =>
    new URL(response.url()).pathname === path &&
    response.request().method() === method;
}

async function login(page: Page) {
  const refresh = page.waitForResponse(authResponse("refresh"));
  await page.goto("/login");
  expect((await refresh).status()).toBe(401);
  await page
    .getByLabel("Correo", { exact: true })
    .fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel(/^Contraseña/).fill(process.env.E2E_ADMIN_PASSWORD!);
  const response = page.waitForResponse(authResponse("login"));
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
}

function expectNonInterference(
  before: BrowserCedisSnapshot,
  after: BrowserCedisSnapshot,
) {
  expect(after.nonInterference).toEqual(before.nonInterference);
}

function expectPendingSupply(
  before: BrowserCedisSnapshot,
  pending: BrowserCedisSnapshot,
) {
  expect(pending.cycleStatus).toBe("OPEN");
  expect(pending.cycleVersion).toBe(before.cycleVersion + 1);
  expect(pending.transferCount - before.transferCount).toBe(1);
  expect(pending.cycleTransferLinkCount - before.cycleTransferLinkCount).toBe(
    1,
  );
  expect(pending.receiptCount - before.receiptCount).toBe(0);
  expect(pending.receiptItemCount - before.receiptItemCount).toBe(0);
  expect(pending.inventoryMovementCount - before.inventoryMovementCount).toBe(
    0,
  );
  expect(pending.transferOutCount - before.transferOutCount).toBe(0);
  expect(pending.transferInCount - before.transferInCount).toBe(0);
  expect(pending.shrinkageCount - before.shrinkageCount).toBe(0);
  expect(pending.surplusInCount - before.surplusInCount).toBe(0);
  expect(pending.routeCount - before.routeCount).toBe(1);
  expect(pending.cycleEventCount - before.cycleEventCount).toBe(1);
  expect(pending.openedEventCount).toBe(before.openedEventCount);
  expect(
    pending.transferLinkedEventCount - before.transferLinkedEventCount,
  ).toBe(1);
  expect(
    pending.transferStateChangedEventCount -
      before.transferStateChangedEventCount,
  ).toBe(0);
  expect(pending.transferStatus).toBe("REQUESTED");
  expect(pending.cedisQuantityPieces).toBe(10);
  expect(pending.cedisReservedQuantityPieces).toBe(3);
  expect(
    pending.cedisQuantityPieces - pending.cedisReservedQuantityPieces,
  ).toBe(7);
  expect(pending.branchQuantityPieces).toBe(0);
  expect(pending.branchReservedQuantityPieces).toBe(0);
  expectNonInterference(before, pending);
}

function expectConfirmedSupply(
  before: BrowserCedisSnapshot,
  pending: BrowserCedisSnapshot,
  after: BrowserCedisSnapshot,
) {
  expect(after.cycleStatus).toBe("OPEN");
  expect(after.cycleVersion).toBe(pending.cycleVersion + 1);
  expect(after.transferCount - before.transferCount).toBe(1);
  expect(after.cycleTransferLinkCount - before.cycleTransferLinkCount).toBe(1);
  expect(after.receiptCount - before.receiptCount).toBe(1);
  expect(after.receiptItemCount - before.receiptItemCount).toBe(1);
  expect(after.inventoryMovementCount - before.inventoryMovementCount).toBe(2);
  expect(after.transferOutCount - before.transferOutCount).toBe(1);
  expect(after.transferInCount - before.transferInCount).toBe(1);
  expect(after.shrinkageCount - before.shrinkageCount).toBe(0);
  expect(after.surplusInCount - before.surplusInCount).toBe(0);
  expect(after.routeCount - before.routeCount).toBe(1);
  expect(after.cycleEventCount - before.cycleEventCount).toBe(2);
  expect(after.openedEventCount).toBe(before.openedEventCount);
  expect(after.transferLinkedEventCount - before.transferLinkedEventCount).toBe(
    1,
  );
  expect(
    after.transferStateChangedEventCount -
      before.transferStateChangedEventCount,
  ).toBe(1);
  expect(after.transferStatus).toBe("CONFIRMED");
  expect(after.cedisQuantityPieces).toBe(7);
  expect(after.cedisReservedQuantityPieces).toBe(0);
  expect(after.branchQuantityPieces).toBe(3);
  expect(after.branchReservedQuantityPieces).toBe(0);
  expectNonInterference(before, after);
}

test("CEDIS supply reserves stock and receives the exact quantity through the real stack", async ({
  page,
}) => {
  const oracle = await createBrowserCedisOracle();
  const { fixture } = oracle;
  try {
    const before = await oracle.snapshot();
    expect(before.cycleStatus).toBe("OPEN");
    expect(before.cycleVersion).toBe(1);
    expect(before.cedisQuantityPieces).toBe(10);
    expect(before.cedisReservedQuantityPieces).toBe(0);
    expect(before.branchQuantityPieces).toBe(0);
    expect(before.branchReservedQuantityPieces).toBe(0);
    expect(before.transferCount).toBe(0);
    expect(before.cycleTransferLinkCount).toBe(0);
    expect(before.receiptCount).toBe(0);
    expect(before.receiptItemCount).toBe(0);
    expect(before.inventoryMovementCount).toBe(0);
    expect(before.transferOutCount).toBe(0);
    expect(before.transferInCount).toBe(0);
    expect(before.shrinkageCount).toBe(0);
    expect(before.surplusInCount).toBe(0);
    expect(before.routeCount).toBe(0);
    expect(before.cycleEventCount).toBe(1);
    expect(before.openedEventCount).toBe(1);
    expect(before.transferStatus).toBeNull();

    await login(page);
    const roleNavigation = page.getByRole("navigation", {
      name: "Accesos por rol",
    });
    await roleNavigation
      .getByRole("link", { name: "CEDIS", exact: true })
      .click();
    await expect(page).toHaveURL(/\/cedis$/);
    await expect(
      page.getByRole("heading", { name: "CEDIS / Sucursales", exact: true }),
    ).toBeVisible();
    const cedisSelect = page.getByRole("combobox", {
      name: "CEDIS",
      exact: true,
    });
    await expect(cedisSelect).toBeVisible();
    await cedisSelect.selectOption(fixture.cedisId);
    await expect(cedisSelect).toHaveValue(fixture.cedisId);

    const branchLink = page.getByRole("link", {
      name: `Abrir detalle de ${fixture.branchName}, código ${fixture.branchCode}`,
      exact: true,
    });
    await expect(branchLink).toBeVisible();
    await branchLink.click();
    await expect(page).toHaveURL(/\/cedis\/branches\//);
    await expect(
      page.getByRole("heading", { name: fixture.branchName, exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Enviar producto", exact: true })
      .click();
    const supplyDialog = page.getByRole("dialog", {
      name: "Enviar producto",
      exact: true,
    });
    await expect(supplyDialog).toBeVisible();

    const driver = supplyDialog.getByRole("combobox", {
      name: "Conductor asignado",
      exact: true,
    });
    const vehicle = supplyDialog.getByRole("combobox", {
      name: "Unidad asignada",
      exact: true,
    });
    await expect(driver).toBeEnabled();
    await expect(vehicle).toBeEnabled();
    await driver.selectOption(fixture.driverId);
    await vehicle.selectOption(fixture.vehicleId);
    await expect(driver).toHaveValue(fixture.driverId);
    await expect(vehicle).toHaveValue(fixture.vehicleId);

    const product = supplyDialog.getByRole("combobox", {
      name: "Producto 1",
      exact: true,
    });
    await expect(product).toBeEnabled();
    await product.selectOption(fixture.productId);
    await expect(product).toHaveValue(fixture.productId);
    const pieces = supplyDialog.getByLabel("Piezas 1", { exact: true });
    await pieces.fill(String(fixture.supplyQuantityPieces));
    await expect(pieces).toHaveValue(String(fixture.supplyQuantityPieces));
    const availability = supplyDialog.getByRole("status", {
      name: `Disponibilidad de ${fixture.productName}`,
      exact: true,
    });
    await expect(availability).toContainText("Existencia física");
    await expect(availability).toContainText("10 piezas");
    await expect(availability).toContainText("Comprometido");
    await expect(availability).toContainText("0 piezas");
    await expect(availability).toContainText("Disponible");
    await expect(availability).toContainText("Solicitado: 3 piezas");

    await supplyDialog
      .getByRole("button", { name: "Revisar antes de confirmar", exact: true })
      .click();
    const confirmationDialog = page.getByRole("dialog", {
      name: "Confirmar suministro",
      exact: true,
    });
    await expect(confirmationDialog).toBeVisible();
    await expect(confirmationDialog).toContainText(fixture.productName);
    await expect(confirmationDialog).toContainText("3 piezas");
    const createSupplyResponse = page.waitForResponse(
      apiResponse(
        `/api/cedis/branch-supply-cycles/${fixture.cycleId}/supplies`,
        "POST",
      ),
    );
    await confirmationDialog
      .getByRole("button", { name: "Confirmar suministro", exact: true })
      .click();
    expect((await createSupplyResponse).status()).toBe(201);

    const pendingSupplyRow = page
      .getByRole("row")
      .filter({ hasText: fixture.productName })
      .filter({ hasText: "Pendiente de recepción" });
    await expect(pendingSupplyRow).toBeVisible();
    await expect(pendingSupplyRow).toContainText("Físico en origen 10 piezas");
    await expect(pendingSupplyRow).toContainText("Comprometido 3 piezas");
    await expect(pendingSupplyRow).toContainText("Disponible 7 piezas");

    const pending = await oracle.snapshot();
    expectPendingSupply(before, pending);
    const pendingRecords = await oracle.records();
    expect(pendingRecords.transfers).toHaveLength(1);
    const pendingTransfer = pendingRecords.transfers[0]!;
    expect(pendingRecords.links).toHaveLength(1);
    expect(pendingRecords.links[0]).toMatchObject({
      inventoryTransferId: pendingTransfer.id,
      role: "SUPPLY",
    });
    expect(pendingTransfer.status).toBe("REQUESTED");
    expect(pendingTransfer.items).toHaveLength(1);
    expect(pendingTransfer.items[0]).toMatchObject({
      productId: fixture.productId,
      unit: "PIECE",
      quantityPieces: 3,
    });
    expect(pendingTransfer.deliveryRoute).toEqual(
      expect.objectContaining({
        type: "CEDIS_SUPPLY",
        inventoryTransferId: pendingTransfer.id,
        driverId: fixture.driverId,
        vehicleId: fixture.vehicleId,
      }),
    );

    await page
      .getByRole("link", { name: "Revisar recepciones", exact: true })
      .click();
    await expect(page).toHaveURL(/\/cedis\/incoming/);
    await expect(
      page.getByRole("heading", {
        name: "Recepciones por confirmar",
        exact: true,
      }),
    ).toBeVisible();
    const pendingSupplyCard = page
      .getByRole("button")
      .filter({ hasText: pendingTransfer.transferNumber });
    await expect(pendingSupplyCard).toBeVisible();
    await pendingSupplyCard.click();
    const receiptDialog = page.getByRole("dialog", {
      name: pendingTransfer.transferNumber,
      exact: true,
    });
    await expect(receiptDialog).toBeVisible();
    const receivedPieces = receiptDialog.getByLabel(
      `${fixture.productName} piezas recibidas`,
      { exact: true },
    );
    await expect(receivedPieces).toHaveValue("3");
    await receivedPieces.fill(String(fixture.supplyQuantityPieces));
    const receiveResponse = page.waitForResponse(
      apiResponse(
        `/api/cedis/incoming-supplies/${pendingTransfer.id}/receive`,
        "POST",
      ),
    );
    await receiptDialog
      .getByRole("button", { name: "Confirmar recepción", exact: true })
      .click();
    expect((await receiveResponse).status()).toBe(201);

    const after = await oracle.snapshot();
    expectConfirmedSupply(before, pending, after);
    const records = await oracle.records();
    expect(records.transfers).toHaveLength(1);
    const confirmedTransfer = records.transfers[0]!;
    expect(confirmedTransfer.status).toBe("CONFIRMED");
    expect(confirmedTransfer.items).toHaveLength(1);
    expect(confirmedTransfer.items[0]).toMatchObject({
      productId: fixture.productId,
      unit: "PIECE",
      quantityPieces: 3,
    });
    expect(confirmedTransfer.branchSupplyReceipt).toEqual(
      expect.objectContaining({
        inventoryTransferId: confirmedTransfer.id,
        branchSupplyCycleId: fixture.cycleId,
      }),
    );
    expect(confirmedTransfer.branchSupplyReceipt?.items).toHaveLength(1);
    expect(confirmedTransfer.branchSupplyReceipt?.items[0]).toMatchObject({
      transferItemId: confirmedTransfer.items[0]!.id,
      productId: fixture.productId,
      sentPieces: 3,
      receivedPieces: 3,
      differencePieces: 0,
    });
    expect(confirmedTransfer.inventoryMovements).toHaveLength(2);
    expect(
      confirmedTransfer.inventoryMovements.filter(
        (movement) => movement.type === "TRANSFER_OUT",
      ),
    ).toHaveLength(1);
    expect(
      confirmedTransfer.inventoryMovements.filter(
        (movement) => movement.type === "TRANSFER_IN",
      ),
    ).toHaveLength(1);
    expect(confirmedTransfer.inventoryMovements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "TRANSFER_OUT",
          locationId: fixture.cedisId,
          quantityPieces: 3,
          previousQuantityPieces: 10,
          newQuantityPieces: 7,
        }),
        expect.objectContaining({
          type: "TRANSFER_IN",
          locationId: fixture.branchId,
          quantityPieces: 3,
          previousQuantityPieces: 0,
          newQuantityPieces: 3,
        }),
      ]),
    );
    expect(records.links).toHaveLength(1);
    expect(records.links[0]).toMatchObject({
      inventoryTransferId: confirmedTransfer.id,
      role: "SUPPLY",
    });
    expect(records.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "OPENED", cycleVersion: 1 }),
        expect.objectContaining({ type: "TRANSFER_LINKED", cycleVersion: 2 }),
        expect.objectContaining({
          type: "TRANSFER_STATE_CHANGED",
          cycleVersion: 3,
        }),
      ]),
    );

    const showAll = page.getByRole("checkbox", {
      name: "Mostrar todas las recepciones",
      exact: true,
    });
    await showAll.check();
    await expect(showAll).toBeChecked();
    const confirmedSupplyCard = page
      .getByRole("button")
      .filter({ hasText: pendingTransfer.transferNumber })
      .filter({ hasText: "Confirmado" });
    await expect(confirmedSupplyCard).toBeVisible();
    await confirmedSupplyCard.click();
    const confirmedReceiptDialog = page.getByRole("dialog", {
      name: pendingTransfer.transferNumber,
      exact: true,
    });
    await expect(confirmedReceiptDialog).toBeVisible();
    await expect(
      confirmedReceiptDialog.getByText("Recepción confirmada.", {
        exact: true,
      }),
    ).toBeVisible();
    await confirmedReceiptDialog
      .getByRole("button", {
        name: "Cerrar evidencia de recepción",
        exact: true,
      })
      .click();

    await page.reload();
    await expect(showAll).toBeChecked();
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: pendingTransfer.transferNumber })
        .filter({ hasText: "Confirmado" }),
    ).toBeVisible();
    const reloaded = await oracle.snapshot();
    expect(reloaded.transferCount).toBe(after.transferCount);
    expect(reloaded.cycleTransferLinkCount).toBe(after.cycleTransferLinkCount);
    expect(reloaded.receiptCount).toBe(after.receiptCount);
    expect(reloaded.receiptItemCount).toBe(after.receiptItemCount);
    expect(reloaded.inventoryMovementCount).toBe(after.inventoryMovementCount);
    expect(reloaded.transferOutCount).toBe(after.transferOutCount);
    expect(reloaded.transferInCount).toBe(after.transferInCount);
    expect(reloaded.routeCount).toBe(after.routeCount);
    expect(reloaded.cycleEventCount).toBe(after.cycleEventCount);
    expectNonInterference(after, reloaded);

    console.log(
      JSON.stringify({
        browser: "chromium",
        apiMocks: 0,
        journey: "CEDIS supply and exact branch receipt",
        transferDelta: after.transferCount - before.transferCount,
        receiptDelta: after.receiptCount - before.receiptCount,
        cedisQuantityPieces: {
          before: before.cedisQuantityPieces,
          pending: pending.cedisQuantityPieces,
          after: after.cedisQuantityPieces,
        },
        cedisReservedQuantityPieces: {
          before: before.cedisReservedQuantityPieces,
          pending: pending.cedisReservedQuantityPieces,
          after: after.cedisReservedQuantityPieces,
        },
        branchQuantityPieces: {
          before: before.branchQuantityPieces,
          after: after.branchQuantityPieces,
        },
        transferOutDelta: after.transferOutCount - before.transferOutCount,
        transferInDelta: after.transferInCount - before.transferInCount,
        shrinkageDelta: after.shrinkageCount - before.shrinkageCount,
        surplusInDelta: after.surplusInCount - before.surplusInCount,
        finalTransferState: after.transferStatus,
        cycleEvents: after.cycleEventCount - before.cycleEventCount,
        reloadDuplicateDeltas: {
          transfers: reloaded.transferCount - after.transferCount,
          receipts: reloaded.receiptCount - after.receiptCount,
          transferOut: reloaded.transferOutCount - after.transferOutCount,
          transferIn: reloaded.transferInCount - after.transferInCount,
          routes: reloaded.routeCount - after.routeCount,
          events: reloaded.cycleEventCount - after.cycleEventCount,
        },
      }),
    );
  } finally {
    await oracle.disconnect();
  }
});
