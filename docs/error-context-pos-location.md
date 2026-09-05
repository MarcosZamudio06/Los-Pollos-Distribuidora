# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos-cash-close.spec.ts >> POS cash sale can close its shift and daily close through the real stack
- Location: e2e/pos-cash-close.spec.ts:39:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Ubicación operativa', { exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByLabel('Ubicación operativa', { exact: true }) with timeout 10000ms
  - waiting for getByLabel('Ubicación operativa', { exact: true })

```

```yaml
- complementary "Navegación principal":
  - link "Ir al inicio":
    - /url: /
  - paragraph: El Pollo
  - paragraph: Pollos Distribuidora
  - separator
  - text: BE
  - paragraph: Browser E2E ci-33949376591-1
  - paragraph: browser-ci-33949376591-1@example.test
  - text: Administración Sesión activa
  - navigation "Accesos por rol":
    - paragraph: Operación
    - link "Inicio":
      - /url: /
    - link "CEDIS":
      - /url: /cedis
    - link "Recepción CEDIS":
      - /url: /cedis/incoming
    - link "Devoluciones CEDIS":
      - /url: /cedis/returns
    - link "Nueva sucursal":
      - /url: /admin/locations/branches/new
    - link "Pedidos":
      - /url: /orders
    - link "Inventario":
      - /url: /inventory
    - link "Compras":
      - /url: /purchases
    - link "Proveedores":
      - /url: /purchases/suppliers
    - link "Nueva compra":
      - /url: /purchases/new
    - link "Planificar ruta":
      - /url: /delivery-routes/new
    - link "Reparto / Rutas":
      - /url: /delivery-routes
    - link "Monitoreo de flota":
      - /url: /delivery-routes/live
    - link "Unidades de entrega":
      - /url: /fleet/vehicles
    - paragraph: Comercial
    - link "Ventas POS":
      - /url: /sales
    - link "Historial de ventas":
      - /url: /sales/history
    - link "Clientes":
      - /url: /customers
    - paragraph: Finanzas
    - link "Cuentas por cobrar":
      - /url: /accounts-receivable
    - link "Solicitudes de facturación":
      - /url: /billing-requests
    - link "Notas facturables":
      - /url: /billing/reportable-notes
    - link "Remediaciones contables":
      - /url: /billing/remediations
    - link "Cierre diario":
      - /url: /daily-close
    - link "Reportes":
      - /url: /reports
    - paragraph: Administración
    - link "Empleados":
      - /url: /admin/employees
    - link "Terminales POS":
      - /url: /admin/cash-terminals
  - link "Cerrar sesión":
    - /url: /logout
- banner:
  - button "Abrir menú lateral" [expanded]
  - paragraph: Punto de venta
  - text: Datos actualizados
  - heading "Ventas POS" [level=1]
  - link "Ventas POS":
    - /url: /sales
  - link "Nueva compra":
    - /url: /purchases/new
  - button "Buscar en el ERP"
- main:
  - main:
    - text: Ubicación operativa
    - combobox "Ubicación operativa":
      - option "Selecciona ubicación" [selected]
      - option "Asignación pendiente · LEGACY-EMPLOYEES"
      - option "Browser E2E ci-33949376591-1 Branch · BROWSER-ci-33949376591-1-BRANCH"
    - text: Turno sin abrir
    - link "Abrir turno":
      - /url: /daily-close
    - text: Browser E2E ci-33949376591-1 06:18 a.m. En línea
    - button "Activar sonido de escaneo"
    - button "Activar pantalla completa"
    - button "Abrir ventas recientes": Ventas recientes
    - button "Nueva venta F9"
    - paragraph: "Impresora: no configurada. Báscula: captura manual."
    - region "Escáner y búsqueda":
      - text: Búsqueda de productos por código de barras, SKU o nombre
      - textbox "Búsqueda de productos por código de barras, SKU o nombre":
        - /placeholder: Escanea código, SKU o busca producto
      - text: Listo · F2
    - region "Resultados de productos":
      - text: Resultados
      - button "Frecuentes recientes"
      - button "Todos" [pressed]
      - paragraph: Selecciona una ubicación operativa antes de agregar productos. El inventario del POS nunca es global.
      - table "Productos disponibles en la ubicación operativa seleccionada":
        - caption: Productos disponibles en la ubicación operativa seleccionada
        - rowgroup:
          - row "Producto SKU Unidad Precio Existencia Acción":
            - columnheader "Producto"
            - columnheader "SKU"
            - columnheader "Unidad"
            - columnheader "Precio"
            - columnheader "Existencia"
            - columnheader "Acción"
        - rowgroup
    - region "Carrito y captura de cantidades":
      - heading "Carrito" [level=2]
      - text: 0 en carrito
      - paragraph: Agrega productos para iniciar una venta. Los carritos vacíos no se pueden confirmar.
    - group: Opciones de venta
    - region "Cliente de la venta":
      - textbox "Abrir selección de cliente"
      - button "Cliente Público general F4 Venta de contado"
    - region "Condición comercial":
      - paragraph: Condición
      - text: F7
      - radiogroup "Condición comercial":
        - radio "Contado" [checked]
        - radio "Crédito" [disabled]
      - status: Selecciona un cliente válido para habilitar crédito.
    - region "Resumen de pago":
      - textbox "Abrir captura de pagos"
      - button "Pago F6 Sin pagos aplicados Pagado $0.00 Pendiente $0.00 Cambio $0.00":
        - text: Pago F6 Sin pagos aplicados
        - term: Pagado
        - definition: $0.00
        - term: Pendiente
        - definition: $0.00
        - term: Cambio
        - definition: $0.00
    - region "Resumen de transacción y total":
      - region "Resumen de transacción":
        - button "Subtotal $0.00"
      - region "Total de la venta":
        - text: TOTAL 0 partidas
        - status: $0.00 Total en vivo
    - button "Confirmar venta Selecciona una ubicación operativa." [disabled]
- region "Notifications alt+T"
```

# Test source

```ts
  1   | import { expect, test, type Page, type Response } from "@playwright/test";
  2   | import {
  3   |   createBrowserPosOracle,
  4   |   type BrowserPosSnapshot,
  5   | } from "../../backend/test/browser-pos-oracle";
  6   | 
  7   | const authResponse = (action: string) => (response: Response) =>
  8   |   new URL(response.url()).pathname === `/api/auth/${action}` &&
  9   |   response.request().method() === "POST";
  10  | 
  11  | function apiResponse(path: string, method: string) {
  12  |   return (response: Response) =>
  13  |     new URL(response.url()).pathname === path &&
  14  |     response.request().method() === method;
  15  | }
  16  | 
  17  | async function login(page: Page) {
  18  |   const refresh = page.waitForResponse(authResponse("refresh"));
  19  |   await page.goto("/login");
  20  |   expect((await refresh).status()).toBe(401);
  21  |   await page
  22  |     .getByLabel("Correo", { exact: true })
  23  |     .fill(process.env.E2E_ADMIN_EMAIL!);
  24  |   await page.getByLabel(/^Contraseña/).fill(process.env.E2E_ADMIN_PASSWORD!);
  25  |   const response = page.waitForResponse(authResponse("login"));
  26  |   await page.getByRole("button", { name: "Entrar al sistema" }).click();
  27  |   expect((await response).status()).toBe(200);
  28  |   await expect(page).toHaveURL(/\/$/);
  29  | }
  30  | 
  31  | function expectDelta(before: BrowserPosSnapshot, after: BrowserPosSnapshot) {
  32  |   expect(after.saleCount - before.saleCount).toBe(1);
  33  |   expect(after.saleItemCount - before.saleItemCount).toBe(1);
  34  |   expect(after.paymentCount - before.paymentCount).toBe(1);
  35  |   expect(after.inventoryMovementCount - before.inventoryMovementCount).toBe(1);
  36  |   expect(after.inventoryBalancePieces).toBe(before.inventoryBalancePieces - 1);
  37  | }
  38  | 
  39  | test("POS cash sale can close its shift and daily close through the real stack", async ({
  40  |   page,
  41  | }) => {
  42  |   const oracle = await createBrowserPosOracle();
  43  |   const { fixture } = oracle;
  44  |   try {
  45  |     const before = await oracle.snapshot();
  46  |     expect(before.saleCount).toBe(0);
  47  |     expect(before.paymentCount).toBe(0);
  48  |     expect(before.inventoryMovementCount).toBe(0);
  49  |     expect(before.inventoryBalancePieces).toBe(fixture.initialStockPieces);
  50  |     expect(before.cashShiftStatus).toBe("OPEN");
  51  |     expect(before.cashShiftCountedTotal).toBeNull();
  52  |     expect(before.cashShiftDifferenceTotal).toBeNull();
  53  |     expect(before.dailyCloseStatus).toBe("DRAFT");
  54  | 
  55  |     // The browser gets the same device identity as the disposable terminal fixture.
  56  |     await page.addInitScript((deviceId) => {
  57  |       (
  58  |         globalThis as typeof globalThis & {
  59  |           localStorage: { setItem(key: string, value: string): void };
  60  |         }
  61  |       ).localStorage.setItem("pollos-pos-device-id", deviceId);
  62  |     }, fixture.deviceId);
  63  | 
  64  |     await login(page);
  65  |     await page
  66  |       .getByRole("navigation", { name: "Accesos por rol" })
  67  |       .getByRole("link", { name: "Ventas POS", exact: true })
  68  |       .click();
  69  |     await expect(page).toHaveURL(/\/sales$/);
  70  | 
  71  |     const search = page.getByLabel(
  72  |       "Búsqueda de productos por código de barras, SKU o nombre",
  73  |       { exact: true },
  74  |     );
  75  |     await expect(search).toBeVisible();
  76  |     const posLocation = page.getByLabel("Ubicación operativa", { exact: true });
> 77  |     await expect(posLocation).toBeVisible();
      |                               ^ Error: expect(locator).toBeVisible() failed
  78  |     await posLocation.selectOption(fixture.locationId);
  79  |     await expect(page.getByText(/turno abierto/i)).toBeVisible();
  80  | 
  81  |     await search.fill(fixture.productSku);
  82  |     const productResults = page.getByRole("region", {
  83  |       name: "Resultados de productos",
  84  |     });
  85  |     const productRow = productResults
  86  |       .getByRole("row")
  87  |       .filter({ hasText: fixture.productName });
  88  |     await expect(productRow).toBeVisible();
  89  |     await expect(productRow).toContainText("$12.00");
  90  |     await expect(
  91  |       productRow.getByRole("button", { name: "Agregar" }),
  92  |     ).toBeEnabled();
  93  |     await productRow.getByRole("button", { name: "Agregar" }).click();
  94  | 
  95  |     await expect(
  96  |       page.getByLabel(`Piezas capturadas de ${fixture.productName}`),
  97  |     ).toHaveValue("1");
  98  |     await expect(
  99  |       page.getByRole("region", { name: "Total de la venta" }),
  100 |     ).toContainText("$12.00");
  101 | 
  102 |     await page
  103 |       .getByRole("region", { name: "Resumen de pago" })
  104 |       .getByRole("button", { name: /Pago.*F6/ })
  105 |       .click();
  106 |     const exactCash = page.getByRole("button", {
  107 |       name: "Usar importe exacto de $12.00",
  108 |       exact: true,
  109 |     });
  110 |     await expect(exactCash).toBeVisible();
  111 |     await exactCash.click();
  112 |     await expect(
  113 |       page.getByRole("button", { name: /^Confirmar venta/ }),
  114 |     ).toBeEnabled();
  115 | 
  116 |     await page.getByRole("button", { name: /^Confirmar venta/ }).click();
  117 |     await expect(
  118 |       page.getByRole("button", { name: "Confirmar registro", exact: true }),
  119 |     ).toBeVisible();
  120 |     const saleResponse = page.waitForResponse(
  121 |       apiResponse("/api/sales", "POST"),
  122 |     );
  123 |     await page
  124 |       .getByRole("button", { name: "Confirmar registro", exact: true })
  125 |       .click();
  126 |     const createdSaleResponse = await saleResponse;
  127 |     expect(createdSaleResponse.status()).toBe(201);
  128 |     const createdSaleBody = (await createdSaleResponse.json()) as {
  129 |       data?: { sale?: { id?: string; saleNumber?: string } };
  130 |     };
  131 |     const saleNumber = createdSaleBody.data?.sale?.saleNumber;
  132 |     expect(saleNumber).toBeTruthy();
  133 | 
  134 |     await expect(
  135 |       page.getByRole("heading", { name: "Venta registrada", exact: true }),
  136 |     ).toBeVisible();
  137 |     await page
  138 |       .getByRole("button", { name: "Ir al historial", exact: true })
  139 |       .click();
  140 |     await expect(page).toHaveURL(/\/sales\/history$/);
  141 |     await expect(page.getByText(saleNumber!, { exact: true })).toBeVisible();
  142 |     await expect(
  143 |       page.getByRole("row").filter({ hasText: saleNumber! }),
  144 |     ).toContainText("Confirmada");
  145 | 
  146 |     await page
  147 |       .getByRole("link", { name: "Cierre diario", exact: true })
  148 |       .click();
  149 |     await expect(page).toHaveURL(/\/daily-close$/);
  150 |     await expect(
  151 |       page.getByRole("heading", {
  152 |         name: "Turnos y cierre diario",
  153 |         exact: true,
  154 |       }),
  155 |     ).toBeVisible();
  156 |     // Select this run's close explicitly so reruns on the same disposable DB
  157 |     // cannot accidentally operate on an older fixture.
  158 |     const runClose = page
  159 |       .getByRole("button")
  160 |       .filter({ hasText: fixture.locationName });
  161 |     await expect(runClose).toBeVisible();
  162 |     await runClose.click();
  163 | 
  164 |     const countedCash = page.getByLabel(
  165 |       `Efectivo contado de ${fixture.terminalName}`,
  166 |       { exact: true },
  167 |     );
  168 |     await expect(countedCash).toBeVisible();
  169 |     await countedCash.fill(fixture.salePrice.toFixed(2));
  170 |     const shiftCloseResponse = page.waitForResponse(
  171 |       apiResponse(`/api/cash-shifts/${fixture.cashShiftId}/close`, "PATCH"),
  172 |     );
  173 |     await page
  174 |       .getByRole("button", { name: "Cerrar turno", exact: true })
  175 |       .click();
  176 |     expect((await shiftCloseResponse).status()).toBe(200);
  177 |     await expect(countedCash).toHaveCount(0);
```