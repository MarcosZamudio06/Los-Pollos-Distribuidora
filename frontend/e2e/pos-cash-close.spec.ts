import { expect, test, type Page, type Response } from "@playwright/test";
import {
  createBrowserPosOracle,
  type BrowserPosSnapshot,
} from "../../backend/test/browser-pos-oracle";

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

function expectDelta(before: BrowserPosSnapshot, after: BrowserPosSnapshot) {
  expect(after.saleCount - before.saleCount).toBe(1);
  expect(after.saleItemCount - before.saleItemCount).toBe(1);
  expect(after.paymentCount - before.paymentCount).toBe(1);
  expect(after.inventoryMovementCount - before.inventoryMovementCount).toBe(1);
  expect(after.inventoryBalancePieces).toBe(before.inventoryBalancePieces - 1);
}

test("POS cash sale can close its shift and daily close through the real stack", async ({
  page,
}) => {
  const oracle = await createBrowserPosOracle();
  const { fixture } = oracle;
  try {
    const before = await oracle.snapshot();
    expect(before.saleCount).toBe(0);
    expect(before.paymentCount).toBe(0);
    expect(before.inventoryMovementCount).toBe(0);
    expect(before.inventoryBalancePieces).toBe(fixture.initialStockPieces);
    expect(before.cashShiftStatus).toBe("OPEN");
    expect(before.cashShiftCountedTotal).toBeNull();
    expect(before.cashShiftDifferenceTotal).toBeNull();
    expect(before.dailyCloseStatus).toBe("DRAFT");

    // The browser gets the same device identity as the disposable terminal fixture.
    await page.addInitScript((deviceId) => {
      (
        globalThis as typeof globalThis & {
          localStorage: { setItem(key: string, value: string): void };
        }
      ).localStorage.setItem("pollos-pos-device-id", deviceId);
    }, fixture.deviceId);

    await login(page);
    await page
      .getByRole("navigation", { name: "Accesos por rol" })
      .getByRole("link", { name: "Ventas POS", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sales$/);

    const search = page.getByLabel(
      "Búsqueda de productos por código de barras, SKU o nombre",
      { exact: true },
    );
    await expect(search).toBeVisible();
    const posLocation = page.getByRole("combobox", {
      name: "Ubicación operativa",
      exact: true,
    });
    await expect(posLocation).toBeVisible();
    await posLocation.selectOption(fixture.locationId);
    await expect(posLocation).toHaveValue(fixture.locationId);
    await expect(page.getByText(/turno abierto/i)).toBeVisible();

    await search.fill(fixture.productSku);
    const productResults = page.getByRole("region", {
      name: "Resultados de productos",
    });
    const productRow = productResults
      .getByRole("row")
      .filter({ hasText: fixture.productName });
    await expect(productRow).toBeVisible();
    await expect(productRow).toContainText("$12.00");
    await expect(
      productRow.getByRole("button", { name: "Agregar" }),
    ).toBeEnabled();
    await productRow.getByRole("button", { name: "Agregar" }).click();

    await expect(
      page.getByLabel(`Piezas capturadas de ${fixture.productName}`),
    ).toHaveValue("1");
    await expect(
      page.getByRole("region", { name: "Total de la venta" }),
    ).toContainText("$12.00");

    await page
      .getByRole("region", { name: "Resumen de pago" })
      .getByRole("button", { name: /Pago.*F6/ })
      .click();
    const exactCash = page.getByRole("button", {
      name: "Usar importe exacto de $12.00",
      exact: true,
    });
    await expect(exactCash).toBeVisible();
    await exactCash.click();
    await expect(
      page.getByRole("button", { name: /^Confirmar venta/ }),
    ).toBeEnabled();

    await page.getByRole("button", { name: /^Confirmar venta/ }).click();
    await expect(
      page.getByRole("button", { name: "Confirmar registro", exact: true }),
    ).toBeVisible();
    const saleResponse = page.waitForResponse(
      apiResponse("/api/sales", "POST"),
    );
    await page
      .getByRole("button", { name: "Confirmar registro", exact: true })
      .click();
    const createdSaleResponse = await saleResponse;
    expect(createdSaleResponse.status()).toBe(201);
    const createdSaleBody = (await createdSaleResponse.json()) as {
      data?: { sale?: { id?: string; saleNumber?: string } };
    };
    const saleNumber = createdSaleBody.data?.sale?.saleNumber;
    expect(saleNumber).toBeTruthy();

    await expect(
      page.getByRole("heading", { name: "Venta registrada", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ir al historial", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sales\/history$/);
    await expect(page.getByText(saleNumber!, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: saleNumber! }),
    ).toContainText("Confirmada");

    await page
      .getByRole("link", { name: "Cierre diario", exact: true })
      .click();
    await expect(page).toHaveURL(/\/daily-close$/);
    await expect(
      page.getByRole("heading", {
        name: "Turnos y cierre diario",
        exact: true,
      }),
    ).toBeVisible();
    // Select this run's close explicitly so reruns on the same disposable DB
    // cannot accidentally operate on an older fixture.
    const runClose = page
      .getByRole("button")
      .filter({ hasText: fixture.locationName });
    await expect(runClose).toBeVisible();
    await runClose.click();

    const countedCash = page.getByLabel(
      `Efectivo contado de ${fixture.terminalName}`,
      { exact: true },
    );
    await expect(countedCash).toBeVisible();
    await countedCash.fill(fixture.salePrice.toFixed(2));
    const shiftCloseResponse = page.waitForResponse(
      apiResponse(`/api/cash-shifts/${fixture.cashShiftId}/close`, "PATCH"),
    );
    await page
      .getByRole("button", { name: "Cerrar turno", exact: true })
      .click();
    expect((await shiftCloseResponse).status()).toBe(200);
    await expect(countedCash).toHaveCount(0);
    await expect(
      page.getByText(
        "Todos los turnos están cerrados o no hay turnos registrados.",
        { exact: true },
      ),
    ).toBeVisible();
    const closedShiftRow = page
      .getByRole("row")
      .filter({ hasText: fixture.terminalName });
    await expect(closedShiftRow).toContainText("Cerrado");
    await expect(closedShiftRow).toContainText("$0.00");

    for (let step = 0; step < 4; step += 1) {
      await page
        .getByRole("button", { name: "Siguiente paso", exact: true })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: "Revisar diferencias", exact: true }),
    ).toBeVisible();

    const validateResponse = page.waitForResponse(
      apiResponse(
        `/api/point-of-sale-daily-closes/${fixture.dailyCloseId}/validate`,
        "POST",
      ),
    );
    await page.getByRole("button", { name: "Validar", exact: true }).click();
    expect((await validateResponse).status()).toBe(201);
    await expect(
      page.getByRole("heading", { name: "Validación completada", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No hay diferencias detectadas.", { exact: true }),
    ).toBeVisible();

    const reviewResponse = page.waitForResponse(
      apiResponse(
        `/api/point-of-sale-daily-closes/${fixture.dailyCloseId}/review`,
        "PATCH",
      ),
    );
    await page
      .getByRole("button", { name: "Marcar revisado", exact: true })
      .click();
    expect((await reviewResponse).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Cerrar jornada", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Cerrar jornada", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Confirmar cierre de jornada",
        exact: true,
      }),
    ).toBeVisible();
    const closeDialog = page.getByRole("alertdialog", {
      name: "Confirmar cierre de jornada",
      exact: true,
    });
    await expect(closeDialog).toContainText("Ventas: $12.00 (1)");
    await expect(closeDialog).toContainText("Diferencia de efectivo: $0.00");
    const dailyCloseResponse = page.waitForResponse(
      apiResponse(
        `/api/point-of-sale-daily-closes/${fixture.dailyCloseId}/close`,
        "PATCH",
      ),
    );
    await closeDialog
      .getByRole("button", { name: "Cerrar jornada", exact: true })
      .click();
    expect((await dailyCloseResponse).status()).toBe(200);
    await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();

    const after = await oracle.snapshot();
    expectDelta(before, after);
    expect(after.cashShiftStatus).toBe("CLOSED");
    expect(after.cashShiftCountedTotal).toBe(fixture.salePrice);
    expect(after.cashShiftDifferenceTotal).toBe(0);
    expect(after.dailyCloseStatus).toBe("CLOSED");

    const records = await oracle.records();
    expect(records.sales).toHaveLength(1);
    const sale = records.sales[0]!;
    expect(sale.saleNumber).toBe(saleNumber);
    expect(sale.locationId).toBe(fixture.locationId);
    expect(sale.cashShiftId).toBe(fixture.cashShiftId);
    expect(sale.pointOfSaleDailyCloseId).toBe(fixture.dailyCloseId);
    expect(sale.status).toBe("CONFIRMED");
    expect(sale.collectionStatus).toBe("PAID");
    expect(sale.paymentType).toBe("CASH_SALE");
    expect(sale.items).toHaveLength(1);
    expect(sale.payments).toHaveLength(1);
    expect(sale.items[0]).toMatchObject({
      productId: fixture.productId,
      quantityPieces: 1,
      unit: "PIECE",
    });
    expect(Number(sale.items[0]!.unitPrice)).toBe(fixture.salePrice);
    expect(Number(sale.items[0]!.total)).toBe(fixture.salePrice);
    expect(sale.accountReceivable).toBeNull();

    expect(records.payments).toHaveLength(1);
    expect(records.payments[0]).toMatchObject({
      amount: expect.anything(),
      paymentMethod: "CASH",
      status: "APPLIED",
      saleId: sale.id,
      accountReceivableId: null,
      cashShiftId: fixture.cashShiftId,
    });
    expect(Number(records.payments[0]!.amount)).toBe(fixture.salePrice);

    expect(records.inventoryMovements).toHaveLength(1);
    expect(records.inventoryMovements[0]).toMatchObject({
      type: "SALE",
      saleId: sale.id,
      productId: fixture.productId,
      locationId: fixture.locationId,
      quantityPieces: 1,
      previousQuantityPieces: before.inventoryBalancePieces,
      newQuantityPieces: after.inventoryBalancePieces,
    });
    expect(records.balance?.quantityPieces).toBe(
      fixture.initialStockPieces - 1,
    );
    expect(records.shift?.status).toBe("CLOSED");
    expect(records.close?.status).toBe("CLOSED");

    // A post-journey browser refresh must remain read-only for the completed sale.
    await page.reload();
    await expect(page).toHaveURL(/\/daily-close$/);
    const refreshed = await oracle.snapshot();
    expect(refreshed.saleCount).toBe(after.saleCount);
    expect(refreshed.paymentCount).toBe(after.paymentCount);
    expect(refreshed.inventoryMovementCount).toBe(after.inventoryMovementCount);

    console.log(
      JSON.stringify({
        browser: "chromium",
        apiMocks: 0,
        saleCountDelta: after.saleCount - before.saleCount,
        paymentCountDelta: after.paymentCount - before.paymentCount,
        inventoryMovementDelta:
          after.inventoryMovementCount - before.inventoryMovementCount,
        inventoryBalance: {
          before: before.inventoryBalancePieces,
          after: after.inventoryBalancePieces,
        },
        cashShift: after.cashShiftStatus,
        cashShiftDifference: after.cashShiftDifferenceTotal,
        dailyClose: after.dailyCloseStatus,
      }),
    );
  } finally {
    await oracle.disconnect();
  }
});
