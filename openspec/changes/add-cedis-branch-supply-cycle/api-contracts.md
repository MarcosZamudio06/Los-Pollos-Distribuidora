# Contratos API: CEDIS-sucursal

La fuente canónica exacta es `specs/.specs/03-api/branch-supply-cycles-api.md`.

## Superficie CEDIS

| Método y ruta | Propósito | Permiso |
|---|---|---|
| `GET /api/cedis/branch-supply-cycles` | Listar por alcance | `cedis.view` |
| `POST /api/cedis/branch-supply-cycles` | Abrir ciclo `OPEN` | `cedis.dispatch` o `ADMIN` |
| `GET /api/cedis/branch-supply-cycles/:id` | Consultar detalle, transferencias y snapshots | `cedis.view` |
| `POST /api/cedis/branch-supply-cycles/:id/supplies` | Crear `REQUESTED` CEDIS → sucursal | `cedis.dispatch` |
| `POST /api/cedis/branch-supply-cycles/:id/returns` | Crear `REQUESTED` sucursal → CEDIS | `cedis.receive_returns` |
| `POST /api/cedis/branch-supply-cycles/:id/refresh` | Reconstruir snapshot/elegibilidad | `cedis.reconcile` |
| `POST /api/cedis/branch-supply-cycles/:id/cancel` | Cancelar ciclo elegible | `cedis.close` + `ADMIN` |

Todos los `POST` requieren `Idempotency-Key`. Los comandos sobre ciclo existente requieren `expectedVersion`. Suministro/devolución reciben `notes` e `items[]` con `productId`, `unit`, `quantityKg`, `quantityPieces` y `unitEquivalentId` opcional; no reciben ubicaciones.

## Contratos de inventario reutilizados

| Método y ruta | Comportamiento vinculado |
|---|---|
| `POST /api/inventory-transfers/:id/confirm` | Confirma recepción, valida ciclo/dirección/stock y genera salida/entrada atómicas. |
| `POST /api/inventory-transfers/:id/cancel` | Cancela `DRAFT`, `REQUESTED` o `IN_TRANSIT` con motivo; nunca `CONFIRMED`. |

Confirmar o cancelar una transferencia vinculada requiere `Idempotency-Key`, incrementa la versión del ciclo, lo devuelve a `OPEN` cuando corresponda e invalida la validación vigente de un cierre `DRAFT`.

## Refresh

- Solo transferencias `CONFIRMED` contribuyen a totales.
- Estados pendientes bloquean `READY_FOR_REVIEW`.
- Canceladas permanecen visibles con contribución cero.
- Integridad compara sumas de partidas y movimientos por transferencia, producto y dimensión.
- No confirma, cancela, revierte ni corrige fuentes.

## Errores

`BRANCH_SUPPLY_CYCLE_NOT_FOUND`, `BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS`, `BRANCH_SUPPLY_CYCLE_LOCATION_INVALID`, `BRANCH_SUPPLY_CYCLE_CLOSED`, `BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE`, `BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT`, `BRANCH_SUPPLY_CYCLE_TRANSFER_ALREADY_LINKED`, `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID`, `BRANCH_SUPPLY_CYCLE_HAS_PENDING_TRANSFERS`, `BRANCH_SUPPLY_CYCLE_INTEGRITY_ERROR`, `PRODUCT_INACTIVE`, `UNIT_MISMATCH`, `EQUIVALENCE_NOT_APPLICABLE`, `EQUIVALENCE_ROUNDING_POLICY_UNDEFINED`, `INSUFFICIENT_STOCK`, `LOCATION_NOT_AUTHORIZED`, `IDEMPOTENCY_CONFLICT`.
