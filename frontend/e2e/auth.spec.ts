import { expect, test, type Page, type Response } from "@playwright/test";

const authResponse = (action: string) => (response: Response) =>
  new URL(response.url()).pathname === `/api/auth/${action}` &&
  response.request().method() === "POST";

async function expectShell(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("complementary", { name: "Navegación principal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir menú lateral" }),
  ).toBeVisible();
}

async function expectLogin(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Entrar al sistema" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Navegación principal" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir menú lateral" }),
  ).toHaveCount(0);
}

async function login(page: Page) {
  const bootstrap = page.waitForResponse(authResponse("refresh"));
  await page.goto("/login");
  expect((await bootstrap).status()).toBe(401);
  await page
    .getByLabel("Correo", { exact: true })
    .fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel(/^Contraseña/).fill(process.env.E2E_ADMIN_PASSWORD!);
  const response = page.waitForResponse(authResponse("login"));
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  expect((await response).status()).toBe(200);
  await expectShell(page);
}

test.beforeAll(async ({ browser }) => {
  console.log(
    `Real Chromium: ${browser.version()}; run: ${process.env.E2E_RUN_ID}; API mocks: 0`,
  );
});

test("ADMIN can login through the real browser and reach authenticated shell", async ({
  page,
}) => {
  await login(page);
});

test("ADMIN can logout through UI and cannot reopen the protected shell", async ({
  page,
}) => {
  await login(page);
  const logout = page.waitForResponse(authResponse("logout"));
  await page.getByRole("link", { name: "Cerrar sesión", exact: true }).click();
  expect((await logout).status()).toBe(200);
  await expectLogin(page);
  // Full navigation exercises cookie/session invalidation, not only React state.
  const refresh = page.waitForResponse(authResponse("refresh"));
  await page.goto("/");
  expect((await refresh).status()).toBe(401);
  await expectLogin(page);
});

test("unauthenticated direct navigation is rejected by the route guard", async ({
  page,
}) => {
  const refresh = page.waitForResponse(authResponse("refresh"));
  await page.goto("/");
  expect((await refresh).status()).toBe(401);
  await expectLogin(page);
});

test("reload restores the session through real refresh token rotation", async ({
  page,
}) => {
  await login(page);
  // Reload discards the in-memory access token. The app must use its HttpOnly cookie.
  // No clock manipulation, token injection, storage inspection or expiry overrides.
  for (let rotation = 0; rotation < 2; rotation += 1) {
    const refresh = page.waitForResponse(authResponse("refresh"));
    await page.reload();
    expect((await refresh).status()).toBe(200);
    await expectShell(page);
  }
});
