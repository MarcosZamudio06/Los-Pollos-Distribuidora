# API — Ciclos de suministro CEDIS-sucursal

## Convenciones

- Prefijo: `/api/cedis/branch-supply-cycles`.
- Todos los `POST` requieren `Idempotency-Key` normalizada; el backend calcula y conserva el hash canónico del payload.
- Las respuestas siguen `api-conventions.md`.
- Las ubicaciones de cada traspaso se derivan del ciclo; el body no puede reemplazarlas.
- `expectedVersion` aplica control optimista. Una versión obsoleta responde `BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT`.

## GET /api/cedis/branch-supply-cycles

Propósito: listar ciclos dentro del alcance autorizado.

Query: `distributionCenterLocationId`, `branchLocationId`, `businessDate`, `status`, `page`, `limit`.

Respuesta `data.items[]`: identidad, ubicaciones, fecha, estado, versión, conteos confirmados/pendientes/cancelados, cierre relacionado y timestamps. Costos o utilidad requieren `cedis.view_costs`.

## POST /api/cedis/branch-supply-cycles

Body:

```json
{
  "distributionCenterLocationId": "string",
  "branchLocationId": "string",
  "businessDate": "2026-08-04",
  "notes": "string opcional"
}
```

Valida ubicaciones activas, jerarquía directa, alcance y unicidad por `branchLocationId + businessDate`. Crea `OPEN`, versión 1, y enlaza el cierre `DRAFT` coincidente si existe.

## GET /api/cedis/branch-supply-cycles/:id

Devuelve encabezado, ubicaciones, versión, eventos, último snapshot y transferencias agrupadas como `supplies[]` y `returns[]`. Cada transferencia incluye dirección, estado, partidas, movimientos y contribución física. Los productos inactivos históricos permanecen visibles.

## POST /api/cedis/branch-supply-cycles/:id/supplies

Requiere `cedis.dispatch`. Crea y vincula un `InventoryTransfer` `REQUESTED` con dirección CEDIS → sucursal.

Antes de crear la transferencia, el backend valida la disponibilidad no reservada
actual del origen por producto y dimensión. Si la cantidad solicitada supera el
disponible del CEDIS, responde `409 Conflict` con `code=INSUFFICIENT_STOCK`,
`findings[]` y no persiste transferencia, vínculo, evento ni reserva parcial. La
confirmación o recepción vuelve a validar el stock y consume la reserva de forma
atómica.

## POST /api/cedis/branch-supply-cycles/:id/returns

Requiere `cedis.receive_returns`. Crea y vincula un `InventoryTransfer` `REQUESTED` con dirección sucursal → CEDIS.

Body común:

```json
{
  "expectedVersion": 1,
  "notes": "string opcional",
  "items": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 25.5,
      "quantityPieces": 0,
      "unitEquivalentId": null
    }
  ]
}
```

Reglas:

- Debe existir al menos una partida y todos los productos deben estar activos.
- `KG` requiere kilos positivos y cero piezas.
- `PIECE` requiere piezas enteras positivas y cero kilos.
- `KG_AND_PIECE` acepta una o ambas cantidades medidas directamente.
- Solo se deriva una dimensión faltante con equivalencia `ACTIVE` aplicable a `businessDate` y política de redondeo aprobada. Mientras esa política siga abierta, la conversión automática se rechaza con `EQUIVALENCE_ROUNDING_POLICY_UNDEFINED`.
- Por producto y dimensión, la devolución no puede superar la cantidad no vendida del ciclo (`entregado - vendidoReal - devueltoConfirmado`) ni la disponibilidad física actual de la sucursal.
- Si se excede cualquiera de esos límites, responde `409 Conflict` con `code=RETURN_EXCEEDS_UNSOLD_QUANTITY` y no crea transferencia ni reserva.
- Crear transferencia, vínculo, evento y nueva versión del ciclo es atómico.
- Crear un suministro o devolución `REQUESTED` reserva en el origen dentro de la misma transacción.
- Si el ciclo estaba `READY_FOR_REVIEW`, una nueva operación permitida lo devuelve a `OPEN`.
- `CLOSED` y `CANCELLED` rechazan mutaciones.

## POST /api/cedis/branch-supply-cycles/:id/refresh

Requiere `cedis.reconcile` y body `{ "expectedVersion": 1 }`.

Reconstruye una nueva versión append-only desde las transferencias vinculadas. Solo `CONFIRMED` contribuye a suministros/devoluciones; `DRAFT`, `REQUESTED` e `IN_TRANSIT` son pendientes; `CANCELLED` aporta cero. Debe validar que los totales de partidas coincidan por producto y dimensión con `TRANSFER_OUT` y `TRANSFER_IN`.

Pasa a `READY_FOR_REVIEW` únicamente con al menos un suministro confirmado, cero pendientes e integridad válida. No confirma, cancela ni corrige transferencias.

La respuesta de refresh incluye la conciliación por producto y sus totales
monetarios y físicos. `actualSalesTotal` MUST provenir del cierre diario cuando
exista; pagos, movimientos de caja, gastos, mermas y diferencias se conservan
como fuentes de la versión calculada.

## POST /api/cedis/branch-supply-cycles/:id/close

Requiere `ADMIN`, `cedis.close` e `Idempotency-Key`. Body:

```json
{ "expectedVersion": 4 }
```

Solo acepta `READY_FOR_REVIEW`. Recalcula y bloquea si existen transferencias
pendientes, turnos abiertos, cierre diario distinto de `REVIEWED` o `CLOSED`,
cantidades negativas, diferencias obligatorias no autorizadas o snapshots de
precio/costo inválidos. Con un cierre diario `REVIEWED`, el comando pasa el
cierre diario y el ciclo a `CLOSED` dentro de la misma transacción. Al cerrar
incrementa ambas versiones, crea snapshots inmutables con hash y registra los
eventos `CLOSED` en la misma transacción.

## POST /api/cedis/branch-supply-cycles/:id/reopen

Requiere `ADMIN`, `cedis.close` e `Idempotency-Key`. Body:

```json
{ "expectedVersion": 5, "reason": "Corrección administrativa" }
```

Solo acepta `CLOSED`. Incrementa la versión, conserva todos los snapshots y
eventos anteriores, reabre el cierre diario relacionado a `DRAFT`, registra la
reapertura y devuelve el ciclo a `OPEN` sin revertir inventario, ventas, pagos
ni caja.

## POST /api/cedis/branch-supply-cycles/:id/cancel

Contrato complementario necesario para alcanzar `CANCELLED`. Requiere `ADMIN`, `cedis.close`, `expectedVersion` y motivo. Se rechaza si existe cierre no cancelado o cualquier transferencia no cancelada. No revierte inventario.

## GET /api/cedis/incoming-supplies

Propósito: listar los suministros CEDIS → sucursal de la fecha operativa para
recibirlos en la sucursal.

Permisos: `ADMIN`, `WAREHOUSE`, `SELLER` con `cedis.receive_supplies`.

Query: `businessDate`, `branchLocationId`, `status` (`PENDING` o `RECEIVED`),
`page`, `limit`.

La respuesta ordena primero los pendientes y después por `requestedAt`/`createdAt`
descendente. Cada elemento incluye folio, CEDIS, sucursal, ciclo, estado,
notas del despacho, partidas enviadas y, cuando exista, la recepción completa.
El alcance limita a `ADMIN`, al CEDIS del `WAREHOUSE` y a la sucursal del
`SELLER`.

## GET /api/cedis/incoming-supplies/:transferId

Devuelve el detalle del suministro y su recepción. Las cantidades enviadas son
de solo lectura; los costos requieren `cedis.view_costs`.

## POST /api/cedis/incoming-supplies/:transferId/receive

Requiere `cedis.receive_supplies` e `Idempotency-Key`.

Body:

```json
{
  "expectedCycleVersion": 2,
  "notes": "Se recibió un bulto abierto",
  "items": [
    {
      "transferItemId": "string",
      "quantityKg": 24.5,
      "quantityPieces": 0
    }
  ]
}
```

Validaciones:

- Solo acepta transferencias vinculadas con rol `SUPPLY` en estado `REQUESTED`
  o `IN_TRANSIT` y ciclos no cerrados ni cancelados.
- Todas las partidas del suministro deben aparecer exactamente una vez.
- Las cantidades recibidas son no negativas, respetan la unidad y las piezas
  son enteras.
- La nota es obligatoria cuando alguna diferencia no es cero.
- La operación es transaccional: recepción, confirmación de salida, entrada
  recibida, diferencia de tránsito, versión del ciclo y evento se persisten juntos.
- La salida del CEDIS usa lo enviado; la entrada de la sucursal usa lo recibido.
- La confirmación consume la reserva del origen exactamente una vez.
- Un faltante o sobrante queda exclusivamente en los campos `sent*`, `received*`
  y `difference*` de `BranchSupplyReceiptItem`; no crea un movimiento físico
  adicional sobre la sucursal.
- La conciliación usa lo recibido como cantidad entregada y excluye marcadores
  históricos `SHRINKAGE`/`IN` referenciados a una recepción.
- Repetir la misma clave y payload devuelve el resultado original; cambiar el
  payload responde `IDEMPOTENCY_CONFLICT`.
- Una versión obsoleta responde `BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT`.

## Comandos de inventario reutilizados

- `POST /api/inventory-transfers/:id/confirm`: confirma devoluciones `RETURN` hacia CEDIS. Los suministros `SUPPLY` se confirman exclusivamente mediante `POST /api/cedis/incoming-supplies/:transferId/receive`, que registra la recepción y genera ambos movimientos en una transacción.
- `POST /api/inventory-transfers/:id/cancel`: cancela `DRAFT`, `REQUESTED` o `IN_TRANSIT` con motivo. Nunca cancela `CONFIRMED`.
- Confirmar o cancelar una transferencia vinculada requiere `Idempotency-Key`, aunque el comando genérico mantenga compatibilidad para transferencias no vinculadas.
- Confirmar o cancelar una transferencia vinculada devuelve el ciclo a `OPEN`, incrementa su versión e invalida una validación vigente del cierre `DRAFT`.

## Idempotencia y concurrencia

- La identidad efectiva usa namespace de operación y recurso: `cedis:{operation}:{resource}:{key}`.
- Misma clave y payload devuelve el resultado original; payload distinto responde `IDEMPOTENCY_CONFLICT`.
- Las mutaciones usan transacciones `Serializable`, restricción única para ciclo activo, vínculo único por transferencia y actualización por `expectedVersion`.
- Conflictos serializables pueden reintentarse de forma limitada con la misma clave; al agotarse responden conflicto reintentable sin cambios parciales.
- Confirmar stock usa decremento condicional por producto, ubicación, KG y PIECE; nunca permite saldo negativo.
- Cancelar stock libera la reserva del origen por producto, ubicación, KG y PIECE; nunca permite reserva negativa.

## Errores estables

`BRANCH_SUPPLY_CYCLE_NOT_FOUND`, `BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS`, `BRANCH_SUPPLY_CYCLE_LOCATION_INVALID`, `BRANCH_SUPPLY_CYCLE_CLOSED`, `BRANCH_SUPPLY_CYCLE_NOT_READY`, `BRANCH_SUPPLY_CYCLE_NOT_CLOSED`, `BRANCH_SUPPLY_CYCLE_CLOSING_BLOCKED`, `BRANCH_SUPPLY_CYCLE_REFRESH_REQUIRED`, `BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE`, `BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT`, `BRANCH_SUPPLY_CYCLE_CONCURRENCY_CONFLICT`, `BRANCH_SUPPLY_CYCLE_TRANSFER_ALREADY_LINKED`, `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID`, `BRANCH_SUPPLY_CYCLE_HAS_PENDING_TRANSFERS`, `BRANCH_SUPPLY_CYCLE_INTEGRITY_ERROR`, `INVENTORY_RESERVATION_INTEGRITY_ERROR`, `INVENTORY_CONCURRENCY_CONFLICT`, `PRODUCT_INACTIVE`, `UNIT_MISMATCH`, `EQUIVALENCE_NOT_APPLICABLE`, `EQUIVALENCE_ROUNDING_POLICY_UNDEFINED`, `INSUFFICIENT_STOCK`, `LOCATION_NOT_AUTHORIZED`, `IDEMPOTENCY_CONFLICT`, `BRANCH_SUPPLY_RECEIPT_ALREADY_EXISTS`, `BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED`, `BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID`, `BRANCH_SUPPLY_RECEIPT_NOTE_REQUIRED`.
