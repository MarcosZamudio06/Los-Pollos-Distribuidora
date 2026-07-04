### TASK-062 — Implementar UI de compras

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-033
- TASK-061

Specs requeridos:

```text
specs/.specs/04-ui/purchases.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/compras/spec.md
specs/modules/inventory/spec.md
specs/.specs/03-api/purchases-api.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/locations-api.md
```

Relación resultado esperado ↔ specs:

- `purchases.md` define pantallas, formulario, detalle, proveedor, ubicación, items y cancelación.
- `ui-guidelines.md` define estados, componentes y permisos.
- `compras/spec.md` e `inventory/spec.md` aportan reglas de compra e inventario receptor.
- `purchases-api.md`, `inventory-api.md` y `locations-api.md` son los contratos consumidos por la UI.

Entregables:

- PurchasesPage.
- PurchaseFormPage.
- SupplierSelector.
- PurchaseLocationSelector.
- PurchaseItemsTable.
- PurchaseDetailPage.
- CancelPurchaseDialog.
---
- Toda UI agregada debe de ser en correcto y perfecto en español. NO en Inglés
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.