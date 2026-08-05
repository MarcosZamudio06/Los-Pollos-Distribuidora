# Contratos API: CEDIS-sucursal

## Convenciones

- Prefijo: `/api/branch-supply-cycles`.
- Respuesta: `{ success, message, data }`.
- Comandos críticos requieren `Idempotency-Key`.
- La API no acepta `locationId` para reemplazar las ubicaciones derivadas del ciclo en comandos de traspaso.
- Importes monetarios, si aparecen en proyecciones futuras, usan strings canónicos de dos decimales. Kg y piezas conservan sus tipos físicos separados.

## Endpoints nuevos

### `GET /api/branch-supply-cycles`

Permisos: `branch_supply_cycles.read` y alcance por rol.

Query: `distributionCenterLocationId`, `branchLocationId`, `businessDate`, `dateFrom`, `dateTo`, `status`, `page`, `limit`.

`data.items[]` MUST incluir: `id`, ubicaciones, `businessDate`, `status`, `version`, `confirmedSupplyCount`, `confirmedReturnCount`, `pendingTransferCount`, `dailyCloseId`, `dailyCloseStatus`, `createdAt`, `updatedAt`.

### `GET /api/branch-supply-cycles/:id`

Permisos: lectura con alcance.

`data` MUST incluir:

- Encabezado del ciclo y ubicaciones.
- `transfers[]` con `id`, `transferNumber`, `kind`, dirección, estado, fechas, partidas y movimientos existentes.
- Resumen por producto: `supplied`, `returned`, `netSupplied` en kg/piezas.
- `dailyClose` relacionado y sus bloqueantes de ciclo, sin copiar totales de cierre.
- Historial de cierres cancelados y auditoría del ciclo cuando el rol esté autorizado.

### `POST /api/branch-supply-cycles`

Permisos: `ADMIN`, `WAREHOUSE` con `branch_supply_cycles.manage`.

Body:

```json
{
  "distributionCenterLocationId": "string",
  "branchLocationId": "string",
  "businessDate": "2026-08-04",
  "notes": "string opcional"
}
```

Valida ubicaciones, fecha, unicidad e idempotencia. Crea `OPEN` y enlaza un cierre `DRAFT` existente de la misma sucursal/fecha.

### `POST /api/branch-supply-cycles/:id/supply-transfers`

Permisos: gestión. Crea y vincula un traspaso CEDIS → sucursal en una transacción. Body: `notes`, `items[]` con `productId`, `unit`, `quantityKg`, `quantityPieces`.

### `POST /api/branch-supply-cycles/:id/returns`

Permisos: gestión. Crea y vincula un traspaso sucursal → CEDIS con el mismo detalle de partidas. No usa `InventoryAdjustment`.

### `POST /api/branch-supply-cycles/:id/transfers/:transferId`

Permisos: gestión. Body `{ "kind": "SUPPLY|RETURN", "version": 1 }`. Solo vincula `DRAFT` o `REQUESTED`, valida dirección exacta y no genera movimientos.

### `POST /api/branch-supply-cycles/:id/cancel`

Permiso: `branch_supply_cycles.cancel`, solo `ADMIN`. Body `{ "version": 1, "reason": "..." }`. Rechaza si hay cierre activo o transferencias no canceladas.

## Endpoints existentes extendidos

- `POST /api/inventory-transfers/:id/confirm`: conserva su contrato; si el traspaso está vinculado, valida ciclo, alcance y cierre.
- `POST /api/inventory-transfers/:id/cancel`: conserva su contrato; actualiza la elegibilidad del ciclo.
- `POST /api/point-of-sale-daily-closes`: enlaza ciclo por sucursal/fecha.
- `POST /api/point-of-sale-daily-closes/:id/validate`: incluye bloqueantes de ciclo.
- `PATCH /api/point-of-sale-daily-closes/:id/close`: completa ciclo en la misma transacción.
- `PATCH /api/point-of-sale-daily-closes/:id/reopen`: reactiva ciclo en la misma transacción.
- `GET /api/reports/dashboard`: agrega métricas derivadas de ciclos según rol.

### Extensión de `GET /api/reports/dashboard`

La respuesta existente conserva todos sus campos. `data` agrega únicamente proyecciones derivadas:

```json
{
  "activeSupplyCycles": 0,
  "completedSupplyCycles": 0,
  "branchesPendingDailyClose": 0,
  "pendingSupplyTransfers": 0,
  "pendingReturns": 0,
  "supplyCycleAlerts": []
}
```

`ADMIN` recibe el alcance global; `WAREHOUSE` recibe ciclos cuyo `distributionCenterLocationId` sea su ubicación; `SELLER` recibe ciclos cuya `branchLocationId` sea su ubicación. `COLLECTIONS`, `DRIVER` y `BILLING` no reciben estos campos ni pueden inferirlos desde otros reportes.

## Errores estables

`BRANCH_SUPPLY_CYCLE_NOT_FOUND`, `BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS`, `BRANCH_SUPPLY_CYCLE_LOCATION_INVALID`, `BRANCH_SUPPLY_CYCLE_LOCATION_MISMATCH`, `BRANCH_SUPPLY_CYCLE_TRANSFER_ALREADY_LINKED`, `BRANCH_SUPPLY_CYCLE_TRANSFER_PENDING`, `BRANCH_SUPPLY_CYCLE_SUPPLY_REQUIRED`, `BRANCH_SUPPLY_CYCLE_HAS_PENDING_TRANSFERS`, `BRANCH_SUPPLY_CYCLE_TRANSFER_INTEGRITY_ERROR`, `BRANCH_SUPPLY_CYCLE_DAILY_CLOSE_LOCKED`, `BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT`, `BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE`, `FORBIDDEN`, `LOCATION_NOT_AUTHORIZED`, `IDEMPOTENCY_CONFLICT`.
