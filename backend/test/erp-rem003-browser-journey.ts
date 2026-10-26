import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendRequire = createRequire(
  resolve(__dirname, '../../frontend/package.json'),
);
const { chromium, expect } = frontendRequire(
  '@playwright/test',
) as import('../../frontend/e2e/rem003-playwright-types').FrontendPlaywright;
export type PlannerJourneyInput = {
  url: string;
  wsEndpoint: string;
  email: string;
  password: string;
  originId: string;
  saleId: string;
  saleNumber: string;
  driverId: string;
  vehicleId: string;
  scheduledDate: string;
  evidenceDir?: string;
};

/** Real Linux browser + real API. No request interception or eligibility fixtures in the browser. */
export async function routePlannerCustodyJourney(input: PlannerJourneyInput) {
  const browser = await chromium.connect(input.wsEndpoint, {
    exposeNetwork: '<loopback>',
    timeout: 30000,
  });
  const context = await browser.newContext({
    baseURL: input.url,
    timezoneId: 'America/Mexico_City',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto('/login');
    await page.getByLabel('Correo', { exact: true }).fill(input.email);
    await page.getByLabel(/^Contraseña/).fill(input.password);
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/delivery-routes/new');
    await page.waitForLoadState('networkidle');
    await page
      .getByLabel('Nombre de la ruta', { exact: true })
      .fill('Remediation003 real GIS route');
    await page
      .getByLabel('Fecha programada', { exact: true })
      .fill(input.scheduledDate);
    await page
      .getByRole('combobox', { name: /Origen/ })
      .selectOption(input.originId);
    await page
      .getByRole('combobox', { name: /Repartidor/ })
      .selectOption(input.driverId);
    await page
      .getByRole('combobox', { name: /Unidad/ })
      .selectOption(input.vehicleId);
    const eligibleResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          '/api/delivery-route-planning/eligible-sales' &&
        new URL(r.url()).searchParams.get('search') === input.saleNumber,
    );
    await page
      .getByPlaceholder('Folio o cliente', { exact: true })
      .fill(input.saleNumber);
    const eligible = await eligibleResponse;
    expect(eligible.status()).toBe(200);
    await expect(
      page.getByRole('button').filter({ hasText: input.saleNumber }).first(),
    ).toBeVisible();
    await page
      .getByRole('button')
      .filter({ hasText: input.saleNumber })
      .first()
      .click();
    await page
      .getByPlaceholder('Buscar calle, número, colonia y ciudad', {
        exact: true,
      })
      .fill('Calle J. B. Lobos');
    const geocodeResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/geocoding/search',
    );
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    const geocode = await geocodeResponse;
    expect(geocode.status()).toBe(200);
    const result = (
      (await geocode.json()) as { data: { items: Array<{ label: string }> } }
    ).data.items[0];
    expect(result?.label).toBeTruthy();
    await page
      .getByRole('button')
      .filter({ hasText: result.label })
      .last()
      .click();
    const planResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/delivery-route-plans' &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Calcular ruta', exact: true })
      .click();
    const planned = await planResponse;
    expect(planned.status(), await planned.text()).toBe(201);
    const plan = (
      (await planned.json()) as {
        data: {
          id: string;
          distanceMeters: number;
          geometry: { coordinates: number[][] };
        };
      }
    ).data;
    expect(plan.distanceMeters).toBeGreaterThan(0);
    expect(plan.geometry.coordinates.length).toBeGreaterThan(2);
    await page
      .getByRole('button', { name: 'Crear y asignar', exact: true })
      .click();
    const detailResponse = page.waitForResponse(
      (r) =>
        /^\/api\/delivery-routes\/[^/]+$/.test(new URL(r.url()).pathname) &&
        r.request().method() === 'GET',
    );
    const createdResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/delivery-routes' &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Crear y asignar', exact: true })
      .click();
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    const route = ((await created.json()) as { data: { id: string } }).data;
    await expect(page).toHaveURL(
      new RegExp('/delivery-routes/' + route.id + '$'),
    );
    const detail = await detailResponse;
    expect(detail.status()).toBe(200);
    expect(new URL(detail.url()).pathname).toBe(
      '/api/delivery-routes/' + route.id,
    );
    await expect(
      page.getByText('Remediation003 real GIS route', { exact: true }).first(),
    ).toBeVisible();
    if (input.evidenceDir) {
      mkdirSync(input.evidenceDir, { recursive: true });
      await page.screenshot({
        path: resolve(input.evidenceDir, 'planner-consumed.png'),
        fullPage: true,
      });
    }
    return {
      routeId: route.id,
      planId: plan.id,
      distanceMeters: plan.distanceMeters,
      geometryPoints: plan.geometry.coordinates.length,
      eligibleURL: eligible.url(),
      geocode: result.label,
    };
  } catch (error) {
    if (input.evidenceDir) {
      mkdirSync(input.evidenceDir, { recursive: true });
      await page.screenshot({
        path: resolve(input.evidenceDir, 'planner-failed.png'),
        fullPage: true,
      });
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
